package dev.slimevr.unit

import dev.slimevr.reset.StandStillDetector
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class StandStillDetectorTests {
	private val head = Vector3(0f, 1.6f, 0f)
	private val level = Quaternion.IDENTITY
	private val trackers = listOf(Quaternion.IDENTITY, Quaternion.rotationAroundYAxis(1f))
	private val height = 1.65f

	@Test
	fun firesAfterHoldingStill() {
		val d = StandStillDetector()
		assertFalse(d.update(0, head, level, trackers, height))
		assertFalse(d.update(1000, head, level, trackers, height))
		assertTrue(d.update(2000, head, level, trackers, height))
	}

	@Test
	fun movingRestartsTheHold() {
		val d = StandStillDetector()
		d.update(0, head, level, trackers, height)
		// A tracker turns 10 degrees at 1.5 s, so the hold restarts there
		val turned = listOf(Quaternion.rotationAroundYAxis(0.17f), trackers[1])
		assertFalse(d.update(1500, head, level, turned, height))
		assertFalse(d.update(3000, head, level, turned, height))
		assertTrue(d.update(3500, head, level, turned, height))
	}

	@Test
	fun ignoresSittingAndTiltedHead() {
		val d = StandStillDetector()
		val sitting = Vector3(0f, 1.1f, 0f)
		val lookingDown = Quaternion.fromRotationVector(-0.8f, 0f, 0f)
		for (t in 0L..5000L step 500) {
			assertFalse(d.update(t, sitting, level, trackers, height))
		}
		for (t in 0L..5000L step 500) {
			assertFalse(d.update(t, head, lookingDown, trackers, height))
		}
	}
}
