package dev.slimevr.unit

import com.google.flatbuffers.FlatBufferBuilder
import dev.slimevr.VRServer
import dev.slimevr.config.ConfigManager
import dev.slimevr.tracking.trackers.Tracker
import dev.slimevr.tracking.trackers.TrackerPosition
import dev.slimevr.tracking.trackers.TrackerRecoveryState
import dev.slimevr.tracking.trackers.TrackerStatus
import dev.slimevr.tracking.trackers.udp.IMUType
import io.github.axisangles.ktmath.Quaternion
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import solarxr_protocol.data_feed.tracker.TrackerRecovery
import solarxr_protocol.data_feed.tracker.TrackerRecoveryReason
import kotlin.math.PI
import dev.slimevr.tracking.trackers.TrackerRecoveryReason as RecoveryReason
import solarxr_protocol.data_feed.tracker.TrackerRecoveryState as ProtocolRecoveryState

class TrackerRecoveryTests {
	@Test
	fun `valid rotation restores timed out and disconnected status`() {
		val configManager = ConfigManager("test-config.yml")
		configManager.loadConfig()
		configManager.vrConfig.vrcOSC.enabled = false
		configManager.vrConfig.vrcOSC.oscqueryEnabled = false
		VRServer(configManager = configManager)
		val tracker = makeTracker(99, TrackerPosition.CHEST)
		tracker.setRotation(Quaternion.IDENTITY)
		tracker.dataTick()

		tracker.status = TrackerStatus.TIMED_OUT
		tracker.dataTick()
		assertEquals(TrackerStatus.OK, tracker.status)

		tracker.status = TrackerStatus.DISCONNECTED
		tracker.dataTick()
		assertEquals(TrackerStatus.OK, tracker.status)
	}

	@Test
	fun `a dropout alone doesn't ask for a reset while recovery is on`() {
		val (configManager, server) = makeServer()
		val thigh = makeTracker(130, TrackerPosition.LEFT_UPPER_LEG)
		register(server, thigh)
		thigh.status = TrackerStatus.OK
		thigh.needReset = false

		thigh.status = TrackerStatus.DISCONNECTED
		assertTrue(!thigh.needReset)

		// Without recovery nothing checks the tracker when it's back, so the dropout still asks.
		configManager.vrConfig.resetsConfig.deadTrackerRecoveryEnabled = false
		thigh.status = TrackerStatus.OK
		thigh.status = TrackerStatus.DISCONNECTED
		assertTrue(thigh.needReset)
	}

	@Test
	fun `recovery protocol payload round trips`() {
		val fbb = FlatBufferBuilder(64)
		val offset = TrackerRecovery.createTrackerRecovery(
			fbb,
			ProtocolRecoveryState.WAITING_FOR_STILLNESS,
			0.75f,
			0.8f,
			TrackerRecoveryReason.TRACKER_MOVING,
		)
		fbb.finish(offset)

		val recovery = TrackerRecovery.getRootAsTrackerRecovery(fbb.dataBuffer())
		assertEquals(ProtocolRecoveryState.WAITING_FOR_STILLNESS, recovery.state())
		assertEquals(0.75f, recovery.progress())
		assertEquals(0.8f, recovery.confidence())
		assertEquals(TrackerRecoveryReason.TRACKER_MOVING, recovery.reason())
	}

	@Test
	fun `timed out tracker follows body yaw and realigns after stillness`() {
		val configManager = ConfigManager("test-config.yml")
		configManager.loadConfig()
		configManager.vrConfig.vrcOSC.enabled = false
		configManager.vrConfig.vrcOSC.oscqueryEnabled = false
		val server = VRServer(configManager = configManager)

		val head = makeTracker(100, TrackerPosition.HEAD, isHmd = true)
		val hip = makeTracker(101, TrackerPosition.HIP)
		val thigh = makeTracker(102, TrackerPosition.LEFT_UPPER_LEG)
		val trackerField = VRServer::class.java.getDeclaredField("trackers")
		trackerField.isAccessible = true
		@Suppress("UNCHECKED_CAST")
		val trackers = trackerField.get(server) as MutableList<Tracker>
		trackers.addAll(listOf(head, hip, thigh))

		listOf(head, hip, thigh).forEach {
			it.setRotation(Quaternion.IDENTITY)
			it.status = TrackerStatus.OK
			it.dataTick()
		}

		val start = System.currentTimeMillis()
		thigh.recovery.tick(start + 800, 800)
		thigh.recovery.tick(start + 3600, 3600)
		assertEquals(TrackerRecoveryState.COMPENSATING, thigh.recovery.state)

		val turn = Quaternion.rotationAroundYAxis((PI / 2.0).toFloat())
		head.setRotation(turn)
		hip.setRotation(turn)
		thigh.recovery.tick(start + 3610, 3610)
		val compensatedYaw = TrackerTestUtils.yaw(thigh.getRotation())
		thigh.setRotation(Quaternion.IDENTITY)
		thigh.recovery.onRotationSample(thigh.getRotationBase(), 3600, start + 3620)
		for (elapsed in 3640L..5160L step 20L) {
			thigh.recovery.onRotationSample(thigh.getRotationBase(), 20, start + elapsed)
		}
		thigh.recovery.tick(start + 5180, 20)
		assertEquals(TrackerRecoveryState.BLENDING, thigh.recovery.state)
		val measuredConfidence = thigh.recovery.confidence
		thigh.recovery.tick(start + 5700, 20)

		assertEquals(TrackerRecoveryState.NONE, thigh.recovery.state)
		assertEquals(measuredConfidence, thigh.recovery.confidence)
		assertTrue(absAngle(TrackerTestUtils.yaw(thigh.getRotation()), compensatedYaw) < 0.05f)
	}

	@Test
	fun `unverifiable yaw jump after a long gap is held, with a reset reminder after 30 s`() {
		val (configManager, server) = makeServer()
		val thigh = makeTracker(103, TrackerPosition.RIGHT_UPPER_LEG)
		register(server, thigh)
		val heldYaw = TrackerTestUtils.yaw(thigh.getRotation())
		val start = beginLongGap(thigh)

		// Returns with a yaw unrelated to the pose it left with, like a reboot.
		val rawTurn = Quaternion.rotationAroundYAxis((PI / 2.0).toFloat())
		thigh.setRotation(rawTurn)
		thigh.recovery.onRotationSample(rawTurn, 3600, start + 3610)
		assertEquals(TrackerRecoveryState.COMPENSATING, thigh.recovery.state)
		assertEquals(RecoveryReason.NO_REFERENCE, thigh.recovery.reason)
		assertTrue(!thigh.needReset)
		feed(thigh, rawTurn, start, 3630L..5700L)

		assertEquals(TrackerRecoveryState.NEEDS_RESET, thigh.recovery.state)
		assertEquals(RecoveryReason.NO_REFERENCE, thigh.recovery.reason)
		// References may still come back, so the user isn't asked yet.
		assertTrue(!thigh.needReset)
		assertEquals(0f, thigh.recovery.confidence)
		assertTrue(absAngle(TrackerTestUtils.yaw(thigh.getRotation()), heldYaw) < 0.001f)

		// Lesser resets and more samples must not accept the unverified yaw.
		thigh.recovery.tick(start + 5800, 20)
		feed(thigh, rawTurn, start, 5820L..9000L)
		assertTrue(!thigh.needReset)
		// Still held after 30 s: now the user is asked for a reset.
		thigh.recovery.tick(start + 5700 + 30_000, 20)
		assertTrue(thigh.needReset)
		thigh.resetsHandler.resetYaw(Quaternion.IDENTITY)
		thigh.resetsHandler.resetMounting(Quaternion.IDENTITY)
		assertEquals(TrackerRecoveryState.NEEDS_RESET, thigh.recovery.state)
		assertTrue(thigh.needReset)
		assertTrue(absAngle(TrackerTestUtils.yaw(thigh.getRotation()), heldYaw) < 0.001f)

		thigh.resetsHandler.resetFull(Quaternion.IDENTITY)
		assertEquals(TrackerRecoveryState.NONE, thigh.recovery.state)
		assertTrue(!thigh.needReset)
		assertEquals(configManager.vrConfig.resetsConfig.deadTrackerRecoveryEnabled, true)
	}

	@Test
	fun `long gap without references resumes own rotation when yaw is continuous`() {
		val (_, server) = makeServer()
		val thigh = makeTracker(111, TrackerPosition.RIGHT_UPPER_LEG)
		register(server, thigh)
		val restYaw = TrackerTestUtils.yaw(thigh.getRotation())
		val start = beginLongGap(thigh)

		val smallTurn = Quaternion.rotationAroundYAxis(Math.toRadians(10.0).toFloat())
		thigh.setRotation(smallTurn)
		feed(thigh, thigh.getRotationBase(), start, 3620L..5600L)
		assertEquals(TrackerRecoveryState.COMPENSATING, thigh.recovery.state)
		feed(thigh, thigh.getRotationBase(), start, 5620L..5640L)

		assertEquals(TrackerRecoveryState.BLENDING, thigh.recovery.state)
		assertEquals(TrackerStatus.BUSY, thigh.status)
		assertTrue(!thigh.needReset)
		thigh.recovery.tick(start + 6200, 20)
		assertEquals(TrackerRecoveryState.NONE, thigh.recovery.state)
		assertEquals(TrackerStatus.OK, thigh.status)
		assertEquals(Quaternion.IDENTITY, thigh.resetsHandler.recoveryYawFix)
		assertTrue(absAngle(TrackerTestUtils.yaw(thigh.getRotation()), restYaw + Math.toRadians(10.0).toFloat()) < 0.02f)
	}

	@Test
	fun `references that return after a failed recovery realign the tracker`() {
		val (_, server) = makeServer()
		val head = makeTracker(112, TrackerPosition.HEAD, isHmd = true)
		val hip = makeTracker(113, TrackerPosition.HIP)
		val thigh = makeTracker(114, TrackerPosition.LEFT_UPPER_LEG)
		register(server, head, hip, thigh)
		val start = beginLongGap(thigh)
		val expectedYaw = TrackerTestUtils.yaw(thigh.getRotation())

		// The references drop out while the thigh returns with a changed yaw.
		head.status = TrackerStatus.TIMED_OUT
		hip.status = TrackerStatus.TIMED_OUT
		val rawTurn = Quaternion.rotationAroundYAxis((PI / 2.0).toFloat())
		thigh.setRotation(rawTurn)
		feed(thigh, thigh.getRotationBase(), start, 3620L..5700L)
		assertEquals(TrackerRecoveryState.NEEDS_RESET, thigh.recovery.state)
		assertEquals(RecoveryReason.NO_REFERENCE, thigh.recovery.reason)
		assertTrue(!thigh.needReset)

		head.status = TrackerStatus.OK
		hip.status = TrackerStatus.OK
		feed(thigh, thigh.getRotationBase(), start, 60_000L..61_600L)
		thigh.recovery.tick(start + 61_620, 20)
		assertEquals(TrackerRecoveryState.BLENDING, thigh.recovery.state)
		assertTrue(!thigh.needReset)
		thigh.recovery.tick(start + 62_200, 20)

		assertEquals(TrackerRecoveryState.NONE, thigh.recovery.state)
		assertTrue(absAngle(TrackerTestUtils.yaw(thigh.getRotation()), expectedYaw) < 0.05f)
	}

	@Test
	fun `simultaneous outage of every reference does not freeze the trackers`() {
		val (_, server) = makeServer()
		val chest = makeTracker(115, TrackerPosition.CHEST)
		val hip = makeTracker(116, TrackerPosition.HIP)
		val thigh = makeTracker(117, TrackerPosition.LEFT_UPPER_LEG)
		val all = listOf(chest, hip, thigh)
		register(server, chest, hip, thigh)

		val start = System.currentTimeMillis()
		all.forEach { it.recovery.tick(start + 800, 800) }
		all.forEach { it.recovery.tick(start + 3600, 3600) }
		all.forEach { assertEquals(TrackerRecoveryState.COMPENSATING, it.recovery.state) }

		for (elapsed in 3620L..5640L step 20L) {
			all.forEach { it.recovery.onRotationSample(it.getRotationBase(), if (elapsed == 3620L) 3600 else 20, start + elapsed) }
		}
		all.forEach { it.recovery.tick(start + 6200, 20) }

		all.forEach {
			assertEquals(TrackerRecoveryState.NONE, it.recovery.state, it.name)
			assertTrue(!it.needReset, it.name)
		}
	}

	@Test
	fun `repeated recoveries do not accumulate yaw correction`() {
		val (_, server) = makeServer()
		val head = makeTracker(118, TrackerPosition.HEAD, isHmd = true)
		val hip = makeTracker(119, TrackerPosition.HIP)
		val thigh = makeTracker(120, TrackerPosition.LEFT_UPPER_LEG)
		register(server, head, hip, thigh)
		val restYaw = TrackerTestUtils.yaw(thigh.getRotation())

		var start = System.currentTimeMillis()
		for (turnDegrees in listOf(60.0, 120.0)) {
			thigh.recovery.tick(start + 800, 800)
			thigh.recovery.tick(start + 3600, 3600)
			val turn = Quaternion.rotationAroundYAxis(Math.toRadians(turnDegrees).toFloat())
			head.setRotation(turn)
			hip.setRotation(turn)
			thigh.recovery.tick(start + 3610, 3610)
			feed(thigh, thigh.getRotationBase(), start, 3620L..5160L)
			thigh.recovery.tick(start + 5180, 20)
			assertEquals(TrackerRecoveryState.BLENDING, thigh.recovery.state)
			thigh.recovery.tick(start + 5700, 20)
			assertEquals(TrackerRecoveryState.NONE, thigh.recovery.state)
			assertTrue(
				absAngle(TrackerTestUtils.yaw(thigh.getRotation()), restYaw + Math.toRadians(turnDegrees).toFloat()) < 0.05f,
				"turn=$turnDegrees actual=${Math.toDegrees(TrackerTestUtils.yaw(thigh.getRotation()).toDouble())}",
			)
			start += 10_000L
		}
	}

	@Test
	fun `moving tracker that agrees with its references resumes after a bounded wait`() {
		val (_, server) = makeServer()
		val head = makeTracker(121, TrackerPosition.HEAD, isHmd = true)
		val hip = makeTracker(122, TrackerPosition.HIP)
		val thigh = makeTracker(123, TrackerPosition.LEFT_UPPER_LEG)
		register(server, head, hip, thigh)
		val rest = thigh.getRotationBase()
		val start = beginLongGap(thigh)

		// Never still for 1.5 s: the leg keeps swinging in pitch.
		var elapsed = 3620L
		var gap = 3600L
		while (elapsed <= 9000L && thigh.recovery.state != TrackerRecoveryState.BLENDING) {
			val swing = rest * Quaternion.rotationAroundXAxis(if ((elapsed / 20L) % 2L == 0L) 0.3f else -0.3f)
			thigh.recovery.onRotationSample(swing, gap, start + elapsed)
			if (elapsed < 8500L) assertEquals(TrackerRecoveryState.WAITING_FOR_STILLNESS, thigh.recovery.state)
			gap = 20L
			elapsed += 20L
		}

		assertEquals(TrackerRecoveryState.BLENDING, thigh.recovery.state)
		assertTrue(elapsed in 8600L..8700L, "resumed at $elapsed")
		assertTrue(!thigh.needReset)
	}

	@Test
	fun `invalid rotation and changed role still require a full reset`() {
		val (_, server) = makeServer()
		val invalid = makeTracker(124, TrackerPosition.LEFT_UPPER_LEG)
		val moved = makeTracker(125, TrackerPosition.RIGHT_UPPER_LEG)
		register(server, invalid, moved)

		val now = System.currentTimeMillis()
		invalid.recovery.onRotationSample(Quaternion(Float.NaN, 0f, 0f, 0f), 20, now)
		assertEquals(TrackerRecoveryState.NEEDS_RESET, invalid.recovery.state)
		assertEquals(RecoveryReason.INVALID_ROTATION, invalid.recovery.reason)
		feed(invalid, Quaternion.IDENTITY, now, 20L..9000L)
		assertEquals(TrackerRecoveryState.NEEDS_RESET, invalid.recovery.state)

		// A held tracker whose role changes can no longer be realigned from
		// references captured for the old role.
		val start = beginLongGap(moved)
		val rawTurn = Quaternion.rotationAroundYAxis((PI / 2.0).toFloat())
		feed(moved, rawTurn, start, 3620L..5700L)
		assertEquals(RecoveryReason.NO_REFERENCE, moved.recovery.reason)
		moved.trackerPosition = TrackerPosition.RIGHT_LOWER_LEG
		feed(moved, rawTurn, start, 5720L..9000L)
		assertEquals(TrackerRecoveryState.NEEDS_RESET, moved.recovery.state)
		assertEquals(RecoveryReason.ROLE_OR_MOUNTING_CHANGED, moved.recovery.reason)
		assertTrue(moved.needReset)

		moved.resetsHandler.resetFull(Quaternion.IDENTITY)
		assertEquals(TrackerRecoveryState.NONE, moved.recovery.state)
	}

	@Test
	fun `disabling recovery releases a held tracker`() {
		val (configManager, server) = makeServer()
		val thigh = makeTracker(126, TrackerPosition.RIGHT_UPPER_LEG)
		register(server, thigh)
		val start = beginLongGap(thigh)
		val rawTurn = Quaternion.rotationAroundYAxis((PI / 2.0).toFloat())
		thigh.setRotation(rawTurn)
		feed(thigh, rawTurn, start, 3620L..5700L)
		assertEquals(TrackerRecoveryState.NEEDS_RESET, thigh.recovery.state)

		configManager.vrConfig.resetsConfig.deadTrackerRecoveryEnabled = false
		thigh.recovery.tick(start + 5720, 20)

		assertEquals(TrackerRecoveryState.NONE, thigh.recovery.state)
		assertEquals(TrackerStatus.OK, thigh.status)
		assertEquals(thigh.getRotationBase(), thigh.getRotation())
		configManager.vrConfig.resetsConfig.deadTrackerRecoveryEnabled = true
	}

	@Test
	fun `motionless tracker that still answers pings is not treated as offline`() {
		val (_, server) = makeServer()
		val thigh = makeTracker(127, TrackerPosition.LEFT_UPPER_LEG)
		register(server, thigh)

		// Firmware sends no rotation while still; only ping replies arrive.
		val quietUntil = System.nanoTime() + 1_200_000_000L
		while (System.nanoTime() < quietUntil) {
			thigh.heartbeat()
			thigh.tick(0.02f)
			assertEquals(TrackerRecoveryState.NONE, thigh.recovery.state)
			assertEquals(TrackerStatus.OK, thigh.status)
			Thread.sleep(20)
		}

		// Moving again after the quiet period is ordinary data, not a reconnect.
		val turn = Quaternion.rotationAroundYAxis((PI / 2.0).toFloat())
		thigh.setRotation(turn)
		thigh.dataTick()
		assertEquals(TrackerRecoveryState.NONE, thigh.recovery.state)
		assertEquals(TrackerStatus.OK, thigh.status)
		assertEquals(thigh.getRotationBase(), thigh.getRotation())

		// With the device itself silent, the same quiet period is a real gap.
		val silentUntil = System.nanoTime() + 900_000_000L
		while (System.nanoTime() < silentUntil) {
			thigh.tick(0.02f)
			Thread.sleep(20)
		}
		assertEquals(TrackerRecoveryState.BRIDGING_GAP, thigh.recovery.state)
	}

	@Test
	fun `stillness completes for a tracker that stops sending rotation`() {
		val (_, server) = makeServer()
		val head = makeTracker(128, TrackerPosition.HEAD, isHmd = true)
		val hip = makeTracker(129, TrackerPosition.HIP)
		val thigh = makeTracker(130, TrackerPosition.LEFT_UPPER_LEG)
		register(server, head, hip, thigh)
		val start = beginLongGap(thigh)

		// One sample on reconnect, then the motionless tracker only pings.
		thigh.recovery.onRotationSample(thigh.getRotationBase(), 3600, start + 3620)
		assertEquals(TrackerRecoveryState.WAITING_FOR_STILLNESS, thigh.recovery.state)
		thigh.recovery.tick(start + 4000, 400)
		assertEquals(TrackerRecoveryState.WAITING_FOR_STILLNESS, thigh.recovery.state)
		thigh.recovery.tick(start + 5200, 400)
		assertEquals(TrackerRecoveryState.BLENDING, thigh.recovery.state)
	}

	@Test
	fun `short gap blends without a reset or references`() {
		val configManager = ConfigManager("test-config.yml")
		configManager.loadConfig()
		configManager.vrConfig.vrcOSC.enabled = false
		configManager.vrConfig.vrcOSC.oscqueryEnabled = false
		VRServer(configManager = configManager)
		val thigh = makeTracker(107, TrackerPosition.LEFT_UPPER_LEG)
		thigh.setRotation(Quaternion.IDENTITY)
		thigh.status = TrackerStatus.OK
		thigh.dataTick()

		val start = System.currentTimeMillis()
		thigh.recovery.tick(start + 800, 800)
		assertEquals(TrackerRecoveryState.BRIDGING_GAP, thigh.recovery.state)
		val rawTurn = Quaternion.rotationAroundYAxis((PI / 6.0).toFloat())
		thigh.setRotation(rawTurn)
		thigh.recovery.onRotationSample(thigh.getRotationBase(), 900, start + 900)
		assertEquals(TrackerRecoveryState.BLENDING, thigh.recovery.state)
		assertTrue(!thigh.needReset)
		thigh.recovery.tick(start + 1500, 20)
		assertEquals(TrackerRecoveryState.NONE, thigh.recovery.state)
		assertEquals(0.85f, thigh.recovery.confidence)
	}

	@Test
	fun `disagreeing references hold the tracker and ask for a reset after 30 s`() {
		val (thigh, start) = longGapWithReferences(90f, -90f)
		val heldYaw = TrackerTestUtils.yaw(thigh.getRotation())
		thigh.recovery.onRotationSample(thigh.getRotationBase(), 3600, start + 3620)
		assertEquals(TrackerRecoveryState.COMPENSATING, thigh.recovery.state)
		assertEquals(RecoveryReason.REFERENCE_DISAGREEMENT, thigh.recovery.reason)
		feed(thigh, thigh.getRotationBase(), start, 3640L..5700L)

		assertEquals(TrackerRecoveryState.NEEDS_RESET, thigh.recovery.state)
		assertEquals(RecoveryReason.REFERENCE_DISAGREEMENT, thigh.recovery.reason)
		assertTrue(!thigh.needReset)
		assertTrue(absAngle(TrackerTestUtils.yaw(thigh.getRotation()), heldYaw) < 0.001f)
		thigh.recovery.tick(start + 5700 + 30_000, 20)
		assertTrue(thigh.needReset)
	}

	@Test
	fun `low confidence references resume without applying a correction`() {
		val (thigh, start) = longGapWithReferences(0f, 8f)
		feed(thigh, thigh.getRotationBase(), start, 3620L..5640L)

		assertEquals(TrackerRecoveryState.BLENDING, thigh.recovery.state)
		assertEquals(0.5f, thigh.recovery.confidence)
		assertEquals(Quaternion.IDENTITY, thigh.resetsHandler.recoveryYawFix)
		assertTrue(!thigh.needReset)
	}

	@Test
	fun `validated reference confidence survives blend completion`() {
		val (thigh, start) = longGapWithReferences(90f, 92f)
		thigh.recovery.onRotationSample(thigh.getRotationBase(), 3600, start + 3620)
		for (elapsed in 3640L..5160L step 20L) {
			thigh.recovery.onRotationSample(thigh.getRotationBase(), 20, start + elapsed)
		}
		thigh.recovery.tick(start + 5180, 20)
		assertEquals(TrackerRecoveryState.BLENDING, thigh.recovery.state)
		val confidence = thigh.recovery.confidence
		assertTrue(confidence in 0.75f..<1f)
		thigh.recovery.tick(start + 5700, 20)
		assertEquals(TrackerRecoveryState.NONE, thigh.recovery.state)
		assertEquals(confidence, thigh.recovery.confidence)
		assertTrue(!thigh.needReset)
	}

	@Test
	fun `torso tracker recovers from two torso references without an HMD`() {
		val configManager = ConfigManager("test-config.yml")
		configManager.loadConfig()
		configManager.vrConfig.vrcOSC.enabled = false
		configManager.vrConfig.vrcOSC.oscqueryEnabled = false
		val server = VRServer(configManager = configManager)

		val chest = makeTracker(104, TrackerPosition.CHEST)
		val hip = makeTracker(105, TrackerPosition.HIP)
		val waist = makeTracker(106, TrackerPosition.WAIST)
		val trackerField = VRServer::class.java.getDeclaredField("trackers")
		trackerField.isAccessible = true
		@Suppress("UNCHECKED_CAST")
		val trackers = trackerField.get(server) as MutableList<Tracker>
		trackers.addAll(listOf(chest, hip, waist))

		listOf(chest, hip, waist).forEach {
			it.setRotation(Quaternion.IDENTITY)
			it.status = TrackerStatus.OK
			it.dataTick()
		}

		val start = System.currentTimeMillis()
		chest.recovery.tick(start + 800, 800)
		chest.recovery.tick(start + 3600, 3600)
		assertEquals(TrackerRecoveryState.COMPENSATING, chest.recovery.state)

		val turn = Quaternion.rotationAroundYAxis((PI / 2.0).toFloat())
		hip.setRotation(turn)
		waist.setRotation(turn)
		chest.recovery.tick(start + 3610, 3610)
		val compensatedYaw = TrackerTestUtils.yaw(chest.getRotation())
		chest.setRotation(Quaternion.IDENTITY)
		chest.recovery.onRotationSample(chest.getRotationBase(), 3600, start + 3620)
		for (elapsed in 3640L..5160L step 20L) {
			chest.recovery.onRotationSample(chest.getRotationBase(), 20, start + elapsed)
		}
		chest.recovery.tick(start + 5180, 20)

		assertEquals(TrackerRecoveryState.BLENDING, chest.recovery.state)
		chest.recovery.tick(start + 5700, 20)
		assertEquals(TrackerRecoveryState.NONE, chest.recovery.state)
		assertTrue(
			absAngle(TrackerTestUtils.yaw(chest.getRotation()), compensatedYaw) < 0.05f,
			"actual=${TrackerTestUtils.yaw(chest.getRotation())} expected=$compensatedYaw",
		)
	}

	private fun longGapWithReferences(headYawDegrees: Float, hipYawDegrees: Float): Pair<Tracker, Long> {
		val configManager = ConfigManager("test-config.yml")
		configManager.loadConfig()
		configManager.vrConfig.vrcOSC.enabled = false
		configManager.vrConfig.vrcOSC.oscqueryEnabled = false
		val server = VRServer(configManager = configManager)
		val head = makeTracker(108, TrackerPosition.HEAD, isHmd = true)
		val hip = makeTracker(109, TrackerPosition.HIP)
		val thigh = makeTracker(110, TrackerPosition.LEFT_UPPER_LEG)
		val trackerField = VRServer::class.java.getDeclaredField("trackers")
		trackerField.isAccessible = true
		@Suppress("UNCHECKED_CAST")
		val trackers = trackerField.get(server) as MutableList<Tracker>
		trackers.addAll(listOf(head, hip, thigh))
		listOf(head, hip, thigh).forEach {
			it.setRotation(Quaternion.IDENTITY)
			it.status = TrackerStatus.OK
			it.dataTick()
		}
		val start = System.currentTimeMillis()
		thigh.recovery.tick(start + 800, 800)
		thigh.recovery.tick(start + 3600, 3600)
		head.setRotation(Quaternion.rotationAroundYAxis(Math.toRadians(headYawDegrees.toDouble()).toFloat()))
		hip.setRotation(Quaternion.rotationAroundYAxis(Math.toRadians(hipYawDegrees.toDouble()).toFloat()))
		thigh.recovery.tick(start + 3610, 3610)
		return thigh to start
	}

	private fun makeServer(): Pair<ConfigManager, VRServer> {
		val configManager = ConfigManager("test-config.yml")
		configManager.loadConfig()
		configManager.vrConfig.vrcOSC.enabled = false
		configManager.vrConfig.vrcOSC.oscqueryEnabled = false
		return configManager to VRServer(configManager = configManager)
	}

	private fun register(server: VRServer, vararg added: Tracker) {
		val trackerField = VRServer::class.java.getDeclaredField("trackers")
		trackerField.isAccessible = true
		@Suppress("UNCHECKED_CAST")
		(trackerField.get(server) as MutableList<Tracker>).addAll(added)
		added.forEach {
			it.setRotation(Quaternion.IDENTITY)
			it.status = TrackerStatus.OK
			it.dataTick()
		}
	}

	/** Leaves the tracker compensating for a gap that started at the returned time. */
	private fun beginLongGap(tracker: Tracker): Long {
		val start = System.currentTimeMillis()
		tracker.recovery.tick(start + 800, 800)
		tracker.recovery.tick(start + 3600, 3600)
		assertEquals(TrackerRecoveryState.COMPENSATING, tracker.recovery.state)
		return start
	}

	/** Delivers 50 Hz samples; the first one closes a long gap if one is open. */
	private fun feed(tracker: Tracker, rotation: Quaternion, start: Long, elapsed: LongRange) {
		for (time in elapsed step 20L) {
			val gap = if (tracker.recovery.state == TrackerRecoveryState.COMPENSATING && time == elapsed.first && tracker.recovery.reason == RecoveryReason.TRACKER_OFFLINE) 3600L else 20L
			tracker.recovery.onRotationSample(rotation, gap, start + time)
		}
	}

	private fun makeTracker(id: Int, position: TrackerPosition, isHmd: Boolean = false) = Tracker(
		device = null,
		id = id,
		name = "recovery-$id",
		trackerPosition = position,
		trackerNum = id,
		hasPosition = isHmd,
		hasRotation = true,
		userEditable = true,
		isComputed = isHmd,
		imuType = if (isHmd) null else IMUType.BMI160,
		usesTimeout = true,
		allowReset = !isHmd,
		allowMounting = !isHmd,
		trackRotDirection = false,
		isHmd = isHmd,
	)

	private fun absAngle(a: Float, b: Float): Float {
		var delta = a - b
		while (delta > PI) delta -= (2.0 * PI).toFloat()
		while (delta < -PI) delta += (2.0 * PI).toFloat()
		return kotlin.math.abs(delta)
	}
}
