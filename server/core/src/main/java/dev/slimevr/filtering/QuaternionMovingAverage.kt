package dev.slimevr.filtering

import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Quaternion.Companion.IDENTITY
import kotlin.math.abs
import kotlin.math.max

// These values describe a time constant, not a number of server frames.
private const val SMOOTH_MULTIPLIER = 42f
private const val SMOOTH_MIN = 11f
private const val PREDICT_GAIN_MIN = 10f
private const val PREDICT_GAIN_MAX = 24f
private const val PREDICTION_HORIZON_MIN_MS = 8f
private const val PREDICTION_HORIZON_MAX_MS = 12f
private const val DEFAULT_PACKET_INTERVAL_SECONDS = 0.016f
private const val MAX_SAMPLE_INTERVAL_SECONDS = 0.5f
private const val MIN_VELOCITY_INTERVAL_SECONDS = 0.004f

// Playback filters: amount 0..1 maps to a delay. Fixed Delay spans 0..100 ms
// (0.1/0.3/0.5 are its 10/30/50 ms presets); Smooth Playback spans 0..300 ms
// (0.3/0.5/0.7 are its 90/150/210 ms presets).
private const val FIXED_DELAY_MAX_NANOS = 100_000_000L
private const val SMOOTH_PLAYBACK_MAX_NANOS = 300_000_000L

/**
 * Low-allocation quaternion filter driven by packet timestamps.
 *
 * Angular velocity is derived from the packet interval, and prediction is a
 * bounded time extrapolation instead of a fixed number of historical samples.
 */
class QuaternionMovingAverage(
	val type: TrackerFilters,
	var amount: Float = 0f,
	initialRotation: Quaternion = IDENTITY,
) {
	var filteredQuaternion = IDENTITY
	var filteringImpact = 0f

	/** Packet cadence and health are exposed for diagnostics and adaptive code. */
	val packetIntervalMs: Float
		get() = packetIntervalSeconds * 1000f
	val packetJitterMs: Float
		get() = packetJitterSeconds * 1000f
	val inputRateHz: Float
		get() = 1f / packetIntervalSeconds.coerceAtLeast(0.001f)
	val angularVelocityRadPerSec: Float
		get() = currentAngularVelocity
	val predictionHorizonMs: Float
		get() = effectivePredictionHorizonSeconds * networkHealth() * 1000f
	val inferredPacketLoss: Float
		get() = if (sampleCount == 0L) 0f else (inferredGapCount.toFloat() / (sampleCount + inferredGapCount)).coerceIn(0f, 1f)
	val effectiveLatencyMs: Float
		get() = when (type) {
			TrackerFilters.SMOOTHING, TrackerFilters.ADAPTIVE_HYBRID -> (1000f / smoothFactor.coerceAtLeast(1f))
			TrackerFilters.FIXED_DELAY, TrackerFilters.SMOOTH_PLAYBACK -> (playout?.delayNanos ?: 0L) / 1_000_000f
			else -> 0f
		}

	private var smoothFactor = 0f
	private var latestQuaternion = IDENTITY
	private var smoothingQuaternion = IDENTITY
	private var latestDelta = IDENTITY
	private var hasSample = false
	private var lastSampleTimeNanos = 0L
	private var packetIntervalSeconds = DEFAULT_PACKET_INTERVAL_SECONDS
	private var packetJitterSeconds = 0f
	private var lastIntervalSeconds = DEFAULT_PACKET_INTERVAL_SECONDS
	private var currentAngularVelocity = 0f
	private var timeSinceUpdate = 0f
	private var effectivePredictionHorizonSeconds = 0f
	private var sampleCount = 0L
	private var inferredGapCount = 0L
	private var sampleAgeSeconds = 0f

	// Only the playback filters keep a history of timestamped samples.
	private var playout: PlayoutBuffer? = null

	init {
		// amount should range from 0 to 1. Values above 1 are retained for
		// compatibility with older configuration files, but have diminishing effect.
		amount = amount.coerceAtLeast(0f)
		if (type == TrackerFilters.SMOOTHING || type == TrackerFilters.ADAPTIVE_HYBRID) {
			// lower smoothFactor = more smoothing
			smoothFactor = SMOOTH_MULTIPLIER * (1 - amount.coerceAtMost(1f)) + SMOOTH_MIN
			if (amount > 1) smoothFactor /= amount
		}
		val share = amount.coerceIn(0f, 1f)
		if (type == TrackerFilters.FIXED_DELAY) {
			playout = PlayoutBuffer((share * FIXED_DELAY_MAX_NANOS).toLong(), smoothing = false)
		} else if (type == TrackerFilters.SMOOTH_PLAYBACK) {
			playout = PlayoutBuffer((share * SMOOTH_PLAYBACK_MAX_NANOS).toLong(), smoothing = true)
		}
		resetQuats(initialRotation, initialRotation)
	}

	/** Advances the filter by elapsed monotonic server time. */
	@Synchronized
	fun update(deltaTime: Float = 0.001f, sampleAgeMs: Long = 0L) {
		val dt = deltaTime.coerceIn(0.0001f, 0.1f)
		timeSinceUpdate = (timeSinceUpdate + dt).coerceAtMost(0.1f)
		if (sampleAgeMs > 0L) sampleAgeSeconds = sampleAgeMs / 1000f
		if (sampleAgeSeconds > max(packetIntervalSeconds * 2f, 0.03f)) {
			currentAngularVelocity *= (1f - (dt * 8f).coerceIn(0f, 1f))
		}
		if (sampleAgeSeconds > 0.25f) latestDelta = IDENTITY

		when (type) {
			TrackerFilters.PREDICTION -> {
				val target = predictedQuaternion(networkHealth())
				val blend = (
					(
						PREDICT_GAIN_MIN +
							amount.coerceIn(0f, 1f) *
							(PREDICT_GAIN_MAX - PREDICT_GAIN_MIN)
						) *
						dt
					).coerceAtMost(1f)
				filteredQuaternion = filteredQuaternion.interpQ(target, blend)
			}

			TrackerFilters.SMOOTHING -> {
				val blend = (smoothFactor * timeSinceUpdate).coerceAtMost(1f)
				filteredQuaternion = smoothingQuaternion.interpQ(latestQuaternion, blend)
			}

			TrackerFilters.ADAPTIVE_HYBRID -> {
				val health = networkHealth()
				val motionRatio = ((currentAngularVelocity - 0.15f) / 0.55f).coerceIn(0f, 1f)
				// A burst or a long gap removes extrapolation instead of using stale data.
				val predictionWeight = motionRatio * health * amount.coerceIn(0f, 1f)
				val dynamicTarget = if (predictionWeight <= 0.0001f) {
					latestQuaternion
				} else {
					latestQuaternion.interpQ(predictedQuaternion(health), predictionWeight)
				}
				val dynamicSmoothFactor = smoothFactor * (1f + predictionWeight * 1.8f)
				val blend = (dynamicSmoothFactor * timeSinceUpdate).coerceAtMost(1f)
				filteredQuaternion = smoothingQuaternion.interpQ(dynamicTarget, blend)
			}

			TrackerFilters.FIXED_DELAY, TrackerFilters.SMOOTH_PLAYBACK -> {
				playout?.let {
					it.advance(dt)
					filteredQuaternion = it.sample(latestQuaternion)
				}
			}

			TrackerFilters.NONE -> {
				// The latest value is installed in addQuaternion.
			}
		}

		filteringImpact = latestQuaternion.angleToR(filteredQuaternion)
	}

	/** Adds a sample using a monotonic packet-arrival timestamp. */
	@Synchronized
	fun addQuaternion(q: Quaternion, timestampNanos: Long) {
		val oldQ = latestQuaternion
		val newQ = q.twinNearest(oldQ)

		if (lastSampleTimeNanos > 0L && timestampNanos > lastSampleTimeNanos) {
			val interval = ((timestampNanos - lastSampleTimeNanos).toDouble() / 1_000_000_000.0)
				.toFloat().coerceIn(0.001f, MAX_SAMPLE_INTERVAL_SECONDS)
			lastIntervalSeconds = interval
			if (interval > max(packetIntervalSeconds * 2.5f, 0.05f)) inferredGapCount++
			val intervalError = abs(interval - packetIntervalSeconds)
			packetIntervalSeconds = packetIntervalSeconds * 0.8f + interval * 0.2f
			packetJitterSeconds = packetJitterSeconds * 0.8f + intervalError * 0.2f

			val angleDelta = oldQ.angleToR(newQ)
			// A Wi-Fi burst can deliver two packets almost back-to-back even
			// though the IMU sampled at its normal cadence. Do not turn that
			// delivery artifact into a huge angular velocity spike.
			val instantVelocity = angleDelta / max(interval, MIN_VELOCITY_INTERVAL_SECONDS)
			currentAngularVelocity = currentAngularVelocity * 0.6f + instantVelocity * 0.4f
			latestDelta = oldQ.inv() * newQ
		} else {
			latestDelta = IDENTITY
		}

		latestQuaternion = newQ
		lastSampleTimeNanos = timestampNanos
		hasSample = true
		sampleAgeSeconds = 0f
		sampleCount++
		effectivePredictionHorizonSeconds = if (type == TrackerFilters.PREDICTION || type == TrackerFilters.ADAPTIVE_HYBRID) {
			(
				PREDICTION_HORIZON_MIN_MS +
					(amount.coerceIn(0f, 1f) * (PREDICTION_HORIZON_MAX_MS - PREDICTION_HORIZON_MIN_MS))
				) /
				1000f
		} else {
			0f
		}

		if (type == TrackerFilters.SMOOTHING || type == TrackerFilters.ADAPTIVE_HYBRID) {
			timeSinceUpdate = 0f
			smoothingQuaternion = filteredQuaternion
		} else if (type == TrackerFilters.FIXED_DELAY || type == TrackerFilters.SMOOTH_PLAYBACK) {
			playout?.push(timestampNanos, newQ)
		} else if (type == TrackerFilters.NONE) {
			// Keep polarity continuity even when filtering is disabled.
			filteredQuaternion = newQ
		}
	}

	/** Compatibility overload for synthetic/internal trackers. */
	@Synchronized
	fun addQuaternion(q: Quaternion) = addQuaternion(q, System.nanoTime())

	private fun predictedQuaternion(health: Float): Quaternion {
		if (!hasSample || effectivePredictionHorizonSeconds <= 0f) return latestQuaternion
		val horizon = effectivePredictionHorizonSeconds * health
		val ratio = (horizon / packetIntervalSeconds.coerceIn(0.001f, MAX_SAMPLE_INTERVAL_SECONDS))
			.coerceIn(0f, 1.5f)
		return latestQuaternion * latestDelta.pow(ratio)
	}

	private fun networkHealth(): Float {
		// A normal ESP32 packet stream is roughly 10–20 ms. Jitter and long
		// gaps reduce prediction before they can become visible overshoot.
		val jitterPenalty = (packetJitterSeconds / 0.020f).coerceIn(0f, 1f)
		val gapPenalty = ((packetIntervalSeconds - 0.035f) / 0.065f).coerceIn(0f, 1f)
		val burstPenalty = if (lastIntervalSeconds < packetIntervalSeconds * 0.25f) 0.8f else 0f
		return (1f - max(max(jitterPenalty, gapPenalty), burstPenalty)).coerceIn(0f, 1f)
	}

	/** Aligns the quaternion space and sets the latest filtered value immediately. */
	@Synchronized
	fun resetQuats(q: Quaternion, reference: Quaternion) {
		val rot = q.twinNearest(reference)
		latestQuaternion = rot
		filteredQuaternion = rot
		smoothingQuaternion = rot
		latestDelta = IDENTITY
		hasSample = false
		lastSampleTimeNanos = 0L
		packetIntervalSeconds = DEFAULT_PACKET_INTERVAL_SECONDS
		packetJitterSeconds = 0f
		lastIntervalSeconds = DEFAULT_PACKET_INTERVAL_SECONDS
		currentAngularVelocity = 0f
		timeSinceUpdate = 0f
		filteringImpact = 0f
		sampleCount = 0L
		inferredGapCount = 0L
		sampleAgeSeconds = 0f
		addQuaternion(rot, System.nanoTime())
		playout?.reset(rot)
	}
}
