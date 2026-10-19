# ESP32 USB dongle for SlimeVR

This turns the ESP32 NAT router into a tracker receiver on a USB cable, so the Mac's Wi-Fi can stay on 5 GHz with the Quest.

```
trackers --2.4 GHz--> ESP32 (access point only) --USB serial--> bridge.py --UDP--> SlimeVR server (localhost:6969)
```

The ESP32 keeps the `SirJameVR ESP` network name, so the trackers need no changes. It has no internet uplink any more.

## Use

1. Flash the ESP32 once: `pio run -t upload` in this folder.
2. Start the SlimeVR server.
3. Start the bridge, using a Python that has pyserial:
   `/Library/Frameworks/Python.framework/Versions/3.14/bin/python3 bridge.py`
4. Join the Mac's Wi-Fi to the house 5 GHz network.

The bridge prints `esp32: up=… down=… dropped=… bad_frames=… clients=…` every 2 seconds.

- **`dropped` keeps rising:** the USB link is too slow for the trackers.
- **`bad_frames` keeps rising:** bytes are being corrupted, usually by a cable or hub.

For either one, change the baud in **both** places: `DONGLE_BAUD` in `platformio.ini` and `--baud` on the bridge, then reflash.

Measured on the first board (CH340 USB chip) with six trackers, on 2026-10-17:

| Baud | Link load | Full round trip (median) | Wi-Fi leg | USB + bridge | Bad frames |
|---|---|---|---|---|---|
| 460800 | 37% | 55 ms | 18 ms | 37 ms | 0% |
| 921600 | n/a | n/a | n/a | n/a | 100% |
| 2000000 (default) | 9% | 40 ms | 16 ms | 24 ms | 1.1% |

Even at 9% load, the USB path adds about 24 ms. The CH340 and its macOS driver hold bytes before passing them on. A board with native USB, such as the ESP32-S3 or C3, avoids that chip entirely.

The status line's `wifi_rtt_ms` is timed on the ESP32 itself, and the bridge's `link_in` shows how much of the serial link is in use. A `trackers:` line every 10 s shows each tracker's packet rate and ping.

The bridge also prints `rtt_ms=min/avg/max`, timed from the server's own pings. That's the round trip over USB and Wi-Fi; SlimeVR shows half of it as "ping". On 2026-10-17, with one tracker, the median round trip was 16 ms with spikes up to 226 ms on channel 6, the busiest nearby. On channel 1 it was 13 ms with a worst case of 49 ms. If spikes come back, scan for a quieter channel and change `DONGLE_CHANNEL`.

One tracker measured about 5 packets/s at rest and about 70/s while moving, with no drops at 460800.

## Restore the old NAT router

Run `firmware_backups/restore_slime_router.sh` in the main checkout. It writes the full flash backup taken on 2026-10-17.

## Check

`python3 bridge.py --self-test` checks the framing round trip and corruption handling. It also checks that the firmware's C++ `frame.h` produces the same bytes as the Python version.

## Limits

The server sees every tracker at `127.0.0.1`, so anything that connects back to a tracker's own IP address won't reach it. That includes over-the-air firmware updates. Flash trackers over USB, or restore the NAT router for updates.
