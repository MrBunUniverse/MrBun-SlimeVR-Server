package dev.slimevr.unit

import dev.slimevr.filtering.QuaternionMovingAverage
import dev.slimevr.filtering.TrackerFilters
import io.github.axisangles.ktmath.Quaternion
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

class SmoothPlaybackFilterTests {
	private val start = 1_000_000_000L
	private val balanced = 0.5f // 150 ms

	private fun smooth(amount: Float = balanced) = QuaternionMovingAverage(TrackerFilters.SMOOTH_PLAYBACK, amount)

	private fun yawOf(q: Quaternion): Float {
		// Signed yaw of a rotation about the Y axis.
		val angle = 2f * kotlin.math.atan2(q.y, q.w)
		return if (angle > PI) {
			angle - 2f * PI.toFloat()
		} else if (angle < -PI) {
			angle + 2f * PI.toFloat()
		} else {
			angle
		}
	}

	/**
	 * Feeds [motion] (yaw in radians at a millisecond) through [filter] at a
	 * 1 ms server tick. Packets are sampled every [packetMs] and arrive at the
	 * millisecond given by [arrival], or not at all when it returns null.
	 * Returns the output yaw per millisecond.
	 */
	private fun run(
		filter: QuaternionMovingAverage,
		durationMs: Int,
		packetMs: Int = 10,
		arrival: (sampleMs: Int) -> Int? = { it },
		motion: (ms: Int) -> Float,
	): FloatArray {
		val arrivals = HashMap<Int, Int>()
		for (sampleMs in 0..durationMs step packetMs) arrival(sampleMs)?.let { arrivals[it] = sampleMs }
		val output = FloatArray(durationMs + 1)
		for (now in 0..durationMs) {
			arrivals[now]?.let {
				filter.addQuaternion(Quaternion.rotationAroundYAxis(motion(it)), start + now * 1_000_000L)
			}
			filter.update(0.001f)
			output[now] = yawOf(filter.filteredQuaternion)
		}
		return output
	}

	private fun largestStep(output: FloatArray, from: Int): Float {
		var largest = 0f
		for (i in from + 1 until output.size) largest = max(largest, abs(output[i] - output[i - 1]))
		return largest
	}

	/** Root-mean-square of the second difference: how unevenly the output moves. */
	private fun roughness(output: FloatArray, from: Int): Float {
		var sum = 0.0
		var n = 0
		for (i in from + 2 until output.size) {
			val accel = output[i] - 2f * output[i - 1] + output[i - 2]
			sum += accel * accel
			n++
		}
		return sqrt(sum / n).toFloat()
	}

	private fun swing(frequencyHz: Float, amplitudeRad: Float): (Int) -> Float = { ms -> amplitudeRad * sin(2f * PI.toFloat() * frequencyHz * ms / 1000f) }

	private fun peak(output: FloatArray, from: Int): Float {
		var largest = 0f
		for (i in from until output.size) largest = max(largest, abs(output[i]))
		return largest
	}

	@Test
	fun `presets map the amount to a delay in milliseconds`() {
		assertEquals(90f, smooth(0.3f).effectiveLatencyMs, 0.01f)
		assertEquals(150f, smooth(0.5f).effectiveLatencyMs, 0.01f)
		assertEquals(210f, smooth(0.7f).effectiveLatencyMs, 0.01f)
	}

	@Test
	fun `steady motion is reproduced a fixed time late`() {
		val turnRate = 0.8f // rad/s, slow enough for full smoothing
		val output = run(smooth(), 1200) { turnRate * it / 1000f }

		for (now in 500..1200) {
			assertEquals(turnRate * (now - 150) / 1000f, output[now], 0.004f, "at $now ms")
		}
	}

	@Test
	fun `natural swings keep their size`() {
		val amplitude = 30f * PI.toFloat() / 180f
		val slow = peak(run(smooth(), 3000, motion = swing(2f, amplitude)), 1000)
		val quick = peak(run(smooth(), 3000, motion = swing(5f, amplitude)), 1000)

		assertTrue(slow >= amplitude * 0.97f, "2 Hz swing kept ${slow / amplitude}")
		assertTrue(slow <= amplitude * 1.001f, "2 Hz swing overshot ${slow / amplitude}")
		assertTrue(quick >= amplitude * 0.85f, "5 Hz swing kept ${quick / amplitude}")
		assertTrue(quick <= amplitude * 1.001f, "5 Hz swing overshot ${quick / amplitude}")
	}

	@Test
	fun `a sudden stop never overshoots`() {
		val target = 1f
		val output = run(smooth(), 1500) { ms -> if (ms < 500) target * ms / 500f else target }

		assertTrue(peak(output, 0) <= target + 0.0005f, "peaked at ${peak(output, 0)}")
		assertEquals(target, output[1500], 0.001f)
	}

	@Test
	fun `sensor shake is removed far better than a plain delay`() {
		val noise = Random(7)
		val shake = FloatArray(3001) { (noise.nextFloat() - 0.5f) * 2f * (0.5f * PI.toFloat() / 180f) }
		val motion: (Int) -> Float = { ms -> 0.3f * ms / 1000f + shake[ms] }

		val smoothed = roughness(run(smooth(), 3000, motion = motion), 1000)
		// Fixed Delay tops out at 100 ms; the comparison is about shake, not lag.
		val plain = roughness(run(QuaternionMovingAverage(TrackerFilters.FIXED_DELAY, 1f), 3000, motion = motion), 1000)

		assertTrue(smoothed * 4f < plain, "smooth=$smoothed plain=$plain")
	}

	@Test
	fun `runs of lost packets are invisible`() {
		val turnRate = 0.8f
		for (lost in 1..3) {
			val output = run(smooth(), 1500, arrival = { if (it in 700 until 700 + lost * 10) null else it }) {
				turnRate * it / 1000f
			}
			for (now in 500..1500) {
				assertEquals(turnRate * (now - 150) / 1000f, output[now], 0.004f, "$lost lost, at $now ms")
			}
			assertTrue(largestStep(output, 500) < turnRate * 0.001f * 1.5f, "$lost lost: step ${largestStep(output, 500)}")
		}
	}

	@Test
	fun `packets delivered late and bunched keep even motion`() {
		val turnRate = 0.8f
		// Every fifth packet is held up and arrives with the one after it.
		val output = run(smooth(), 2000, arrival = { if (it % 50 == 20) it + 9 else it }) { turnRate * it / 1000f }

		for (now in 600..2000) {
			assertEquals(turnRate * (now - 150) / 1000f, output[now], 0.006f, "at $now ms")
			assertTrue(output[now] >= output[now - 1] - 0.00001f, "moved backwards at $now ms")
		}
	}

	@Test
	fun `fast moves are smoothed less than slow ones`() {
		val noise = Random(11)
		val shake = FloatArray(3001) { (noise.nextFloat() - 0.5f) * 2f * (0.3f * PI.toFloat() / 180f) }
		// The same shake riding on a slow drift and on a fast sweep. What is
		// left of it shows how hard each one was smoothed.
		val slow = leftoverShake(0.2f, 3000, 1000, shake)
		val fast = leftoverShake(5f, 600, 300, shake)

		assertTrue(fast > slow * 1.4f, "fast=$fast slow=$slow")
		// A fast move is still exactly on time.
		val clean = run(smooth(), 600) { ms -> 5f * ms / 1000f }
		assertEquals(5f * (600 - 150) / 1000f, clean[600], 0.01f)
	}

	/** RMS distance between the output and the shake-free motion, 150 ms late. */
	private fun leftoverShake(turnRate: Float, durationMs: Int, from: Int, shake: FloatArray): Float {
		val output = run(smooth(), durationMs) { ms -> turnRate * ms / 1000f + shake[ms] }
		var sum = 0.0
		for (now in from..durationMs) {
			val error = output[now] - turnRate * (now - 150) / 1000f
			sum += error * error
		}
		return sqrt(sum / (durationMs - from + 1)).toFloat()
	}

	@Test
	fun `a gap longer than the delay holds and then resumes without a jump`() {
		val turnRate = 0.8f
		val output = run(smooth(), 2000, arrival = { if (it in 600..1000) null else it }) { turnRate * it / 1000f }

		// Held, never extrapolated past real data.
		assertEquals(output[900], output[1000], 0.0001f)
		assertTrue(output[1000] <= turnRate * 0.6f + 0.001f)
		// Catches up within the window instead of snapping.
		val missed = turnRate * 0.41f
		assertTrue(largestStep(output, 500) < missed / 150f * 2.5f, "step ${largestStep(output, 500)}")
		assertEquals(turnRate * 1.85f, output[2000], 0.004f)
	}

	@Test
	fun `moving after a long stillness eases in instead of jumping`() {
		val filter = smooth()
		filter.addQuaternion(Quaternion.IDENTITY, start)
		for (i in 0 until 5000) filter.update(0.001f)
		filter.addQuaternion(Quaternion.rotationAroundYAxis(0.5f), start + 5_000_000_000L)

		var previous = yawOf(filter.filteredQuaternion)
		var largest = 0f
		for (i in 0 until 400) {
			filter.update(0.001f)
			val yaw = yawOf(filter.filteredQuaternion)
			largest = max(largest, abs(yaw - previous))
			previous = yaw
		}

		assertEquals(0.5f, previous, 0.001f)
		assertTrue(largest < 0.5f / 150f * 2.5f, "jumped $largest rad in one tick")
	}

	@Test
	fun `reset installs the new pose immediately`() {
		val filter = smooth()
		run(filter, 600) { 0.5f * it / 1000f }
		val reference = Quaternion.rotationAroundYAxis(1.2f)
		filter.resetQuats(reference, reference)
		filter.update(0.001f)

		assertEquals(1.2f, yawOf(filter.filteredQuaternion), 0.001f)
	}
}
