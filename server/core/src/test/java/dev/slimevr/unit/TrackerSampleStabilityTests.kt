package dev.slimevr.unit

import dev.slimevr.tracking.trackers.AdaptiveDriftFreezeReason
import dev.slimevr.tracking.trackers.PoseStabilityEstimator
import dev.slimevr.tracking.trackers.Tracker
import dev.slimevr.tracking.trackers.TrackerPosition
import dev.slimevr.tracking.trackers.TrackerStatus
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TrackerSampleStabilityTests {
	@Test
	fun `mailbox replacement keeps packet 23 rotation paired with its acceleration`() {
		val tracker = makeTracker()
		val firstRotation = Quaternion.rotationAroundYAxis(0.1f)
		val latestRotation = Quaternion.rotationAroundYAxis(0.2f)
		val firstAcceleration = Vector3(1f, 0f, 0f)
		val latestAcceleration = Vector3(0f, 9.8f, 0f)
		val arrival = System.nanoTime()

		tracker.ingestSample(firstRotation, firstAcceleration, arrival)
		tracker.ingestSample(latestRotation, latestAcceleration, arrival + 10_000_000L)
		tracker.tick(0.001f)

		assertTrue(tracker.getRawRotation().angleToR(latestRotation) < 0.001f)
		assertEquals(latestAcceleration, tracker.getRawAcceleration())
	}

	@Test
	fun `older packet 4 acceleration cannot replace newer paired acceleration`() {
		val tracker = makeTracker()
		val pairedAcceleration = Vector3(0f, 9.8f, 0f)
		val separateAcceleration = Vector3(1f, 2f, 3f)
		val arrival = System.nanoTime()

		tracker.setAcceleration(separateAcceleration, arrival + 5_000_000L)
		tracker.ingestSample(Quaternion.IDENTITY, pairedAcceleration, arrival + 10_000_000L)
		tracker.tick(0.001f)

		assertEquals(pairedAcceleration, tracker.getRawAcceleration())
	}

	@Test
	fun `missing stale and zero acceleration cannot prove a stable pose`() {
		val tracker = makeTracker()
		val estimator = PoseStabilityEstimator()
		val arrival = System.nanoTime()

		assertEquals(
			AdaptiveDriftFreezeReason.PACKET_QUALITY,
			estimator.evaluate(tracker, emptyList(), arrival).reason,
		)

		tracker.setAcceleration(Vector3(0f, 9.8f, 0f), arrival)
		tracker.tick(0.001f)
		assertTrue(estimator.evaluate(tracker, emptyList(), arrival + 1L).stable)
		assertFalse(tracker.hasFreshAcceleration(arrival + 250_000_001L))
		assertEquals(
			AdaptiveDriftFreezeReason.PACKET_QUALITY,
			estimator.evaluate(tracker, emptyList(), arrival + 250_000_001L).reason,
		)

		val zeroTracker = makeTracker()
		zeroTracker.setAcceleration(Vector3.NULL, arrival)
		zeroTracker.tick(0.001f)
		assertFalse(estimator.evaluate(zeroTracker, emptyList(), arrival + 1L).stable)
	}

	private fun makeTracker() = Tracker(
		device = null,
		id = 1,
		name = "sample-test",
		trackerPosition = TrackerPosition.CHEST,
		hasRotation = true,
		hasAcceleration = true,
		allowReset = false,
		trackRotDirection = false,
	).apply {
		status = TrackerStatus.OK
	}
}
