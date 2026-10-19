package dev.slimevr.osc

import OSCQueryNode
import OSCQueryServer
import ServiceInfo
import dev.slimevr.VRServer
import dev.slimevr.protocol.rpc.setup.RPCUtil
import io.eiren.util.logging.LogManager
import randomFreePort
import java.io.IOException
import java.net.InetAddress
import java.net.NetworkInterface
import javax.jmdns.NetworkTopologyDiscovery
import java.util.Timer
import java.util.TimerTask
import kotlin.concurrent.thread

private const val serviceStartsWith = "VRChat-Client"
private const val queryPath = "/tracking/vrsystem"

/**
 * Handler for OSCQuery for VRChat using our library
 * https://github.com/SlimeVR/oscquery-kt
 */
class VRCOSCQueryHandler(
	private val server: VRServer,
	private val vrcOscHandler: VRCOSCHandler,
) {
	private val oscQueryServer: OSCQueryServer
	private var discoveryTimer: Timer? = null

	init {
		// Request data
		val localIp = RPCUtil.getLocalIp() ?: throw IllegalStateException("No local IP address found for OSCQuery to bind to")
		// Announce only on the LAN address. Otherwise mDNS announces on every interface, and a
		// USB link such as a plugged-in iPhone (169.254.x) can end up as the address VRChat on
		// the Quest resolves, so it sends tracking data where it never arrives.
		val lanAddress = InetAddress.getByName(localIp)
		NetworkTopologyDiscovery.Factory.setClassDelegate {
			object : NetworkTopologyDiscovery {
				override fun getInetAddresses() = arrayOf(lanAddress)
				override fun useInetAddress(networkInterface: NetworkInterface?, interfaceAddress: InetAddress?) = interfaceAddress == lanAddress
				override fun lockInetAddress(interfaceAddress: InetAddress?) {}
				override fun unlockInetAddress(interfaceAddress: InetAddress?) {}
			}
		}
		val httpPort = randomFreePort()
		oscQueryServer = OSCQueryServer(
			"SlimeVR-Server-$httpPort",
			OscTransport.UDP,
			localIp,
			vrcOscHandler.portIn.toUShort(),
			httpPort,
		)
		oscQueryServer.rootNode.addNode(OSCQueryNode(queryPath))
		oscQueryServer.init()
		LogManager.info("[VRCOSCQueryHandler] SlimeVR OSCQueryServer started at http://$localIp:$httpPort")

		try {
			// Add service listener for both added and resolved events
			LogManager.info("[VRCOSCQueryHandler] Listening for VRChat OSCQuery")
			oscQueryServer.service.addServiceListener(
				"_osc._udp.local.",
				onServiceAdded = ::serviceAdded,
				onServiceResolved = ::serviceAdded,
			)
		} catch (e: IOException) {
			LogManager.warning("[VRCOSCQueryHandler] " + e.message)
		}
	}

	/**
	 * Updates the OSC service's port
	 */
	fun updateOSCQuery(port: UShort) {
		if (oscQueryServer.oscPort != port) {
			thread(start = true) {
				oscQueryServer.updateOscService(port)
			}
		}
	}

	/**
	 * Called when a service is added or resolved
	 */
	private fun serviceAdded(info: ServiceInfo) {
		// Check the service name
		if (!info.name.startsWith(serviceStartsWith)) return

		// Get url from ServiceInfo
		val addresses = info.inetAddresses
		if (addresses == null || addresses.isEmpty()) return
		val ip = addresses[0].hostAddress
		val port = info.port

		// create a new OSCHandler for this service
		server.queueTask {
			vrcOscHandler.addOSCQuerySender(port, ip)
		}
	}

	/**
	 * Closes the OSCQueryServer and the associated OSC sender.
	 */
	fun close() {
		vrcOscHandler.closeOscQuerySender()
		thread(start = true) {
			oscQueryServer.close()
		}
	}
}
