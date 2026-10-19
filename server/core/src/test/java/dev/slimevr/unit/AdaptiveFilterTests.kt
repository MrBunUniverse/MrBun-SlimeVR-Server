package dev.slimevr.unit

import dev.slimevr.filtering.QuaternionMovingAverage
import dev.slimevr.filtering.TrackerFilters
import io.github.axisangles.ktmath.Quaternion
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.PI

class AdaptiveFilterTests {
	@Test
	fun `angular velocity follows packet interval instead of server frame`() {
		val fast = QuaternionMovingAverage(TrackerFilters.ADAPTIVE_HYBRID, 0.2f)
		fast.addQuaternion(Quaternion.IDENTITY, 1_000_000_000L)
		fast.addQuaternion(Quaternion.rotationAroundYAxis(0.01f), 1_005_000_000L)

		val slow = QuaternionMovingAverage(TrackerFilters.ADAPTIVE_HYBRID, 0.2f)
		slow.addQuaternion(Quaternion.IDENTITY, 1_000_000_000L)
		slow.addQuaternion(Quaternion.rotationAroundYAxis(0.01f), 1_050_000_000L)

		assertTrue(fast.angularVelocityRadPerSec > slow.angularVelocityRadPerSec * 5f)
		assertTrue(fast.packetIntervalMs < slow.packetIntervalMs)
	}

	@Test
	fun `prediction horizon stays within the low latency bound`() {
		val filter = QuaternionMovingAverage(TrackerFilters.ADAPTIVE_HYBRID, 0.2f)
		filter.addQuaternion(Quaternion.IDENTITY, 1_000_000_000L)
		filter.addQuaternion(Quaternion.rotationAroundYAxis(0.1f), 1_016_000_000L)

		assertTrue(filter.predictionHorizonMs in 8f..12f)
	}

	@Test
	fun `packet gap removes overshoot after a burst`() {
		val filter = QuaternionMovingAverage(TrackerFilters.ADAPTIVE_HYBRID, 0.2f)
		filter.addQuaternion(Quaternion.IDENTITY, 1_000_000_000L)
		filter.addQuaternion(Quaternion.rotationAroundYAxis(10f * PI.toFloat() / 180f), 1_010_000_000L)
		filter.update(0.01f)
		filter.addQuaternion(Quaternion.rotationAroundYAxis(20f * PI.toFloat() / 180f), 1_070_000_000L)
		repeat(30) { filter.update(0.01f) }

		val outputAngle = filter.filteredQuaternion.angleToR(Quaternion.IDENTITY)
		assertTrue(outputAngle <= 20f * PI.toFloat() / 180f + 0.01f)
	}
}
