package dev.slimevr.unit

import dev.slimevr.config.config
import dev.slimevr.math.Angle
import dev.slimevr.tracking.telemetry.TrackerTelemetryLogger
import dev.slimevr.tracking.trackers.Tracker
import dev.slimevr.tracking.trackers.TrackerPosition
import dev.slimevr.tracking.trackers.TrackerStatus
import dev.slimevr.tracking.trackers.udp.IMUType
import io.github.axisangles.ktmath.Quaternion
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test
import kotlin.math.PI

@Disabled("Drift auto-learning is switched off until the recorded-data redesign")
class AdaptiveTrackerProfileTests {

	private fun createImuTracker(
		imu: IMUType = IMUType.UNKNOWN,
		name: String = "TestTracker",
		position: TrackerPosition = TrackerPosition.CHEST,
	): Tracker = Tracker(
		device = null,
		id = 1,
		name = name,
		trackerPosition = position,
		trackerNum = 0,
		hasPosition = false,
		hasRotation = true,
		isComputed = false,
		imuType = imu,
		allowReset = true,
		allowMounting = true,
		isHmd = false,
		trackRotDirection = false,
	).apply { status = TrackerStatus.OK }

	@Test
	fun `adaptive learning and correction default to enabled`() {
		val tracker = createImuTracker(name = "DefaultAdaptiveProfile")

		assertTrue(tracker.config.autoLearnDrift)
		assertFalse(tracker.config.adaptiveDriftLearningPaused)
		assertTrue(tracker.config.allowDriftCompensation == true)
		assertTrue(tracker.resetsHandler.allowDriftCompensation)
	}

	@Test
	fun `BNO tracker config defaults correction off but keeps explicit saved value`() {
		val tracker = createImuTracker(IMUType.BNO085, "BnoCorrectionDefault")
		tracker.readConfig(tracker.config)

		assertFalse(tracker.config.allowDriftCompensation == true)
		assertFalse(tracker.resetsHandler.allowDriftCompensation)

		tracker.config.allowDriftCompensation = true
		tracker.readConfig(tracker.config)
		assertTrue(tracker.resetsHandler.allowDriftCompensation)
	}

	@Test
	fun `test MPU6050 preset seeds 4_5 deg per min`() {
		val tracker = createImuTracker(name = "PresetMPU")
		tracker.config.imuProfileOverride = "mpu6050"
		tracker.resetsHandler.readAdaptiveProfile(tracker.config)

		assertEquals(4.5f, tracker.config.learnedDriftRateDegPerMin, 0.001f)
		assertTrue(tracker.resetsHandler.compensateDrift)
		assertEquals(0.0f, tracker.resetsHandler.adaptiveYawCorrectionDegrees, 0.001f)
	}

	@Test
	fun `persisted measured drift restores the inverse correction sign`() {
		val tracker = createImuTracker(name = "RestoreMeasuredDrift")
		tracker.config.learnedDriftRateDegPerMin = 6.0f
		tracker.config.totalDriftObservations = 2
		tracker.config.adaptiveDriftLastAcceptedAt = System.currentTimeMillis() - 60_000L

		tracker.resetsHandler.readAdaptiveProfile(tracker.config)

		assertEquals(-6.0f, tracker.resetsHandler.adaptiveYawCorrectionDegrees, 0.05f)
	}

	@Test
	fun `test BMI160 preset seeds 3_15 deg per min`() {
		val tracker = createImuTracker(name = "PresetBMI")
		tracker.config.imuProfileOverride = "bmi160"
		tracker.resetsHandler.readAdaptiveProfile(tracker.config)

		assertEquals(3.15f, tracker.config.learnedDriftRateDegPerMin, 0.001f)
		assertTrue(tracker.resetsHandler.compensateDrift)
	}

	@Test
	fun `test LSM6_ICM preset seeds 0_85 deg per min`() {
		val tracker = createImuTracker(name = "PresetLSM")
		tracker.config.imuProfileOverride = "lsm6_icm"
		tracker.resetsHandler.readAdaptiveProfile(tracker.config)

		assertEquals(0.85f, tracker.config.learnedDriftRateDegPerMin, 0.001f)
		assertTrue(tracker.resetsHandler.compensateDrift)
	}

	@Test
	fun `test BNO085 preset disables drift compensation`() {
		val tracker = createImuTracker(IMUType.BNO085, "PresetBNO")
		tracker.config.imuProfileOverride = "bno085"
		tracker.resetsHandler.readAdaptiveProfile(tracker.config)

		assertEquals(0.0f, tracker.config.learnedDriftRateDegPerMin, 0.001f)
		assertFalse(tracker.resetsHandler.compensateDrift)
	}

	@Test
	fun `test resetLearnedDrift clears learned drift`() {
		val tracker = createImuTracker(name = "ResetLearned")
		tracker.config.imuProfileOverride = "mpu6050"
		tracker.resetsHandler.readAdaptiveProfile(tracker.config)
		assertEquals(4.5f, tracker.config.learnedDriftRateDegPerMin, 0.001f)

		tracker.resetsHandler.resetLearnedDrift()
		assertEquals(0.0f, tracker.config.learnedDriftRateDegPerMin, 0.001f)
		assertEquals(0, tracker.config.totalDriftObservations)
	}

	@Test
	fun `test profile override is applied and replaces active baseline`() {
		val tracker = createImuTracker(name = "ProfileOverride")

		tracker.resetsHandler.setAdaptiveProfileOverride("mpu6050")
		assertEquals("mpu6050", tracker.config.imuProfileOverride)
		assertEquals(4.5f, tracker.config.learnedDriftRateDegPerMin, 0.001f)
		assertTrue(tracker.resetsHandler.compensateDrift)

		tracker.resetsHandler.setAdaptiveProfileOverride("bno085")
		assertEquals("bno085", tracker.config.imuProfileOverride)
		assertEquals(0.0f, tracker.config.learnedDriftRateDegPerMin, 0.001f)
		assertFalse(tracker.resetsHandler.compensateDrift)
	}

	@Test
	fun `high confidence reconnect observation updates persistent drift`() {
		val tracker = createImuTracker(name = "ReconnectObservation")
		tracker.config.learnedDriftRateDegPerMin = 0.0f

		tracker.resetsHandler.learnDriftObservation(PI.toFloat() / 180f, 60_000L, 1.0f)

		assertEquals(0.35f, tracker.config.learnedDriftRateDegPerMin, 0.001f)
		assertEquals(1, tracker.config.totalDriftObservations)
	}

	@Test
	fun `low confidence short and extreme observations are ignored`() {
		val tracker = createImuTracker(name = "ReconnectObservationFilters")
		tracker.config.learnedDriftRateDegPerMin = 1.5f

		tracker.resetsHandler.learnDriftObservation(PI.toFloat() / 6f, 60_000L, 0.5f)
		tracker.resetsHandler.learnDriftObservation(PI.toFloat() / 18f, 1_000L, 1.0f)
		tracker.resetsHandler.learnDriftObservation(PI.toFloat() / 3f, 60_000L, 1.0f)

		assertEquals(1.5f, tracker.config.learnedDriftRateDegPerMin, 0.001f)
		assertEquals(0, tracker.config.totalDriftObservations)
	}

	@Test
	fun `manual full reset rebases active corrections without deleting the learned rate`() {
		val tracker = createImuTracker(name = "ManualResetRebase")
		tracker.config.learnedDriftRateDegPerMin = 2.0f
		tracker.config.totalDriftObservations = 2
		tracker.stayAligned.yawCorrection = Angle.ofDeg(8f)
		repeat(40) {
			tracker.resetsHandler.setAdaptiveYawCorrectionTarget(Angle.ofDeg(12f).toRad(), 0.1f)
		}

		tracker.setRotation(Quaternion.IDENTITY)
		tracker.resetsHandler.resetFull(Quaternion.IDENTITY)

		assertEquals(2.0f, tracker.config.learnedDriftRateDegPerMin, 0.001f)
		assertEquals(0.0f, tracker.resetsHandler.adaptiveYawCorrectionDegrees, 0.001f)
		assertEquals(0.0f, tracker.stayAligned.yawCorrection.toDeg(), 0.001f)
		assertEquals(0.0f, tracker.getRotation().toEulerAngles(io.github.axisangles.ktmath.EulerOrder.YZX).y, 0.001f)
	}

	@Test
	fun `mounting reset does not bake adaptive or stay aligned yaw into feet and torso alignment`() {
		val baseline = createImuTracker(name = "MountingResetBaseline", position = TrackerPosition.LEFT_FOOT)
		val corrected = createImuTracker(name = "MountingResetCorrected", position = TrackerPosition.LEFT_FOOT)
		val rawMountingPose = Quaternion(0.707f, 0.707f, 0f, 0f)

		baseline.setRotation(Quaternion.IDENTITY)
		corrected.setRotation(Quaternion.IDENTITY)
		baseline.resetsHandler.resetFull(Quaternion.IDENTITY)
		corrected.resetsHandler.resetFull(Quaternion.IDENTITY)
		corrected.stayAligned.yawCorrection = Angle.ofDeg(8f)
		repeat(40) {
			corrected.resetsHandler.setAdaptiveYawCorrectionTarget(Angle.ofDeg(12f).toRad(), 0.1f)
		}

		baseline.setRotation(rawMountingPose)
		corrected.setRotation(rawMountingPose)
		baseline.resetsHandler.resetMounting(Quaternion.IDENTITY)
		corrected.resetsHandler.resetMounting(Quaternion.IDENTITY)

		assertTrue(TrackerTestUtils.quatApproxEqual(baseline.resetsHandler.mountRotFix, corrected.resetsHandler.mountRotFix, 0.001f))
		assertTrue(TrackerTestUtils.quatApproxEqual(baseline.getRotation(), corrected.getRotation(), 0.001f))
	}

	@Test
	fun `test telemetry logger start and stop`() {
		val dir = TrackerTelemetryLogger.getTelemetryDirectory()
		assertTrue(dir.exists())

		val file = TrackerTelemetryLogger.startSession()
		assertTrue(TrackerTelemetryLogger.isRecording())
		assertTrue(file != null && file.exists())

		val stopped = TrackerTelemetryLogger.stopSession()
		assertEquals(file, stopped)
		assertFalse(TrackerTelemetryLogger.isRecording())
	}
}
