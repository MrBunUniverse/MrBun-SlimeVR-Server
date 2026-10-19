package dev.slimevr.filtering

import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Quaternion.Companion.IDENTITY
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sqrt

private const val BUFFER_SIZE = 96
private const val CLOCK_RESYNC_NANOS = 5_000_000L

// Smoothing looks this far either side of the playout time, as a share of the
// delay. The rest of the delay is headroom for packets that arrive late.
private const val KERNEL_HALF_WIDTH_RATIO = 0.4f
private const val KERNEL_POINTS = 16
private const val SPEED_SEGMENTS = 4

// Smooth fully below the first speed and least above the second (rad/s), so
// slow motion loses its shake while quick moves keep their snap.
private const val FULL_SMOOTHING_SPEED = 1f
private const val MIN_SMOOTHING_SPEED = 4f
private const val MIN_KERNEL_SCALE = 0.35f

// A packet landing this close behind the previous one, after a wait of
// between these many usual intervals, was held up by the radio rather than
// sampled late. A longer wait is a real gap, not a delayed packet.
private const val BURST_INTERVAL_RATIO = 0.3f
private const val BURST_WAIT_MIN_RATIO = 1.5f
private const val BURST_WAIT_MAX_RATIO = 4f

// Bounds for learning the tracker's usual spacing between packets.
private const val TYPICAL_INTERVAL_MIN_NANOS = 2_000_000L
private const val TYPICAL_INTERVAL_MAX_NANOS = 50_000_000L

/**
 * Plays timestamped rotations back a fixed time late.
 *
 * Without smoothing the output is the rotation the tracker had [delayNanos]
 * ago, drawn between the samples either side of that moment. With smoothing it
 * is a centred average around that moment: because samples from both before
 * and after are already known, shake and uneven delivery are removed without
 * lagging further behind or shrinking the real movement.
 */
class PlayoutBuffer(val delayNanos: Long, private val smoothing: Boolean) {
	private val times = LongArray(BUFFER_SIZE)
	private val quats = Array(BUFFER_SIZE) { IDENTITY }
	private var newest = -1
	private var count = 0
	private var clockNanos = 0L

	// Latest moment the output has already been drawn from; samples at or
	// before it must not be moved.
	private var playedUpToNanos = Long.MIN_VALUE

	// The usual spacing between packets while the tracker is moving. Gaps and
	// bursts are left out so one outage cannot distort it.
	private var typicalIntervalNanos = 0L

	private val kernelHalfWidthNanos = if (smoothing) (delayNanos * KERNEL_HALF_WIDTH_RATIO).toLong() else 0L

	// After a quiet stretch a move is drawn over this long. It ends where the
	// newest sample is and must start no earlier than the leading edge of the
	// smoothing window, or the window would already have looked past it.
	private val moveSpreadNanos = delayNanos - kernelHalfWidthNanos

	private val kernelWeights = FloatArray(KERNEL_POINTS) {
		val offset = kernelOffset(it)
		0.5f * (1f + cos(PI.toFloat() * offset))
	}

	/** Forgets all history and holds [rotation] until new samples arrive. */
	fun reset(rotation: Quaternion) {
		count = 0
		newest = -1
		playedUpToNanos = Long.MIN_VALUE
		typicalIntervalNanos = 0L
		// "Always in the past", so the first real sample eases in from it.
		store(Long.MIN_VALUE, rotation)
	}

	/** Adds a sample by packet-arrival time. */
	fun push(timestampNanos: Long, rotation: Quaternion) {
		if (count > 0 && timestampNanos <= times[newest]) {
			quats[newest] = rotation
		} else {
			if (smoothing) spreadBurst(timestampNanos)
			learnTypicalInterval(timestampNanos)
			store(timestampNanos, rotation)
		}
		// Packets arrive at "now"; only correct the clock when it has really
		// drifted so ordinary jitter cannot shake the playout time.
		if (abs(clockNanos - timestampNanos) > CLOCK_RESYNC_NANOS) clockNanos = timestampNanos
	}

	fun advance(deltaSeconds: Float) {
		clockNanos += (deltaSeconds * 1_000_000_000f).toLong()
	}

	/** The rotation to show now. */
	fun sample(fallback: Quaternion): Quaternion {
		if (count == 0) return fallback
		if (delayNanos <= 0L) return quats[newest]
		val playoutTime = clockNanos - delayNanos
		if (!smoothing) {
			playedUpToNanos = max(playedUpToNanos, playoutTime)
			return rotationAt(playoutTime)
		}

		val baseHalfWidth = kernelHalfWidthNanos
		val halfWidth = (baseHalfWidth * kernelScale(playoutTime, baseHalfWidth)).toLong()
		playedUpToNanos = max(playedUpToNanos, playoutTime + baseHalfWidth)

		var w = 0f
		var x = 0f
		var y = 0f
		var z = 0f
		var reference = IDENTITY
		for (point in 0 until KERNEL_POINTS) {
			val time = playoutTime + (halfWidth * kernelOffset(point)).toLong()
			var q = rotationAt(time)
			if (point == 0) {
				reference = q
			} else if (q.dot(reference) < 0f) {
				q = -q
			}
			val weight = kernelWeights[point]
			w += q.w * weight
			x += q.x * weight
			y += q.y * weight
			z += q.z * weight
		}
		val length = sqrt(w * w + x * x + y * y + z * z)
		if (length < 1e-6f) return rotationAt(playoutTime)
		return Quaternion(w / length, x / length, y / length, z / length)
	}

	/** Position of a kernel point within the window, from just above -1 to just below 1. */
	private fun kernelOffset(point: Int): Float = -1f + (2f * point + 1f) / KERNEL_POINTS

	/**
	 * How much of the full smoothing width to use, from the distance the
	 * tracker actually travels across the window. Using travelled distance
	 * rather than start-to-end keeps the peak of a swing from being flattened.
	 */
	private fun kernelScale(playoutTime: Long, halfWidth: Long): Float {
		if (halfWidth <= 0L) return 1f
		var travelled = 0f
		var previous = rotationAt(playoutTime - halfWidth)
		for (segment in 1..SPEED_SEGMENTS) {
			val time = playoutTime - halfWidth + 2L * halfWidth * segment / SPEED_SEGMENTS
			val current = rotationAt(time)
			travelled += previous.angleToR(current)
			previous = current
		}
		val speed = travelled / (2f * halfWidth / 1_000_000_000f)
		val fastness = ((speed - FULL_SMOOTHING_SPEED) / (MIN_SMOOTHING_SPEED - FULL_SMOOTHING_SPEED)).coerceIn(0f, 1f)
		return 1f - fastness * (1f - MIN_KERNEL_SCALE)
	}

	/**
	 * When a delayed packet is delivered together with the next one, both
	 * carry almost the same arrival time although they were sampled an
	 * interval apart. Move the delayed one back to where it belongs, unless it
	 * has already been shown.
	 */
	private fun spreadBurst(timestampNanos: Long) {
		val typical = typicalIntervalNanos
		if (count < 2 || typical <= 0L) return
		val previous = newest
		val beforePrevious = (newest - 1 + BUFFER_SIZE) % BUFFER_SIZE
		val previousTime = times[previous]
		val beforePreviousTime = times[beforePrevious]
		if (beforePreviousTime == Long.MIN_VALUE) return

		val wait = previousTime - beforePreviousTime
		val arrivedTogether = timestampNanos - previousTime < typical * BURST_INTERVAL_RATIO
		val afterAWait = wait > typical * BURST_WAIT_MIN_RATIO && wait < typical * BURST_WAIT_MAX_RATIO
		if (!arrivedTogether || !afterAWait) return

		val corrected = max(beforePreviousTime + 1L, timestampNanos - typical)
		if (corrected < previousTime && corrected > playedUpToNanos) times[previous] = corrected
	}

	private fun learnTypicalInterval(timestampNanos: Long) {
		if (count == 0 || times[newest] == Long.MIN_VALUE) return
		val interval = timestampNanos - times[newest]
		val typical = typicalIntervalNanos
		if (typical <= 0L) {
			if (interval in TYPICAL_INTERVAL_MIN_NANOS..TYPICAL_INTERVAL_MAX_NANOS) typicalIntervalNanos = interval
		} else if (interval > typical / 2 && interval < typical * 2) {
			typicalIntervalNanos = (typical * 9 + interval) / 10
		}
	}

	private fun store(timestampNanos: Long, rotation: Quaternion) {
		newest = (newest + 1) % BUFFER_SIZE
		times[newest] = timestampNanos
		quats[newest] = rotation
		if (count < BUFFER_SIZE) count++
	}

	/** The rotation the tracker had at [timeNanos], drawn between samples. */
	private fun rotationAt(timeNanos: Long): Quaternion {
		var next = newest
		if (count == 1 || times[next] <= timeNanos) return quats[next]
		for (step in 1 until count) {
			val index = (newest - step + BUFFER_SIZE) % BUFFER_SIZE
			val nextTime = times[next]
			// A motionless tracker sends nothing, so a long quiet stretch
			// means "held, then moved": never spread a move over more than
			// the part of the delay that has not been drawn yet.
			val startTime = max(times[index], nextTime - moveSpreadNanos)
			if (times[index] <= timeNanos) {
				if (timeNanos <= startTime) return quats[index]
				val fraction = (timeNanos - startTime).toFloat() / (nextTime - startTime).toFloat()
				return quats[index].interpQ(quats[next], fraction.coerceIn(0f, 1f))
			}
			next = index
		}
		return quats[next]
	}
}
