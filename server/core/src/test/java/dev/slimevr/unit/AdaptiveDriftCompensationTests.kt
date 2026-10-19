package dev.slimevr.unit

import dev.slimevr.config.config
import dev.slimevr.tracking.trackers.AdaptiveDriftCompensation
import dev.slimevr.tracking.trackers.AdaptiveDriftFreezeReason
import dev.slimevr.tracking.trackers.Tracker
import dev.slimevr.tracking.trackers.TrackerPosition
import dev.slimevr.tracking.trackers.TrackerStatus
import dev.slimevr.tracking.trackers.udp.IMUType
import io.github.axisangles.ktmath.Quaternion
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test
import kotlin.math.PI

@Disabled("Drift auto-learning is switched off until the recorded-data redesign")
class AdaptiveDriftCompensationTests {
	private fun imu(id: Int, position: TrackerPosition): Tracker = Tracker(
		device = null,
		id = id,
		name = "imu-$id",
		trackerPosition = position,
		hasRotation = true,
		imuType = IMUType.UNKNOWN,
		allowReset = true,
		trackRotDirection = false,
	).apply {
		status = TrackerStatus.OK
		resetsHandler.allowDriftCompensation = true
	}

	private fun opticalHead(id: Int): Tracker = Tracker(
		device = null,
		id = id,
		name = "hmd-$id",
		trackerPosition = TrackerPosition.HEAD,
		hasPosition = true,
		hasRotation = true,
		isHmd = true,
		trackRotDirection = false,
	).apply { status = TrackerStatus.OK }

	@Test
	fun `stable pose learns slow torso yaw only with independent geometry`() {
		val target = imu(1, TrackerPosition.CHEST)
		val hip = imu(2, TrackerPosition.HIP)
		val hmd = opticalHead(3)
		val trackers = listOf(target, hip, hmd)
		val start = System.nanoTime()

		trackers.forEach {
			it.setRotation(Quaternion.IDENTITY)
			it.dataTick(start)
		}
		repeat(351) { index ->
			val yaw = index * 0.01f * PI.toFloat() / 180f
			target.setRotation(Quaternion.rotationAroundYAxis(yaw))
			val timestamp = start + index * 100_000_000L
			target.dataTick(timestamp)
			AdaptiveDriftCompensation.update(trackers, timestamp, 0.1f)
		}

		assertEquals(1, target.config.totalDriftObservations)
		assertTrue(target.config.learnedDriftRateDegPerMin > 0f)
		assertTrue(target.resetsHandler.adaptiveYawCorrectionDegrees < 0f)
		AdaptiveDriftCompensation.clear(target)
	}

	@Test
	fun `chest and hip alone cannot establish absolute yaw`() {
		val target = imu(11, TrackerPosition.CHEST)
		val hip = imu(12, TrackerPosition.HIP)
		val trackers = listOf(target, hip)
		val start = System.nanoTime()

		repeat(351) { index ->
			val timestamp = start + index * 100_000_000L
			target.setRotation(Quaternion.rotationAroundYAxis(index * 0.01f * PI.toFloat() / 180f))
			target.dataTick(timestamp)
			hip.dataTick()
			AdaptiveDriftCompensation.update(trackers, timestamp, 0.1f)
		}

		assertEquals(0, target.config.totalDriftObservations)
		assertEquals(AdaptiveDriftFreezeReason.NO_REFERENCE, target.adaptiveDriftStatus.freezeReason)
		AdaptiveDriftCompensation.clear(target)
	}
}
