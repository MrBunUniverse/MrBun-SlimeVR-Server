#!/usr/bin/env python3
"""Bridge between the ESP32 USB dongle and the SlimeVR server.

Frames from the dongle (see include/frame.h) become UDP packets to the server on
localhost. Each tracker gets its own local socket, so the server, which tells
trackers apart by address and port, still sees one connection per tracker.
Server replies on that socket go back down the serial link to the same tracker.

Run:  python3 bridge.py [--port /dev/cu.usbserial-1110] [--baud 2000000]
Test: python3 bridge.py --self-test
"""
import argparse
import glob
import json
import os
import re
import selectors
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

END, ESC, ESC_END, ESC_ESC = 0xC0, 0xDB, 0xDC, 0xDD
FROM_TRACKER, TO_TRACKER, STATUS = 1, 2, 3
HEADER = 7
# The ESP32 sends a status frame every 2 s, so this long without a single byte means it hung or
# the USB link stalled. Reset it and reopen the port instead of sitting there silently.
STALL_S = 6


def crc16(data):
    c = 0xFFFF
    for b in data:
        c ^= b << 8
        for _ in range(8):
            c = ((c << 1) ^ 0x1021) & 0xFFFF if c & 0x8000 else (c << 1) & 0xFFFF
    return c


def encode(kind, ip, port, payload):
    raw = struct.pack("<B4sH", kind, ip, port) + payload
    raw += struct.pack("<H", crc16(raw))
    return b"\xc0" + raw.replace(b"\xdb", b"\xdb\xdd").replace(b"\xc0", b"\xdb\xdc") + b"\xc0"


class Decoder:
    def __init__(self):
        self.buf = bytearray()
        self.esc = False
        self.bad_frames = 0

    def feed(self, data):
        """Yields (kind, ip bytes, port, payload) for every valid frame in data."""
        for b in data:
            if b == END:
                buf, self.buf, self.esc = self.buf, bytearray(), False
                if not buf:
                    continue
                if len(buf) < HEADER + 2 or crc16(buf[:-2]) != struct.unpack("<H", buf[-2:])[0]:
                    self.bad_frames += 1
                    continue
                kind, ip, port = struct.unpack("<B4sH", buf[:HEADER])
                yield kind, bytes(ip), port, bytes(buf[HEADER:-2])
            elif self.esc:
                self.buf.append(END if b == ESC_END else ESC if b == ESC_ESC else b)
                self.esc = False
            elif b == ESC:
                self.esc = True
            else:
                self.buf.append(b)


def ping_id(payload):
    """The id of a SlimeVR ping/pong packet (type 10: type i32, number i64, id i32), else None."""
    if len(payload) >= 16 and payload[:4] == b"\x00\x00\x00\x0a":
        return payload[12:16]
    return None


STATS_PORT = 6970
HICCUP_MS = 750  # the server pings every 500 ms, so a tracker that is alive is never quiet this long
SPIKE_MS = 100  # round trip above this is logged as a spike
SNAPSHOT = {}  # latest stats, swapped whole by the bridge loop and served to the GUI


class StatsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(SNAPSHOT).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def serve_stats():
    try:
        ThreadingHTTPServer(("127.0.0.1", STATS_PORT), StatsHandler).serve_forever()
    except OSError as e:  # port taken: the bridge itself must keep working
        print(f"bridge: stats server off ({e})", flush=True)


def parse_esp32(text):
    """'up=1 down=2 wifi_rtt_ms=3/9 (avg/max, n=4)' -> {'up': 1, 'down': 2, 'wifi_rtt_ms': '3/9'}"""
    out = {}
    for k, v in re.findall(r"(\w+)=(\S+)", text):
        out[k] = int(v) if v.lstrip("-").isdigit() else v
    return out


def run(port, baud, server):
    global SNAPSHOT
    import serial  # pyserial; only needed for the real bridge, not the self-test

    # Opening the port can reset the board, so it stays open for the whole session.
    ser = serial.Serial(port, baud, timeout=0)
    sel = selectors.DefaultSelector()
    sel.register(ser, selectors.EVENT_READ, None)
    last_rx = time.monotonic()  # last time any byte arrived from the ESP32

    def reset_dongle():
        """Close, reopen and pulse EN (RTS) so the ESP32 reboots; waits if the cable is out."""
        nonlocal ser, last_rx
        try:
            sel.unregister(ser)
        except (KeyError, ValueError):
            pass
        try:
            ser.close()
        except Exception:
            pass
        while True:
            try:
                ser = serial.Serial(port, baud, timeout=0)
                ser.dtr, ser.rts = False, True  # boards with auto-reset wiring: RTS low holds EN down
                time.sleep(0.1)
                ser.rts = False
                sel.register(ser, selectors.EVENT_READ, None)
                break
            except (serial.SerialException, OSError):
                time.sleep(2)  # unplugged: keep trying until it is back
        dec.buf, dec.esc = bytearray(), False
        last_rx = time.monotonic()
    trackers = {}  # (ip, port) -> socket
    dec = Decoder()
    resets = 0
    up = down = serial_in = 0
    # The server pings each tracker every 500 ms. Timing those pings here gives the
    # round trip over USB + Wi-Fi; the server's own "ping" figure is half of it.
    pings, rtts = {}, []  # (tracker, ping id) -> send time; round trips in ms since the last print
    per_tracker = {}  # tracker -> [round trips], packets up; printed every 10 s to spot one bad tracker
    last_print = last_detail = last_pub = time.monotonic()
    live, events, esp32, link_in = {}, [], {}, 0  # live: tracker -> stats for the GUI
    threading.Thread(target=serve_stats, daemon=True).start()

    def event(tracker, kind, value):
        events.append({"t": time.time(), "tracker": tracker[0][3], "kind": kind, "ms": round(value)})
        del events[:-30]

    print(f"bridge: {port} @ {baud} -> {server[0]}:{server[1]}", flush=True)

    while True:
        for key, _ in sel.select(1.0):
            if key.data is None:
                try:
                    chunk = ser.read(ser.in_waiting or 1)
                except (serial.SerialException, OSError):
                    print("bridge: serial read failed, reopening the dongle", flush=True)
                    reset_dongle()
                    continue
                if chunk:
                    last_rx = time.monotonic()
                serial_in += len(chunk)
                for kind, ip, tport, payload in dec.feed(chunk):
                    if kind == FROM_TRACKER:
                        sock = trackers.get((ip, tport))
                        if sock is None:
                            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                            sock.bind(("127.0.0.1", 0))
                            sock.setblocking(False)
                            trackers[(ip, tport)] = sock
                            sel.register(sock, selectors.EVENT_READ, (ip, tport))
                            print(f"bridge: new tracker {socket.inet_ntoa(ip)}:{tport}", flush=True)
                        sock.sendto(payload, server)
                        up += 1
                        now = time.monotonic()
                        lt = live.setdefault((ip, tport), {"last": now, "n": 0, "gap": 0, "hiccups": 0, "spikes": 0, "rtts": [], "total": 0})
                        gap = (now - lt["last"]) * 1000
                        lt["last"], lt["n"], lt["total"], lt["gap"] = now, lt["n"] + 1, lt["total"] + 1, max(lt["gap"], gap)
                        if gap > HICCUP_MS:
                            lt["hiccups"] += 1
                            event((ip, tport), "hiccup", gap)
                        stats = per_tracker.setdefault((ip, tport), [[], 0])
                        stats[1] += 1
                        sent = pings.pop(((ip, tport), ping_id(payload)), None)
                        if sent is not None:
                            rtts.append((time.monotonic() - sent) * 1000)
                            stats[0].append(rtts[-1])
                            lt["rtts"].append(rtts[-1])
                            if rtts[-1] > SPIKE_MS:
                                lt["spikes"] += 1
                                event((ip, tport), "spike", rtts[-1])
                    elif kind == STATUS:
                        text = payload.decode(errors="replace")
                        esp32 = parse_esp32(text)
                        print(f"esp32: {text}", flush=True)
            else:
                ip, tport = key.data
                try:
                    payload = key.fileobj.recv(2048)
                except BlockingIOError:
                    continue
                pid = ping_id(payload)
                if pid is not None:
                    if len(pings) > 1000:  # unanswered pings from trackers that went away
                        pings.clear()
                    pings[((ip, tport), pid)] = time.monotonic()
                try:
                    ser.write(encode(TO_TRACKER, ip, tport, payload))
                except (serial.SerialException, OSError):
                    print("bridge: serial write failed, reopening the dongle", flush=True)
                    reset_dongle()
                    continue
                down += 1

        if time.monotonic() - last_rx > STALL_S:
            resets += 1
            print(f"bridge: nothing from the ESP32 for {STALL_S}s, resetting it (reset #{resets})", flush=True)
            reset_dongle()

        if time.monotonic() - last_print >= 2:
            # Share of the serial link's capacity (10 bits per byte on the wire) used by ESP32 -> Mac traffic.
            link_in = 100 * serial_in * 10 / baud / (time.monotonic() - last_print)
            load = f" link_in={link_in:.0f}%"
            serial_in = 0
            last_print = time.monotonic()
            rtt = f" rtt_ms={min(rtts):.0f}/{sum(rtts) / len(rtts):.0f}/{max(rtts):.0f} (min/avg/max, n={len(rtts)})" if rtts else ""
            rtts = []
            print(f"bridge: up={up} down={down} trackers={len(trackers)} bad_frames={dec.bad_frames}{load}{rtt}", flush=True)

        if time.monotonic() - last_pub >= 1:
            now = time.monotonic()
            secs, last_pub = now - last_pub, now
            rows = []
            for (ip, _), lt in sorted(live.items()):
                rs = lt["rtts"]
                rows.append({
                    "id": ip[3], "ip": socket.inet_ntoa(ip), "pps": round(lt["n"] / secs, 1), "total": lt["total"],
                    "age_ms": round((now - lt["last"]) * 1000), "gap_max_ms": round(lt["gap"]),
                    "rtt_min": round(min(rs)) if rs else None, "rtt_avg": round(sum(rs) / len(rs)) if rs else None,
                    "rtt_max": round(max(rs)) if rs else None, "hiccups": lt["hiccups"], "spikes": lt["spikes"],
                })
                lt["n"], lt["gap"], lt["rtts"] = 0, 0, []
            SNAPSHOT = {"time": time.time(), "port": port, "baud": baud, "up": up, "down": down,
                                     "bad_frames": dec.bad_frames, "link_in": round(link_in), "esp32": esp32,
                                     "trackers": rows, "events": list(events)}

        if time.monotonic() - last_detail >= 10:
            secs, last_detail = time.monotonic() - last_detail, time.monotonic()
            parts = []
            for (ip, _), (rs, n) in sorted(per_tracker.items()):
                r = f"{min(rs):.0f}/{sum(rs) / len(rs):.0f}/{max(rs):.0f}ms" if rs else "no pongs"
                parts.append(f".{ip[3]} {n / secs:.0f}pkt/s {r}")
            per_tracker = {}
            print("trackers: " + " | ".join(parts), flush=True)


def self_test():
    ip, port, payload = bytes([192, 168, 4, 2]), 51234, bytes([0x00, 0xC0, 0x01, 0xDB, 0xDC, 0xFF])
    wire = encode(FROM_TRACKER, ip, port, payload)

    # Round trip, with leading noise (like the ESP32 boot log) and a corrupted frame that must be dropped.
    corrupt = bytearray(encode(TO_TRACKER, ip, port, b"hello"))
    corrupt[4] ^= 0x01
    dec = Decoder()
    frames = list(dec.feed(b"ets Jun  8 2016 boot\r\n" + wire + bytes(corrupt) + wire))
    assert frames == [(FROM_TRACKER, ip, port, payload)] * 2, frames
    assert dec.bad_frames == 2, dec.bad_frames  # the boot noise plus the corrupted frame

    ping = b"\x00\x00\x00\x0a" + bytes(8) + b"\x12\x34\x56\x78"
    assert ping_id(ping) == b"\x12\x34\x56\x78" and ping_id(b"\x00\x00\x00\x01" + bytes(12)) is None

    # Cross-check against the C++ framing the firmware uses.
    here = os.path.dirname(os.path.abspath(__file__))
    with tempfile.TemporaryDirectory() as tmp:
        exe = os.path.join(tmp, "host_frame")
        subprocess.run(["c++", "-std=c++17", "-O1", "-o", exe, os.path.join(here, "test", "host_frame.cpp")], check=True)
        cpp_wire = subprocess.run([exe, "encode"], capture_output=True, text=True, check=True).stdout.strip()
        assert cpp_wire == wire.hex(), (cpp_wire, wire.hex())
        out = subprocess.run([exe, "decode", (wire + bytes(corrupt)).hex()], capture_output=True, text=True, check=True).stdout
        assert out == f"1 192.168.4.2 {port} {payload.hex()}\nbad=1\n", out
    print("self-test ok")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", help="serial port (default: first /dev/cu.usbserial* or /dev/cu.usbmodem*)")
    ap.add_argument("--baud", type=int, default=2000000, help="must match DONGLE_BAUD in platformio.ini")
    ap.add_argument("--server", default="127.0.0.1:6969")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        return self_test()
    port = args.port or next(iter(sorted(glob.glob("/dev/cu.usbserial*") + glob.glob("/dev/cu.usbmodem*"))), None)
    if not port:
        sys.exit("No dongle found. Plug in the ESP32 or pass --port.")
    host, _, sport = args.server.rpartition(":")
    try:
        run(port, args.baud, (host, int(sport)))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
