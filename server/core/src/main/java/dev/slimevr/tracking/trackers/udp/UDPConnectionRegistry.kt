package dev.slimevr.tracking.trackers.udp

import io.eiren.util.collections.FastList
import java.net.SocketAddress

/** Keeps active routes together while retaining MAC identity for disconnected devices. */
internal class UDPConnectionRegistry {
	private val activeConnections: MutableList<UDPDevice> = FastList()
	private val connectionsByAddress: MutableMap<SocketAddress, UDPDevice> = HashMap()
	private val connectionsByMAC: MutableMap<String, UDPDevice> = HashMap()

	fun findForHandshake(mac: String?, address: SocketAddress): UDPDevice? = synchronized(this) {
		mac?.let { connectionsByMAC[it] }
			?: connectionsByAddress[address]?.takeIf { mac == null || it.hardwareIdentifier == mac }
	}

	fun findByAddress(address: SocketAddress): UDPDevice? = synchronized(this) {
		connectionsByAddress[address]
	}

	fun findByMAC(mac: String): UDPDevice? = synchronized(this) {
		connectionsByMAC[mac]
	}

	fun activate(device: UDPDevice, address: SocketAddress, mac: String?): UDPDevice? = synchronized(this) {
		val displaced = connectionsByAddress[address]?.takeIf { it !== device }
		if (displaced != null) {
			activeConnections.remove(displaced)
			connectionsByAddress.entries.removeIf { (_, current) -> current === displaced }
		}
		device.address = address
		activeConnections.remove(device)
		activeConnections.add(device)
		connectionsByAddress.entries.removeIf { (currentAddress, current) -> current === device || currentAddress == address }
		connectionsByAddress[address] = device
		if (mac != null) connectionsByMAC[mac] = device
		displaced
	}

	fun disconnect(device: UDPDevice) = synchronized(this) {
		activeConnections.remove(device)
		connectionsByAddress.entries.removeIf { (_, current) -> current === device }
		// Keep the MAC entry so an approved re-pair can reactivate this same device
		// and preserve its tracker objects and their user assignments.
	}

	fun <T> withActiveConnections(block: (List<UDPDevice>) -> T): T = synchronized(this) {
		block(activeConnections)
	}

	fun activeSnapshot(): List<UDPDevice> = synchronized(this) { activeConnections.toList() }
}
