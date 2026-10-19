// SlimeVR USB dongle: the ESP32 hosts the tracker Wi-Fi (access point only, no uplink)
// and relays the trackers' UDP over USB serial to bridge.py on the Mac.
// Trackers keep their existing Wi-Fi settings, because the SSID matches the old NAT router.
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <esp_wifi.h>

#include "frame.h"

#ifndef DONGLE_SSID
#define DONGLE_SSID "SirJameVR ESP"
#endif
#ifndef DONGLE_CHANNEL
#define DONGLE_CHANNEL 6
#endif
#ifndef DONGLE_BAUD
#define DONGLE_BAUD 921600
#endif

static const uint16_t SLIME_PORT = 6969;

static WiFiUDP udp;
static frame::Decoder rx;
static uint8_t pkt[frame::MAX_PAYLOAD];
static uint8_t wire[frame::MAX_WIRE];
static uint32_t up, down, upDropped, lastStatus;

// Times the server's pings (packet type 10) over the Wi-Fi leg only, from sending one to
// a tracker until its pong arrives. bridge.py's rtt minus this is the USB + bridge leg.
struct PendingPing {
	uint8_t host;
	uint8_t id[4];
	uint32_t sentUs;
};
static PendingPing pending[16];
static uint32_t wifiRttSumUs, wifiRttMaxUs, wifiRttCount;

static bool isPing(const uint8_t *p, size_t n) {
	return n >= 16 && p[0] == 0 && p[1] == 0 && p[2] == 0 && p[3] == 10;
}

static void notePingSent(uint8_t host, const uint8_t *p) {
	PendingPing &slot = pending[host % 16];
	slot.host = host;
	memcpy(slot.id, p + 12, 4);
	slot.sentUs = micros();
}

static void notePong(uint8_t host, const uint8_t *p) {
	PendingPing &slot = pending[host % 16];
	if (slot.sentUs == 0 || slot.host != host || memcmp(slot.id, p + 12, 4) != 0) return;
	uint32_t rtt = micros() - slot.sentUs;
	slot.sentUs = 0;
	wifiRttSumUs += rtt;
	wifiRttCount++;
	if (rtt > wifiRttMaxUs) wifiRttMaxUs = rtt;
}

static void sendFrame(uint8_t type, const uint8_t ip[4], uint16_t port, const uint8_t *p, size_t n) {
	size_t len = frame::encode(type, ip, port, p, n, wire);
	// A full USB queue drops the packet instead of stalling the radio; trackers resend constantly anyway.
	if (len == 0 || Serial.availableForWrite() < (int)len) {
		upDropped++;
		return;
	}
	Serial.write(wire, len);
}

void setup() {
	Serial.setRxBufferSize(8192);
	Serial.setTxBufferSize(8192);
	Serial.begin(DONGLE_BAUD);

	WiFi.mode(WIFI_AP);
	WiFi.softAP(DONGLE_SSID, nullptr, DONGLE_CHANNEL, 0, 10);
	esp_wifi_set_ps(WIFI_PS_NONE);
	udp.begin(SLIME_PORT);
}

void loop() {
	// Tracker -> Mac. Trackers learn 192.168.4.1:6969 as "the server" from our replies.
	while (udp.parsePacket() > 0) {
		IPAddress ip = udp.remoteIP();
		uint8_t a[4] = {ip[0], ip[1], ip[2], ip[3]};
		int n = udp.read(pkt, sizeof pkt);
		if (n > 0) {
			if (isPing(pkt, n)) notePong(a[3], pkt);
			sendFrame(frame::FROM_TRACKER, a, udp.remotePort(), pkt, n);
			up++;
		}
	}

	// Mac -> tracker.
	while (Serial.available()) {
		int len = rx.feed((uint8_t)Serial.read());
		if (len >= 0 && rx.type() == frame::TO_TRACKER) {
			const uint8_t *a = rx.ip();
			if (isPing(rx.payload(), len)) notePingSent(a[3], rx.payload());
			udp.beginPacket(IPAddress(a[0], a[1], a[2], a[3]), rx.port());
			udp.write(rx.payload(), len);
			udp.endPacket();
			down++;
		}
	}

	if (millis() - lastStatus >= 2000) {
		lastStatus = millis();
		char s[192];
		int n = snprintf(s, sizeof s, "up=%lu down=%lu dropped=%lu bad_frames=%lu clients=%d heap=%lu wifi_rtt_ms=%lu/%lu (avg/max, n=%lu)",
			(unsigned long)up, (unsigned long)down, (unsigned long)upDropped, (unsigned long)rx.badFrames,
			WiFi.softAPgetStationNum(), (unsigned long)ESP.getFreeHeap(),
			(unsigned long)(wifiRttCount ? wifiRttSumUs / wifiRttCount / 1000 : 0), (unsigned long)(wifiRttMaxUs / 1000),
			(unsigned long)wifiRttCount);
		wifiRttSumUs = wifiRttMaxUs = wifiRttCount = 0;
		uint8_t none[4] = {0, 0, 0, 0};
		sendFrame(frame::STATUS, none, 0, (const uint8_t *)s, n);
	}
}
