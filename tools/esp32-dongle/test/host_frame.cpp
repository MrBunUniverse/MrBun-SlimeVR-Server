// Host-side check that frame.h matches bridge.py. Run through `bridge.py --self-test`.
//   host_frame encode            -> prints the wire hex of the fixed test frame
//   host_frame decode <wirehex>  -> prints "type ip port payloadhex" for each valid frame
#include <stdio.h>
#include <string.h>

#include "../include/frame.h"

static const uint8_t IP[4] = {192, 168, 4, 2};
static const uint8_t PAYLOAD[] = {0x00, 0xC0, 0x01, 0xDB, 0xDC, 0xFF};

int main(int argc, char **argv) {
	if (argc == 2 && !strcmp(argv[1], "encode")) {
		uint8_t out[frame::MAX_WIRE];
		size_t n = frame::encode(frame::FROM_TRACKER, IP, 51234, PAYLOAD, sizeof PAYLOAD, out);
		for (size_t i = 0; i < n; i++) printf("%02x", out[i]);
		printf("\n");
		return 0;
	}
	if (argc == 3 && !strcmp(argv[1], "decode")) {
		frame::Decoder d;
		for (const char *h = argv[2]; h[0] && h[1]; h += 2) {
			unsigned b;
			sscanf(h, "%2x", &b);
			int len = d.feed((uint8_t)b);
			if (len < 0) continue;
			printf("%u %u.%u.%u.%u %u ", d.type(), d.ip()[0], d.ip()[1], d.ip()[2], d.ip()[3], d.port());
			for (int i = 0; i < len; i++) printf("%02x", d.payload()[i]);
			printf("\n");
		}
		printf("bad=%u\n", (unsigned)d.badFrames);
		return 0;
	}
	return 2;
}
