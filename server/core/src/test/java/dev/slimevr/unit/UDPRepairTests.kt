package dev.slimevr.unit

import dev.slimevr.tracking.trackers.Tracker
import dev.slimevr.tracking.trackers.TrackerPosition
import dev.slimevr.tracking.trackers.udp.IMUType
import dev.slimevr.tracking.trackers.udp.SensorConfig
import dev.slimevr.tracking.trackers.udp.UDPConnectionRegistry
import dev.slimevr.tracking.trackers.udp.UDPDevice
import dev.slimevr.tracking.trackers.udp.UDPPacket15SensorInfo
import dev.slimevr.tracking.trackers.udp.UDPProtocolParser
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.BufferUnderflowException
import java.nio.ByteBuffer
import java.nio.ByteOrder

class UDPRepairTests {
	@Test
	fun `malformed packet and bundle do not advance sequence or liveness`() {
		for (packet in listOf(
			packet(UDPProtocolParser.PACKET_PING_PONG, 7, byteArrayOf(1, 2)),
			packet(UDPProtocolParser.PACKET_BUNDLE, 7, ByteBuffer.allocate(6).order(ByteOrder.BIG_ENDIAN).putShort(4).putInt(UDPProtocolParser.PACKET_PING_PONG).array()),
		)) {
			val parser = UDPProtocolParser()
			val device = device()
			device.timedOut = true
			device.lastPacket = 1234L

			assertThrows(BufferUnderflowException::class.java) { parser.parse(packet, device) }

			assertEquals(-1L, device.lastPacketNumber)
			assertEquals(1234L, device.lastPacket)
			assertTrue(device.timedOut)
			assertEquals(0, device.totalPacketsReceived)
		}
	}

	@Test
	fun `valid packets commit sequence and packet zero remains accepted`() {
		val parser = UDPProtocolParser()
		val device = device()
		device.timedOut = true

		parser.parse(packet(UDPProtocolParser.PACKET_HEARTBEAT, 0), device)
		assertEquals(0L, device.lastPacketNumber)
		assertFalse(device.timedOut)

		parser.parse(packet(UDPProtocolParser.PACKET_PING_PONG, 1, ByteBuffer.allocate(Int.SIZE_BYTES).putInt(42).array()), device)
		assertEquals(1L, device.lastPacketNumber)
		assertEquals(1L, parser.lastParsedPacketNumber)
	}

	@Test
	fun `sensor info keeps optional fields and six byte acknowledgement`() {
		val payload = ByteBuffer.allocate(8).order(ByteOrder.BIG_ENDIAN)
			.put(2)
			.put(1)
			.put(IMUType.ICM20948.id.toByte())
			.putShort(3)
			.put(1)
			.put(TrackerPosition.CHEST.id.toByte())
			.put(1)
			.array()
		val parsed = UDPProtocolParser().parse(packet(UDPProtocolParser.PACKET_SENSOR_INFO, 0, payload), null)
			.filterNotNull().single() as UDPPacket15SensorInfo
		assertEquals(2, parsed.sensorId)
		assertEquals(1, parsed.sensorStatus)
		assertEquals(IMUType.ICM20948, parsed.sensorType)
		assertEquals(SensorConfig(3u.toUShort()), parsed.sensorConfig)
		assertEquals(true, parsed.hasCompletedRestCalibration)
		assertEquals(TrackerPosition.CHEST, parsed.trackerPosition)

		val ack = ByteBuffer.allocate(16)
		UDPProtocolParser().writeSensorInfoResponse(ack, null, parsed)
		assertEquals(6, ack.position())
		ack.flip()
		assertEquals(UDPProtocolParser.PACKET_SENSOR_INFO, ack.int)
		assertEquals(2, ack.get().toInt())
		assertEquals(1, ack.get().toInt())
	}

	@Test
	fun `forget disconnect and approved re pair reuse device and tracker`() {
		val registry = UDPConnectionRegistry()
		val mac = "AA:BB:CC:DD:EE:FF"
		val oldAddress = InetSocketAddress("127.0.0.1", 6000)
		val newAddress = InetSocketAddress("127.0.0.1", 6001)
		val device = device(oldAddress, mac)
		val tracker = Tracker(device, 1, "udp tracker", trackerPosition = TrackerPosition.CHEST)
		device.trackers[0] = tracker
		registry.activate(device, oldAddress, mac)

		registry.disconnect(device)
		assertTrue(registry.activeSnapshot().isEmpty())
		assertEquals(null, registry.findByAddress(oldAddress))
		assertSame(device, registry.findByMAC(mac))

		// This models the next handshake only after the server's known-device gate passes.
		val approvedDevice = registry.findForHandshake(mac, newAddress) ?: error("MAC identity was not retained")
		registry.activate(approvedDevice, newAddress, mac)
		assertEquals(listOf(device), registry.activeSnapshot())
		assertEquals(null, registry.findByAddress(oldAddress))
		assertSame(device, registry.findByAddress(newAddress))
		assertSame(tracker, device.trackers[0])

		registry.activate(device, newAddress, mac)
		assertEquals(1, registry.activeSnapshot().size)
	}

	@Test
	fun `same address handshake fills missing mac index`() {
		val registry = UDPConnectionRegistry()
		val address = InetSocketAddress("127.0.0.1", 6000)
		val mac = "AA:BB:CC:DD:EE:FF"
		val device = device(address, mac)
		registry.activate(device, address, null)

		val existing = registry.findForHandshake(mac, address) ?: error("Address route was lost")
		registry.activate(existing, address, mac)

		assertSame(device, registry.findByMAC(mac))
		assertSame(device, registry.findByAddress(address))
		assertEquals(1, registry.activeSnapshot().size)
	}

	@Test
	fun `same address with a different mac replaces the route owner`() {
		val registry = UDPConnectionRegistry()
		val address = InetSocketAddress("127.0.0.1", 6000)
		val oldDevice = device(address, "AA:BB:CC:DD:EE:01")
		val newDevice = device(address, "AA:BB:CC:DD:EE:02")
		registry.activate(oldDevice, address, oldDevice.hardwareIdentifier)

		assertEquals(null, registry.findForHandshake(newDevice.hardwareIdentifier, address))
		val displaced = registry.activate(newDevice, address, newDevice.hardwareIdentifier)

		assertSame(oldDevice, displaced)
		assertEquals(listOf(newDevice), registry.activeSnapshot())
		assertSame(newDevice, registry.findByAddress(address))
		assertSame(oldDevice, registry.findByMAC(oldDevice.hardwareIdentifier))
		assertSame(newDevice, registry.findByMAC(newDevice.hardwareIdentifier))
	}

	private fun packet(id: Int, sequence: Long, payload: ByteArray = byteArrayOf()): ByteBuffer {
		val buffer = ByteBuffer.allocate(Int.SIZE_BYTES + Long.SIZE_BYTES + payload.size).order(ByteOrder.BIG_ENDIAN)
		buffer.putInt(id).putLong(sequence).put(payload).flip()
		return buffer
	}

	private fun device(address: InetSocketAddress = InetSocketAddress("127.0.0.1", 6000), hardwareId: String = "AA:BB:CC:DD:EE:FF") = UDPDevice(address, InetAddress.getLoopbackAddress(), hardwareId)
}
