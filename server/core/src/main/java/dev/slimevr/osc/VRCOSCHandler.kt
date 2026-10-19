package dev.slimevr.osc

import com.illposed.osc.OSCBundle
import com.illposed.osc.OSCMessage
import com.illposed.osc.OSCMessageEvent
import com.illposed.osc.OSCMessageListener
import com.illposed.osc.OSCPacketEvent
import com.illposed.osc.OSCSerializerAndParserBuilder
import com.illposed.osc.messageselector.OSCPatternAddressMessageSelector
import com.illposed.osc.transport.OSCPortIn
import com.illposed.osc.transport.OSCPortOut
import com.jme3.math.FastMath
import com.jme3.system.NanoTimer
import dev.slimevr.VRServer
import dev.slimevr.config.VRCOSCConfig
import dev.slimevr.tracking.trackers.Device
import dev.slimevr.tracking.trackers.DeviceOrigin
import dev.slimevr.tracking.trackers.Tracker
import dev.slimevr.tracking.trackers.TrackerPosition
import dev.slimevr.tracking.trackers.TrackerStatus
import io.eiren.util.collections.FastList
import io.eiren.util.logging.LogManager
import io.github.axisangles.ktmath.EulerAngles
import io.github.axisangles.ktmath.EulerOrder
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.nio.ByteBuffer
import java.nio.channels.AsynchronousCloseException
import java.nio.channels.ClosedChannelException
import java.nio.channels.DatagramChannel
import kotlin.collections.iterator

private const val OFFSET_SLERP_FACTOR = 0.5f // Guessed from eyeing VRChat

/**
 * VRChat OSCTracker documentation: https://docs.vrchat.com/docs/osc-trackers
 */
class VRCOSCHandler(
	private val server: VRServer,
	private val config: VRCOSCConfig,
	private val computedTrackers: List<Tracker>,
) : OSCHandler {
	private val vrsystemTrackersAddresses = arrayOf(
		"/tracking/vrsystem/head/pose",
		"/tracking/vrsystem/leftwrist/pose",
		"/tracking/vrsystem/rightwrist/pose",
	)
	private val oscTrackersAddresses = arrayOf(
		"/tracking/trackers/*/position",
		"/tracking/trackers/*/rotation",
	)
	private val vrchatInboundAddresses = arrayOf(
		"/avatar/*",
		"/avatar/parameters/*",
		"/avatar/change",
		"/chatbox/*",
		"/input/*",
	)
	private var oscReceiver: OSCPortIn? = null
	private var oscSender: OSCPortOut? = null
	private var oscQuerySender: OSCPortOut? = null
	private val senderLock = Any()
	private var oscMessage: OSCMessage? = null
	private var headTracker: Tracker? = null
	private var oscTrackersDevice: Device? = null
	private var vrsystemTrackersDevice: Device? = null
	private val oscArgs = FastList<Float?>(3)
	private val trackersEnabled: BooleanArray = BooleanArray(computedTrackers.size)
	private var oscPortIn = 0
	private var oscPortOut = 0
	private var oscIp: InetAddress? = null
	private var oscQueryPortOut = 0
	private var oscQueryIp: InetAddress? = null
	private var oscQueryIpMatch = false
	private var timeAtLastError: Long = 0
	private var timeAtLastSend: Long = 0
	private var lastHeartbeatTime: Long = 0
	private var receivingPositionOffset = Vector3.NULL
	private var postReceivingPositionOffset = Vector3.NULL
	private var receivingRotationOffset = Quaternion.IDENTITY
	private var receivingRotationOffsetGoal = Quaternion.IDENTITY
	private val postReceivingOffset = EulerAngles(EulerOrder.YXZ, 0f, FastMath.PI, 0f).toQuaternion()
	private var timeAtLastReceivedRotationOffset = System.currentTimeMillis()
	private var fpsTimer: NanoTimer? = null
	private var vrcOscQueryHandler: VRCOSCQueryHandler? = null
	private var lastChatboxSendTime: Long = 0
	private var lastChatboxAlertTime: Long = 0
	private val recoveryNotifications = mutableMapOf<Int, Pair<Boolean, Long>>()

	init {
		refreshSettings(false)
	}

	override fun refreshSettings(refreshRouterSettings: Boolean) {
		// Sets which trackers are enabled and force head and hands to false
		for (i in computedTrackers.indices) {
			val pos = computedTrackers[i].trackerPosition
			if (pos != null && pos != TrackerPosition.HEAD && pos != TrackerPosition.LEFT_HAND && pos != TrackerPosition.RIGHT_HAND) {
				val role = pos.trackerRole
				trackersEnabled[i] = if (role != null) {
					config.getOSCTrackerRole(role, false)
				} else {
					false
				}
			} else {
				trackersEnabled[i] = false
			}
		}

		updateOscReceiver(config.portIn, vrsystemTrackersAddresses + oscTrackersAddresses + vrchatInboundAddresses)
		updateOscSender(config.portOut, config.address)

		if (config.enabled && config.oscqueryEnabled) {
			if (vrcOscQueryHandler == null) {
				try {
					vrcOscQueryHandler = VRCOSCQueryHandler(server, this)
				} catch (e: Throwable) {
					LogManager.severe("Unable to initialize OSCQuery: $e", e)
				}
			}
		} else {
			vrcOscQueryHandler?.close()
			vrcOscQueryHandler = null
		}

		if (refreshRouterSettings) {
			server.oSCRouter.refreshSettings(false)
		}
	}

	fun ipIsLocal(a: InetAddress): Boolean {
		if (a.isLoopbackAddress) {
			return true
		}
		for (netInt in NetworkInterface.getNetworkInterfaces()) {
			if (netInt.isUp && !netInt.isLoopback && !netInt.isVirtual) {
				for (netAddr in netInt.interfaceAddresses) {
					if (a == netAddr.address || a.address.contentEquals(netAddr.address.address)) {
						return true
					}
				}
			}
		}
		return false
	}

	fun ipEquals(a: InetAddress?, b: InetAddress?): Boolean = a == b ||
		(
			a != null &&
				b != null &&
				(
					a.address.contentEquals(b.address) ||
						(ipIsLocal(a) && ipIsLocal(b))
					)
			)

	/**
	 * Adds an OSC Sender from OSCQuery
	 */
	fun addOSCQuerySender(oscPortOut: Int, oscIP: String) {
		synchronized(senderLock) {
			addOSCQuerySenderLocked(oscPortOut, oscIP)
		}
	}

	private fun addOSCQuerySenderLocked(oscPortOut: Int, oscIP: String) {
		if (!config.enabled) {
			closeOscQuerySenderLocked()
			return
		}

		try {
			// If we already have the best matching client
			if (oscQuerySender != null && oscQueryIpMatch) {
				return
			}

			val addr = InetAddress.getByName(oscIP)
			val ipMatch = ipEquals(addr, this.oscIp)

			// If we already have an OSC sender
			if (oscQuerySender != null) {
				val portMatch = oscPortOut == this.oscPortOut
				// Original IP will be matching because of the check done earlier
				val origPortMatch = oscQueryPortOut == this.oscPortOut

				// If the IP doesn't match and (the port doesn't match or the original
				//  port did match), ignore this client
				if (!ipMatch && (!portMatch || origPortMatch)) {
					return
				}

				// If this is the same address as what we're already sending to, keep
				//  using the same OSC sender
				if (ipEquals(addr, oscQueryIp)) {
					return
				}

				// So if the IP matches or the port matches and the original one didn't,
				//  we will select this new address for OSC
			}

			closeOscQuerySenderLocked()

			if (ipMatch) {
				LogManager.info("[VRCOSCHandler] OSCQuery sender sending to port $oscPortOut at address $oscIP (matches configured address)")
			} else {
				LogManager.info("[VRCOSCHandler] OSCQuery sender sending to port $oscPortOut at address $oscIP")
			}
			oscQuerySender = OSCPortOut(InetSocketAddress(addr, oscPortOut))
			oscQueryIp = addr
			oscQueryIpMatch = ipMatch
			oscQueryPortOut = oscPortOut

			// Avoids additional security checks, but not necessary for UDP, therefore
			//  isConnected doesn't really indicate that we are actively "connected"
			oscQuerySender?.connect()
		} catch (e: IOException) {
			LogManager.severe("[VRCOSCHandler] Error connecting OSCQuery sender to port $oscPortOut at the address $oscIP: $e")
			closeOscQuerySenderLocked()
		}
	}

	/**
	 * Close/remove the OSC sender
	 */
	fun closeOscSender() {
		synchronized(senderLock) {
			closeOscSenderLocked()
		}
	}

	private fun closeOscSenderLocked() {
		try {
			oscSender?.close()
			oscSender = null
		} catch (e: IOException) {
			LogManager.severe("[VRCOSCHandler] Error closing the OSC sender: $e")
		}
	}

	/**
	 * Close/remove the OSCQuery sender
	 */
	fun closeOscQuerySender() {
		synchronized(senderLock) {
			closeOscQuerySenderLocked()
		}
	}

	private fun closeOscQuerySenderLocked() {
		try {
			oscQuerySender?.close()
			oscQuerySender = null
		} catch (e: IOException) {
			LogManager.severe("[VRCOSCHandler] Error closing the OSCQuery sender: $e")
		}
	}

	/**
	 * Close/remove the OSC receiver
	 */
	fun closeOscReceiver() {
		try {
			oscReceiver?.close()
			oscReceiver = null
		} catch (e: IOException) {
			LogManager.severe("[VRCOSCHandler] Error closing the OSC receiver: $e")
		}
	}

	override fun updateOscReceiver(portIn: Int, oscAddresses: Array<String>) {
		if (!config.enabled) {
			closeOscReceiver()
			return
		}

		// If already configured and listening, nothing new needs to be configured
		if (oscPortIn == portIn && oscReceiver?.isListening == true) return

		try {
			closeOscReceiver()

			// Instantiate the new OSC receiver
			LogManager.info("[VRCOSCHandler] Listening to port $portIn")
			val newOscReceiver = TrackedOSCPortIn(portIn)
			// VRChat timestamps its bundles with the Quest's clock; scheduling them leaks memory and delays head pose under clock skew
			newOscReceiver.dispatcher.isAlwaysDispatchingImmediately = true
			oscReceiver = newOscReceiver
			oscPortIn = portIn

			val listener = OSCMessageListener { event: OSCMessageEvent ->
				handleReceivedMessage(event)
			}
			for (address in oscAddresses) {
				newOscReceiver.dispatcher.addListener(
					OSCPatternAddressMessageSelector(address),
					listener,
				)
			}

			newOscReceiver.startListening()

			// Advertise our new receiving port over OSCQuery
			vrcOscQueryHandler?.updateOSCQuery(portIn.toUShort())
		} catch (e: IOException) {
			LogManager.severe("[VRCOSCHandler] Error listening to the port $portIn: $e")
			closeOscReceiver()
		}
	}

	override fun updateOscSender(portOut: Int, ip: String) {
		synchronized(senderLock) {
			updateOscSenderLocked(portOut, ip)
		}
	}

	private fun updateOscSenderLocked(portOut: Int, ip: String) {
		if (!config.enabled) {
			closeOscSenderLocked()
			return
		}

		try {
			// If already configured, nothing new needs to be configured
			val addr = InetAddress.getByName(ip)
			val resetQuery = if (ipEquals(addr, oscIp) && oscPortOut == portOut) {
				// Technically we are fine if `isConnected` is false, but we can just
				//  assume we're always gonna be connected
				if (oscSender?.isConnected == true) {
					return
				}
				false
			} else {
				// If the new IP doesn't match the current OSCQuery IP, close the
				//  OSCQuery sender after updating the config variables
				!ipEquals(addr, oscQueryIp)
			}

			closeOscSenderLocked()

			LogManager.info("[VRCOSCHandler] Sending to port $portOut at address $ip")
			val newOscSender = OSCPortOut(InetSocketAddress(addr, portOut))
			oscSender = newOscSender
			oscIp = addr
			oscPortOut = portOut

			// Avoids additional security checks, but not necessary for UDP, therefore
			//  isConnected doesn't really indicate that we are actively "connected"
			newOscSender.connect()

			if (resetQuery) {
				closeOscQuerySenderLocked()
			}
		} catch (e: IOException) {
			LogManager
				.severe(
					"[VRCOSCHandler] Error connecting to port $portOut at the address $ip: $e",
				)
			closeOscSenderLocked()
			return
		}
	}

	private fun handleReceivedMessage(event: OSCMessageEvent) {
		// Auto-detect inbound sender IP from Quest/VRChat on port 9001
		val senderAddress = (event.source as? InetSocketAddress)
			?: (oscReceiver as? TrackedOSCPortIn)?.lastReceivedAddress
		val senderIp = senderAddress?.address?.hostAddress ?: senderAddress?.hostString

		if (!senderIp.isNullOrBlank()) {
			val isLoopback = oscIp == null || oscIp?.isLoopbackAddress == true || oscIp?.hostAddress == "127.0.0.1" || oscIp?.hostAddress == "localhost"
			if (isLoopback || oscQuerySender == null) {
				if (oscIp?.hostAddress != senderIp) {
					LogManager.info("[VRCOSCHandler] Auto-detected inbound Quest IP: $senderIp, updating OSC sender")
					val targetPort = if (oscPortOut > 0) oscPortOut else (if (config.portOut > 0) config.portOut else 9000)
					updateOscSender(targetPort, senderIp)
					config.address = senderIp
					server.configManager.saveConfig()
				}
			}
		}

		if (vrsystemTrackersAddresses.contains(event.message.address)) {
			// Receiving Head and Wrist pose data thanks to OSCQuery
			// Create device if it doesn't exist
			if (vrsystemTrackersDevice == null) {
				// Instantiate OSC Trackers device
				vrsystemTrackersDevice = server.deviceManager.createDevice(DeviceOrigin.VRCHAT, "VRC VRSystem", null, "VRChat")
				server.deviceManager.addDevice(vrsystemTrackersDevice!!)
			}

			// Look at xxx in "/tracking/vrsystem/xxx/pose" to know TrackerPosition
			var name = "VRChat "
			val trackerPosition = when (event.message.address.split('/')[3]) {
				"head" -> {
					name += "head"
					TrackerPosition.HEAD
				}

				"leftwrist" -> {
					name += "left hand"
					TrackerPosition.LEFT_HAND
				}

				"rightwrist" -> {
					name += "right hand"
					TrackerPosition.RIGHT_HAND
				}

				else -> {
					LogManager.warning("[VRCOSCHandler] Received invalid body part in message \"${event.message.address}\"")
					return
				}
			}

			// Try to get the tracker
			var tracker = vrsystemTrackersDevice!!.trackers[trackerPosition.ordinal]

			// Build the tracker if it doesn't exist
			if (tracker == null) {
				tracker = Tracker(
					device = vrsystemTrackersDevice,
					id = VRServer.getNextLocalTrackerId(),
					name = name,
					displayName = name,
					trackerNum = trackerPosition.ordinal,
					trackerPosition = trackerPosition,
					hasRotation = true,
					hasPosition = true,
					userEditable = true,
					isComputed = true,
					allowReset = trackerPosition != TrackerPosition.HEAD,
					usesTimeout = true,
				)
				vrsystemTrackersDevice!!.trackers[trackerPosition.ordinal] = tracker
				server.registerTracker(tracker)
			}

			// Sets the tracker status to OK
			tracker.status = TrackerStatus.OK

			// Update tracker position
			tracker.position = Vector3(
				event.message.arguments[0] as Float,
				event.message.arguments[1] as Float,
				-(event.message.arguments[2] as Float),
			)

			// Update tracker rotation
			val (w, x, y, z) = EulerAngles(
				EulerOrder.YXZ,
				event.message.arguments[3] as Float * FastMath.DEG_TO_RAD,
				event.message.arguments[4] as Float * FastMath.DEG_TO_RAD,
				event.message.arguments[5] as Float * FastMath.DEG_TO_RAD,
			).toQuaternion()
			val rot = Quaternion(w, -x, -y, z)
			tracker.setRotation(rot)

			tracker.dataTick()
		} else if (event.message.address.startsWith("/tracking/trackers/")) {
			// Receiving OSC Trackers data. This is not from VRChat.
			if (oscTrackersDevice == null) {
				// Instantiate OSC Trackers device
				oscTrackersDevice = server.deviceManager.createDevice(DeviceOrigin.OSC, "OSC Tracker", null, "OSC Trackers")
				server.deviceManager.addDevice(oscTrackersDevice!!)
			}

			// Extract the xxx in "/tracking/trackers/xxx/..."
			val splitAddress = event.message.address.split('/')
			val trackerStringValue = splitAddress[3]
			val dataType = event.message.address.split('/')[4]
			if (trackerStringValue == "head") {
				// Head data
				if (dataType == "position") {
					// Position offset
					receivingPositionOffset = Vector3(
						event.message.arguments[0] as Float,
						event.message.arguments[1] as Float,
						-(event.message.arguments[2] as Float),
					)

					headTracker?.let {
						if (it.hasPosition) {
							postReceivingPositionOffset = it.position
						}
					}
				} else {
					// Rotation offset
					val (w, x, y, z) = EulerAngles(EulerOrder.YXZ, event.message.arguments[0] as Float * FastMath.DEG_TO_RAD, event.message.arguments[1] as Float * FastMath.DEG_TO_RAD, event.message.arguments[2] as Float * FastMath.DEG_TO_RAD).toQuaternion()
					receivingRotationOffsetGoal = Quaternion(w, -x, -y, z).inv()

					headTracker.let {
						receivingRotationOffsetGoal = if (it != null && it.hasRotation) {
							it.getRotation().project(Vector3.POS_Y).unit() * receivingRotationOffsetGoal
						} else {
							receivingRotationOffsetGoal
						}
					}

					// If greater than 300ms, snap to rotation
					if (System.currentTimeMillis() - timeAtLastReceivedRotationOffset > 300) {
						receivingRotationOffset = receivingRotationOffsetGoal
					}

					// Update time variable
					timeAtLastReceivedRotationOffset = System.currentTimeMillis()
				}
			} else {
				// Trackers data (1-8)
				val trackerId = trackerStringValue.toInt()
				var tracker = oscTrackersDevice!!.trackers[trackerId]

				if (tracker == null) {
					tracker = Tracker(
						device = oscTrackersDevice,
						id = VRServer.getNextLocalTrackerId(),
						name = "OSC Tracker #$trackerId",
						displayName = "OSC Tracker #$trackerId",
						trackerNum = trackerId,
						trackerPosition = null,
						hasRotation = true,
						hasPosition = true,
						userEditable = true,
						isComputed = true,
						allowReset = true,
						usesTimeout = true,
					)
					oscTrackersDevice!!.trackers[trackerId] = tracker
					server.registerTracker(tracker)
				}

				// Sets the tracker status to OK
				tracker.status = TrackerStatus.OK

				if (dataType == "position") {
					// Update tracker position
					tracker.position = receivingRotationOffset.sandwich(
						Vector3(
							event.message.arguments[0] as Float,
							event.message.arguments[1] as Float,
							-(event.message.arguments[2] as Float),
						) -
							receivingPositionOffset,
					) +
						postReceivingPositionOffset
				} else {
					// Update tracker rotation
					val (w, x, y, z) = EulerAngles(
						EulerOrder.YXZ,
						event.message.arguments[0] as Float * FastMath.DEG_TO_RAD,
						event.message.arguments[1] as Float * FastMath.DEG_TO_RAD,
						event.message.arguments[2] as Float * FastMath.DEG_TO_RAD,
					).toQuaternion()
					val rot = Quaternion(w, -x, -y, z)
					tracker.setRotation(receivingRotationOffset * rot * postReceivingOffset)
				}

				tracker.dataTick()
			}
		} else {
			// Avatar, input, and chatbox packets are subscribed only so their
			// source address can identify the Quest. They are not tracker data.
			return
		}
	}

	override fun update() {
		if (!config.enabled) {
			return
		}

		// Gets timer from vrServer
		if (fpsTimer == null) {
			fpsTimer = VRServer.instance.fpsTimer
		}
		// Update received trackers' offset rotation slerp
		if (receivingRotationOffset != receivingRotationOffsetGoal) {
			receivingRotationOffset = receivingRotationOffset.interpR(receivingRotationOffsetGoal, OFFSET_SLERP_FACTOR * (fpsTimer?.timePerFrame ?: 1f))
		}

		val now = System.currentTimeMillis()
		val targetRate = server.configManager.vrConfig.questStandalone.oscRate.coerceIn(20, 120)
		val minIntervalMs = 1000L / targetRate
		if (now - timeAtLastSend < minIntervalMs) {
			return
		}
		timeAtLastSend = now

		// Update current time
		val currentTime = now.toFloat()

		// Send OSC data
		if (oscSender != null || oscQuerySender != null) {
			val isChatboxOnly = server.configManager.vrConfig.questStandalone.chatboxOnlyMode
			// Create new bundle
			val bundle = OSCBundle()

			if (!isChatboxOnly) {
				for (i in computedTrackers.indices) {
					if (trackersEnabled[i]) {
						val vrcId = getVRCOSCTrackersId(computedTrackers[i].trackerPosition)
						if (vrcId > 0) {
							// Send regular trackers' positions
							val (x, y, z) = computedTrackers[i].position
							oscArgs.clear()
							oscArgs.add(x)
							oscArgs.add(y)
							oscArgs.add(-z)
							bundle.addPacket(
								OSCMessage(
									"/tracking/trackers/$vrcId/position",
									oscArgs.clone(),
								),
							)

							// Send regular trackers' rotations
							val (w, x1, y1, z1) = computedTrackers[i].getRotation()
							val (_, x2, y2, z2) = Quaternion(
								w,
								-x1,
								-y1,
								z1,
							).toEulerAngles(EulerOrder.YXZ)
							oscArgs.clear()
							oscArgs.add(x2 * FastMath.RAD_TO_DEG)
							oscArgs.add(y2 * FastMath.RAD_TO_DEG)
							oscArgs.add(z2 * FastMath.RAD_TO_DEG)
							bundle.addPacket(
								OSCMessage(
									"/tracking/trackers/$vrcId/rotation",
									oscArgs.clone(),
								),
							)
						}
					}
					if (computedTrackers[i].trackerPosition == TrackerPosition.HEAD) {
						// Send HMD position
						val (x, y, z) = computedTrackers[i].position
						oscArgs.clear()
						oscArgs.add(x)
						oscArgs.add(y)
						oscArgs.add(-z)
						bundle.addPacket(
							OSCMessage(
								"/tracking/trackers/head/position",
								oscArgs.clone(),
							),
						)
					}
					if (computedTrackers[i].trackerPosition == TrackerPosition.LEFT_HAND) {
						// Send Left Wrist position
						val (x, y, z) = computedTrackers[i].position
						oscArgs.clear()
						oscArgs.add(x)
						oscArgs.add(y)
						oscArgs.add(-z)
						bundle.addPacket(
							OSCMessage(
								"/tracking/trackers/leftwrist/position",
								oscArgs.clone(),
							),
						)
					}
					if (computedTrackers[i].trackerPosition == TrackerPosition.RIGHT_HAND) {
						// Send Right Wrist position
						val (x, y, z) = computedTrackers[i].position
						oscArgs.clear()
						oscArgs.add(x)
						oscArgs.add(y)
						oscArgs.add(-z)
						bundle.addPacket(
							OSCMessage(
								"/tracking/trackers/rightwrist/position",
								oscArgs.clone(),
							),
						)
					}
				}
			}

			if (bundle.packets.isNotEmpty()) {
				try {
					synchronized(senderLock) {
						oscSender?.send(bundle)
						if (oscQuerySender != null && oscQuerySender != oscSender) {
							try {
								oscQuerySender?.send(bundle)
							} catch (ignored: Exception) {
							}
						}
					}

					if (now - lastHeartbeatTime > 5000L) {
						lastHeartbeatTime = now
						var activeCount = 0
						for (b in trackersEnabled) if (b) activeCount++
						LogManager.info("[VRCOSCHandler] Streaming $activeCount OSC trackers to $oscIp:$oscPortOut")
					}
				} catch (e: Exception) {
					if (currentTime - timeAtLastError > 100) {
						timeAtLastError = System.currentTimeMillis()
						LogManager.warning("[VRCOSCHandler] Error sending OSC message to VRChat: $e")
					}
				}
			}

			try {
				checkAndSendChatboxStatus(now)
			} catch (e: Exception) {
				LogManager.warning("[VRCOSCHandler] Error checking chatbox status: $e")
			}
		}
	}

	private fun getVRCOSCTrackersId(trackerPosition: TrackerPosition?): Int {
		// Needs to range from 1-8.
		// Don't change as third party applications may rely
		// on this for mapping trackers to body parts.
		return when (trackerPosition) {
			TrackerPosition.HIP -> 1
			TrackerPosition.LEFT_FOOT -> 2
			TrackerPosition.RIGHT_FOOT -> 3
			TrackerPosition.LEFT_UPPER_LEG -> 4
			TrackerPosition.RIGHT_UPPER_LEG -> 5
			TrackerPosition.UPPER_CHEST -> 6
			TrackerPosition.LEFT_UPPER_ARM -> 7
			TrackerPosition.RIGHT_UPPER_ARM -> 8
			else -> -1
		}
	}

	fun setHeadTracker(headTracker: Tracker?) {
		this.headTracker = headTracker
	}

	/**
	 * Sends the expected HMD rotation upon reset to align the trackers in VRC
	 */
	fun yawAlign(headRot: Quaternion) {
		if (server.configManager.vrConfig.questStandalone.chatboxOnlyMode) return
		if (oscSender != null || oscQuerySender != null) {
			val (_, _, y, _) = headRot.toEulerAngles(EulerOrder.YXZ)
			oscArgs.clear()
			oscArgs.add(0f)
			oscArgs.add(-y * FastMath.RAD_TO_DEG)
			oscArgs.add(0f)
			oscMessage = OSCMessage(
				"/tracking/trackers/head/rotation",
				oscArgs,
			)
			try {
				// Prioritize OSCQuery since we can't validate oscSender
				synchronized(senderLock) {
					if (oscQuerySender != null) {
						oscQuerySender?.send(oscMessage)
					} else {
						oscSender?.send(oscMessage)
					}
				}
			} catch (e: Exception) {
				LogManager
					.warning("[VRCOSCHandler] Error sending OSC message to VRChat: $e")
			}
		}
	}

	fun sendChatboxMessage(message: String, playSound: Boolean = false) {
		if (oscSender == null && oscQuerySender == null) return
		val chatArgs = FastList<Any>(3)
		chatArgs.add(message)
		chatArgs.add(true) // bDirect = true, immediately updates chatbox bubble
		chatArgs.add(playSound)
		val msg = OSCMessage("/chatbox/input", chatArgs)
		try {
			synchronized(senderLock) {
				if (oscQuerySender != null) {
					oscQuerySender?.send(msg)
				} else {
					oscSender?.send(msg)
				}
			}
			LogManager.info("[VRCOSCHandler] Sent chatbox message: \"$message\"")
		} catch (e: Exception) {
			LogManager.warning("[VRCOSCHandler] Failed to send chatbox message: $e")
		}
	}

	fun sendTrackerRecoveryNotification(tracker: Tracker, recovered: Boolean) {
		val questConfig = server.configManager.vrConfig.questStandalone
		val resetConfig = server.configManager.vrConfig.resetsConfig
		if (!questConfig.chatboxEnabled || !resetConfig.recoveryChatboxNotifications) return

		val now = System.currentTimeMillis()
		val previous = recoveryNotifications[tracker.id]
		if (previous != null && previous.first == recovered && now - previous.second < 30000L) return
		recoveryNotifications[tracker.id] = recovered to now

		val part = getShortPositionName(tracker.trackerPosition)
		val message = if (recovered) {
			"✓ $part tracker recovered"
		} else {
			"⚠ $part tracker needs a reset"
		}
		sendChatboxMessage(message, playSound = !recovered)
	}

	fun triggerChatboxUpdate(force: Boolean = true) {
		val msg = buildBatteryStatusMessage()
		if (msg.isNotBlank()) {
			sendChatboxMessage(msg, playSound = false)
			lastChatboxSendTime = System.currentTimeMillis()
		}
	}

	private fun checkAndSendChatboxStatus(now: Long) {
		val questConfig = server.configManager.vrConfig.questStandalone
		if (!questConfig.chatboxEnabled || questConfig.chatboxOnlyMode) return

		val intervalMs = (questConfig.chatboxIntervalSeconds.coerceAtLeast(15)) * 1000L

		// Check low battery alerts first
		if (questConfig.chatboxLowBatteryWarning && now - lastChatboxAlertTime > 45000L) {
			val lowBatteryList = mutableListOf<String>()
			for (t in server.allTrackers) {
				if (t.isImu() && t.status == TrackerStatus.OK) {
					val battery = t.batteryLevel ?: continue
					if (battery <= 20f) {
						val posName = getShortPositionName(t.trackerPosition)
						lowBatteryList.add("$posName ${battery.toInt()}%")
					}
				}
			}
			if (lowBatteryList.isNotEmpty()) {
				lastChatboxAlertTime = now
				lastChatboxSendTime = now
				val alertMsg = "⚠️ Low Batt: " + lowBatteryList.joinToString(", ")
				sendChatboxMessage(alertMsg, playSound = true)
				return
			}
		}

		// Periodic broadcast
		if (now - lastChatboxSendTime > intervalMs) {
			lastChatboxSendTime = now
			val statusMsg = buildBatteryStatusMessage()
			if (statusMsg.isNotBlank()) {
				sendChatboxMessage(statusMsg, playSound = false)
			}
		}
	}

	private fun buildBatteryStatusMessage(): String {
		val trackerParts = mutableListOf<String>()
		val trackers = server.allTrackers.filter { it.isImu() && it.status == TrackerStatus.OK }
		if (trackers.isEmpty()) {
			return ""
		}

		for (t in trackers) {
			val pos = getShortPositionName(t.trackerPosition)
			val batt = t.batteryLevel?.toInt()
			if (batt != null) {
				trackerParts.add("$pos:$batt%")
			} else {
				trackerParts.add("$pos:OK")
			}
		}

		val partsText = trackerParts.joinToString(" ")
		return "🔋 $partsText".take(140)
	}

	private fun getShortPositionName(pos: TrackerPosition?): String = when (pos) {
		TrackerPosition.CHEST -> "Ch"
		TrackerPosition.WAIST, TrackerPosition.HIP -> "W"
		TrackerPosition.LEFT_UPPER_LEG -> "LTh"
		TrackerPosition.RIGHT_UPPER_LEG -> "RTh"
		TrackerPosition.LEFT_LOWER_LEG -> "LSh"
		TrackerPosition.RIGHT_LOWER_LEG -> "RSh"
		TrackerPosition.LEFT_FOOT -> "LF"
		TrackerPosition.RIGHT_FOOT -> "RF"
		TrackerPosition.LEFT_UPPER_ARM -> "LA"
		TrackerPosition.RIGHT_UPPER_ARM -> "RA"
		TrackerPosition.HEAD -> "HMD"
		else -> pos?.designation?.take(3)?.uppercase() ?: "Trk"
	}

	override fun getOscSender(): OSCPortOut = oscSender!!

	override fun getPortOut(): Int = oscPortOut

	override fun getAddress(): InetAddress = oscIp!!

	override fun getOscReceiver(): OSCPortIn = oscReceiver!!

	override fun getPortIn(): Int = oscPortIn
}

private class TrackedOSCPortIn(port: Int) : OSCPortIn(port) {
	@Volatile
	var lastReceivedAddress: InetSocketAddress? = null

	private val channel: DatagramChannel? by lazy {
		try {
			val tr = transport
			val field = tr.javaClass.getDeclaredField("channel")
			field.isAccessible = true
			field.get(tr) as? DatagramChannel
		} catch (e: Exception) {
			LogManager.warning("[VRCOSCHandler] Could not access DatagramChannel for sender tracking: $e")
			null
		}
	}

	private val parser by lazy {
		OSCSerializerAndParserBuilder().buildParser()
	}

	override fun run() {
		val ch = channel
		if (ch == null) {
			super.run()
			return
		}

		val buffer = ByteBuffer.allocate(65536)
		while (isListening) {
			try {
				buffer.clear()
				val sender = ch.receive(buffer) as? InetSocketAddress ?: continue
				buffer.flip()
				if (!buffer.hasRemaining()) continue

				lastReceivedAddress = sender
				val packet = parser.convert(buffer)
				val packetEvent = OSCPacketEvent(sender, packet)
				for (listener in packetListeners) {
					listener.handlePacket(packetEvent)
				}
			} catch (e: Exception) {
				if (isListening) {
					if (e !is ClosedChannelException && e !is AsynchronousCloseException) {
						LogManager.warning("[VRCOSCHandler] Error receiving OSC packet: $e")
					}
				}
				break
			}
		}
	}
}
