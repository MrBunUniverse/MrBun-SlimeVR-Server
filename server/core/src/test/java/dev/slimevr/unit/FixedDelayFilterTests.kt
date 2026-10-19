package dev.slimevr.unit

import dev.slimevr.filtering.QuaternionMovingAverage
import dev.slimevr.filtering.TrackerFilters
import io.github.axisangles.ktmath.Quaternion
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.abs
import kotlin.math.max

class FixedDelayFilterTests {
	private val start = 1_000_000_000L
	private val turnRate = 2f // rad/s

	private fun yawAt(millis: Long) = Quaternion.rotationAroundYAxis(turnRate * millis / 1000f)

	private fun yawOf(q: Quaternion) = Quaternion.IDENTITY.angleToR(q)

	/**
	 * Runs a steady turn through the filter at a 1 ms server tick. Packets are
	 * sampled every 20 ms and arrive at the millisecond given by [arrival], or
	 * not at all when it returns null. Returns the output yaw per millisecond.
	 */
	private fun run(
		filter: QuaternionMovingAverage,
		durationMs: Long,
		arrival: (sampleMs: Long) -> Long? = { it },
	): FloatArray {
		val arrivals = HashMap<Long, Long>()
		for (sampleMs in 0..durationMs step 20) arrival(sampleMs)?.let { arrivals[it] = sampleMs }
		val output = FloatArray(durationMs.toInt() + 1)
		for (now in 0..durationMs) {
			arrivals[now]?.let { filter.addQuaternion(yawAt(it), start + now * 1_000_000L) }
			filter.update(0.001f)
			output[now.toInt()] = yawOf(filter.filteredQuaternion)
		}
		return output
	}

	private fun largestStep(output: FloatArray, from: Int): Float {
		var largest = 0f
		for (i in from + 1 until output.size) largest = max(largest, abs(output[i] - output[i - 1]))
		return largest
	}

	@Test
	fun `presets map the amount to a delay in milliseconds`() {
		assertEquals(10f, QuaternionMovingAverage(TrackerFilters.FIXED_DELAY, 0.1f).effectiveLatencyMs, 0.01f)
		assertEquals(30f, QuaternionMovingAverage(TrackerFilters.FIXED_DELAY, 0.3f).effectiveLatencyMs, 0.01f)
		assertEquals(50f, QuaternionMovingAverage(TrackerFilters.FIXED_DELAY, 0.5f).effectiveLatencyMs, 0.01f)
	}

	@Test
	fun `steady motion is reproduced a fixed time late`() {
		val output = run(QuaternionMovingAverage(TrackerFilters.FIXED_DELAY, 0.5f), 600)

		for (now in 200..600) {
			val expected = turnRate * (now - 50) / 1000f
			assertEquals(expected, output[now], 0.006f, "at $now ms")
		}
	}

	@Test
	fun `a single lost packet inside the delay is invisible`() {
		val output = run(QuaternionMovingAverage(TrackerFilters.FIXED_DELAY, 0.5f), 600) {
			if (it == 300L) null else it
		}

		for (now in 200..600) {
			val expected = turnRate * (now - 50) / 1000f
			assertEquals(expected, output[now], 0.006f, "at $now ms")
		}
		// Evenly paced: no stall and no catch-up jump around the loss.
		assertTrue(largestStep(output, 200) < turnRate * 0.001f * 2f)
	}

	@Test
	fun `packets delivered late and bunched do not stall the motion`() {
		// The 300 ms sample is held up and arrives together with the next one.
		val output = run(QuaternionMovingAverage(TrackerFilters.FIXED_DELAY, 0.5f), 600) {
			if (it == 300L) 319L else it
		}

		for (now in 260..380) {
			assertTrue(output[now] > output[now - 5], "motion stalled at $now ms")
		}
	}

	@Test
	fun `a gap longer than the delay holds and then resumes without a jump`() {
		// 120 ms with nothing delivered, far beyond the 50 ms delay.
		val output = run(QuaternionMovingAverage(TrackerFilters.FIXED_DELAY, 0.5f), 700) {
			if (it in 300L..400L) null else it
		}

		// The pose is held, never extrapolated past real data.
		assertEquals(output[345], output[400], 0.0001f)
		// It then catches up over the delay window rather than snapping.
		val catchUp = turnRate * 0.140f
		assertTrue(largestStep(output, 200) < catchUp / 50f * 1.5f, "step ${largestStep(output, 200)}")
		assertEquals(turnRate * 0.650f, output[700], 0.006f)
	}

	@Test
	fun `moving after a long stillness eases in instead of jumping`() {
		val filter = QuaternionMovingAverage(TrackerFilters.FIXED_DELAY, 0.5f)
		// Motionless trackers send nothing: one sample, then 5 s of silence.
		filter.addQuaternion(Quaternion.IDENTITY, start)
		for (i in 0 until 5000) filter.update(0.001f)
		val moved = Quaternion.rotationAroundYAxis(0.5f)
		filter.addQuaternion(moved, start + 5_000_000_000L)

		var previous = yawOf(filter.filteredQuaternion)
		var largest = 0f
		for (i in 0 until 60) {
			filter.update(0.001f)
			val yaw = yawOf(filter.filteredQuaternion)
			largest = max(largest, abs(yaw - previous))
			previous = yaw
		}

		assertEquals(0.5f, previous, 0.001f)
		assertTrue(largest < 0.5f / 50f * 1.5f, "jumped $largest rad in one tick")
	}

	@Test
	fun `zero delay passes the newest sample through`() {
		val filter = QuaternionMovingAverage(TrackerFilters.FIXED_DELAY, 0f)
		val moved = Quaternion.rotationAroundYAxis(0.5f)
		filter.addQuaternion(moved, start)
		filter.update(0.001f)

		assertEquals(0.5f, yawOf(filter.filteredQuaternion), 0.001f)
	}

	@Test
	fun `reset installs the new pose immediately`() {
		val filter = QuaternionMovingAverage(TrackerFilters.FIXED_DELAY, 0.5f)
		run(filter, 300)
		val reference = Quaternion.rotationAroundYAxis(1.2f)
		filter.resetQuats(reference, reference)
		filter.update(0.001f)

		assertEquals(1.2f, yawOf(filter.filteredQuaternion), 0.001f)
	}
}
