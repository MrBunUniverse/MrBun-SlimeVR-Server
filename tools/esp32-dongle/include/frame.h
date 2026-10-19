// Serial framing shared by the dongle firmware and its host test.
// Must match encode()/Decoder in bridge.py byte for byte.
//
// Raw frame: type u8 | ip[4] | port u16 LE | payload | crc16 LE (CCITT-FALSE over everything before it)
// On the wire each raw frame is SLIP-escaped and wrapped in END bytes, so a reader
// that joins mid-stream (boot log noise, a dropped byte) resyncs at the next END.
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace frame {

constexpr uint8_t END = 0xC0, ESC = 0xDB, ESC_END = 0xDC, ESC_ESC = 0xDD;
constexpr uint8_t FROM_TRACKER = 1, TO_TRACKER = 2, STATUS = 3;
constexpr size_t HEADER = 7, MAX_PAYLOAD = 1472, MAX_RAW = HEADER + MAX_PAYLOAD + 2;
constexpr size_t MAX_WIRE = 2 * MAX_RAW + 2;

inline uint16_t crc16(const uint8_t *d, size_t n) {
	uint16_t c = 0xFFFF;
	while (n--) {
		c ^= (uint16_t)(*d++) << 8;
		for (int i = 0; i < 8; i++) c = (c & 0x8000) ? (uint16_t)((c << 1) ^ 0x1021) : (uint16_t)(c << 1);
	}
	return c;
}

// Writes one wire frame into out (MAX_WIRE bytes) and returns its length, or 0 if the payload is too big.
inline size_t encode(uint8_t type, const uint8_t ip[4], uint16_t port, const uint8_t *payload, size_t len, uint8_t *out) {
	if (len > MAX_PAYLOAD) return 0;
	uint8_t raw[MAX_RAW];
	raw[0] = type;
	for (int i = 0; i < 4; i++) raw[1 + i] = ip[i];
	raw[5] = port & 0xFF;
	raw[6] = port >> 8;
	for (size_t i = 0; i < len; i++) raw[HEADER + i] = payload[i];
	size_t n = HEADER + len;
	uint16_t c = crc16(raw, n);
	raw[n++] = c & 0xFF;
	raw[n++] = c >> 8;

	size_t o = 0;
	out[o++] = END;
	for (size_t i = 0; i < n; i++) {
		if (raw[i] == END) { out[o++] = ESC; out[o++] = ESC_END; }
		else if (raw[i] == ESC) { out[o++] = ESC; out[o++] = ESC_ESC; }
		else out[o++] = raw[i];
	}
	out[o++] = END;
	return o;
}

struct Decoder {
	uint8_t buf[MAX_RAW];
	size_t n = 0;
	bool esc = false, overflow = false;
	uint32_t badFrames = 0;

	// Feed one byte. Returns the payload length when a valid frame ends here, -1 otherwise.
	int feed(uint8_t b) {
		if (b == END) {
			int r = -1;
			if (n > 0) {
				bool ok = !overflow && n >= HEADER + 2 && crc16(buf, n - 2) == (uint16_t)(buf[n - 2] | buf[n - 1] << 8);
				if (ok) r = (int)(n - HEADER - 2);
				else badFrames++;
			}
			n = 0;
			esc = overflow = false;
			return r;
		}
		if (esc) {
			b = b == ESC_END ? END : b == ESC_ESC ? ESC : b;
			esc = false;
		} else if (b == ESC) {
			esc = true;
			return -1;
		}
		if (n < MAX_RAW) buf[n++] = b;
		else overflow = true;
		return -1;
	}

	uint8_t type() const { return buf[0]; }
	const uint8_t *ip() const { return buf + 1; }
	uint16_t port() const { return (uint16_t)(buf[5] | buf[6] << 8); }
	const uint8_t *payload() const { return buf + HEADER; }
};

} // namespace frame
