package dev.slimevr.tracking.trackers

import dev.slimevr.config.config
import io.github.axisangles.ktmath.EulerOrder
import java.util.IdentityHashMap
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

enum class AdaptiveDriftMode {
	DISABLED,
	MONITORING,
	LEARNING,
	APPLIED,
	FROZEN,
	RECOVERING,
}

enum class AdaptiveDriftFreezeReason {
	NONE,
	NO_REFERENCE,
	MOVING,
	PACKET_QUALITY,
	REFERENCE_DISAGREEMENT,
	LOW_CONFIDENCE,
	RECOVERY,
	PAUSED,
}

data class AdaptiveDriftStatus(
	val mode: AdaptiveDriftMode,
	val confidence: Float,
	val stableDurationMs: Long,
	val learnedRateDegPerMin: Float,
	val appliedCorrectionDeg: Float,
	val acceptedObservations: Int,
	val freezeReason: AdaptiveDriftFreezeReason,
)

/**
 * Server-side, yaw-first stable-pose learner.
 *
 * This is intentionally separate from Stay Aligned. Stay Aligned may make
 * short-term motion corrections; this learner only observes pre-adaptive data
 * and persists a model after a long, high-confidence evidence window.
 */
object AdaptiveDriftCompensation {
	private const val UPDATE_INTERVAL_NANOS = 10_000_000L // 100 Hz maximum
	private const val STABLE_START_MS = 5_000L
	private const val EVIDENCE_WINDOW_MS = 30_000L
	private const val MAX_REFERENCE_DISAGREEMENT_RAD = 12f * (Math.PI.toFloat() / 180f)
	private const val MIN_CONFIDENCE = 0.75f

	private val torsoPositions = setOf(
		TrackerPosition.NECK,
		TrackerPosition.UPPER_CHEST,
		TrackerPosition.CHEST,
		TrackerPosition.WAIST,
		TrackerPosition.HIP,
	)

	private val states = IdentityHashMap<Tracker, State>()
	private val stabilityEstimator = PoseStabilityEstimator()
	private var lastUpdateNanos = 0L

	private data class State(
		var mode: AdaptiveDriftMode = AdaptiveDriftMode.MONITORING,
		var reason: AdaptiveDriftFreezeReason = AdaptiveDriftFreezeReason.NO_REFERENCE,
		var stableSinceNanos: Long = 0L,
		var learningSinceNanos: Long = 0L,
		var baselineCorrectionRad: Float = 0f,
		var lastResidualRad: Float = 0f,
		var confidence: Float = 0f,
		var acceptedObservations: Int = 0,
		var targetPosition: TrackerPosition? = null,
		var targetMounting: io.github.axisangles.ktmath.Quaternion = io.github.axisangles.ktmath.Quaternion.IDENTITY,
		var referenceSignature: List<ReferenceSignature> = emptyList(),
		val baselineYaw: IdentityHashMap<Tracker, Float> = IdentityHashMap(),
	)

	private data class ReferenceSignature(
		val id: Int,
		val position: TrackerPosition?,
		val mounting: io.github.axisangles.ktmath.Quaternion,
	)

	/** Builds one shared, bounded-rate snapshot for all physical IMU trackers. */
	@Synchronized
	fun update(trackers: List<Tracker>, nowNanos: Long = System.nanoTime(), deltaTimeSeconds: Float = 0.01f) {
		// Replay/test timelines can restart; a real monotonic clock should not go
		// backwards, but resetting the scheduler is safer than freezing learning.
		if (lastUpdateNanos != 0L && nowNanos < lastUpdateNanos) lastUpdateNanos = 0L
		if (lastUpdateNanos != 0L && nowNanos - lastUpdateNanos < UPDATE_INTERVAL_NANOS) return
		val elapsedSeconds = if (lastUpdateNanos == 0L) {
			deltaTimeSeconds
		} else {
			((nowNanos - lastUpdateNanos).toDouble() / 1_000_000_000.0).toFloat()
		}
		lastUpdateNanos = nowNanos
		val dt = elapsedSeconds.coerceIn(0.001f, 0.1f)

		for (target in trackers) {
			if (!isTargetEligible(target)) {
				states[target]?.let {
					it.mode = AdaptiveDriftMode.DISABLED
					it.reason = if (target.isImu() && target.config.adaptiveDriftLearningPaused) {
						AdaptiveDriftFreezeReason.PAUSED
					} else {
						AdaptiveDriftFreezeReason.NONE
					}
					resetObservationWindow(it)
				}
				continue
			}

			val state = states.getOrPut(target) { State() }
			if (state.targetPosition != null &&
				(state.targetPosition != target.trackerPosition || state.targetMounting != target.resetsHandler.mountingOrientation)
			) {
				resetObservationWindow(state)
			}
			state.targetPosition = target.trackerPosition
			state.targetMounting = target.resetsHandler.mountingOrientation
			if (target.recovery.activeForSkeleton) {
				state.mode = AdaptiveDriftMode.RECOVERING
				state.reason = AdaptiveDriftFreezeReason.RECOVERY
				resetObservationWindow(state)
				continue
			}

			val references = selectReferences(target, trackers)
			if (!hasReferenceGeometry(references)) {
				freeze(state, AdaptiveDriftFreezeReason.NO_REFERENCE)
				continue
			}
			if (references.any { it.recovery.activeForSkeleton }) {
				freeze(state, AdaptiveDriftFreezeReason.RECOVERY)
				continue
			}
			val stability = stabilityEstimator.evaluate(target, references, nowNanos)
			if (!stability.stable) {
				freeze(state, stability.reason)
				continue
			}

			val referenceSignature = references.map {
				ReferenceSignature(it.id, it.trackerPosition, it.resetsHandler.mountingOrientation)
			}.sortedWith(compareBy({ it.id }, { it.position?.id ?: 0 }))
			if (state.baselineYaw.isEmpty() || state.referenceSignature != referenceSignature) {
				beginObservationWindow(state, target, references, nowNanos)
			}

			val targetDelta = yawDeltaFromBaseline(target, state)
			val weightedReferences = references.mapNotNull { reference ->
				val baseline = state.baselineYaw[reference] ?: return@mapNotNull null
				YawObservation(yawDelta(reference, baseline), referenceWeight(reference))
			}
			if (weightedReferences.isEmpty()) {
				freeze(state, AdaptiveDriftFreezeReason.NO_REFERENCE)
				continue
			}

			val referenceYaw = circularMean(weightedReferences)
			val disagreement = weightedReferences.maxOf { abs(wrapRadians(it.yaw - referenceYaw)) }
			if (disagreement > MAX_REFERENCE_DISAGREEMENT_RAD) {
				freeze(state, AdaptiveDriftFreezeReason.REFERENCE_DISAGREEMENT)
				continue
			}

			val residual = wrapRadians(targetDelta - referenceYaw)
			state.lastResidualRad = residual
			state.confidence = calculateConfidence(references.size, disagreement)
			val stableDurationMs = (nowNanos - state.stableSinceNanos).coerceAtLeast(0L) / 1_000_000L
			if (stableDurationMs < STABLE_START_MS) {
				state.mode = AdaptiveDriftMode.MONITORING
				state.reason = AdaptiveDriftFreezeReason.NONE
				continue
			}

			if (state.learningSinceNanos == 0L) state.learningSinceNanos = nowNanos
			if (state.confidence < MIN_CONFIDENCE) {
				freeze(state, AdaptiveDriftFreezeReason.LOW_CONFIDENCE)
				continue
			}

			// Keep the correction relative to the pose-window baseline. When a
			// window is accepted, the baseline is moved forward but the learned
			// correction remains in place.
			val desiredCorrection = state.baselineCorrectionRad - residual
			target.resetsHandler.setAdaptiveYawCorrectionTarget(desiredCorrection, dt)
			state.mode = if (state.learningSinceNanos + EVIDENCE_WINDOW_MS * 1_000_000L <= nowNanos) {
				AdaptiveDriftMode.APPLIED
			} else {
				AdaptiveDriftMode.LEARNING
			}
			state.reason = AdaptiveDriftFreezeReason.NONE

			val evidenceMs = (nowNanos - state.learningSinceNanos) / 1_000_000L
			if (evidenceMs >= EVIDENCE_WINDOW_MS) {
				target.resetsHandler.learnStablePoseObservation(residual, evidenceMs, state.confidence)
				state.acceptedObservations = target.config.totalDriftObservations
				beginObservationWindow(state, target, references, nowNanos)
				state.mode = AdaptiveDriftMode.APPLIED
			}
			target.resetsHandler.flushAdaptiveConfigPersistence()
		}
	}

	@Synchronized
	fun statusFor(tracker: Tracker, nowNanos: Long = System.nanoTime()): AdaptiveDriftStatus {
		val state = states[tracker]
		val stableDuration = if (state == null || state.stableSinceNanos == 0L) {
			0L
		} else {
			(nowNanos - state.stableSinceNanos).coerceAtLeast(0L) / 1_000_000L
		}
		val defaultMode = when {
			!tracker.isImu() -> AdaptiveDriftMode.DISABLED
			tracker.config.adaptiveDriftLearningPaused -> AdaptiveDriftMode.DISABLED
			else -> AdaptiveDriftMode.MONITORING
		}
		return AdaptiveDriftStatus(
			mode = state?.mode ?: defaultMode,
			confidence = state?.confidence ?: tracker.config.adaptiveDriftConfidence,
			stableDurationMs = stableDuration,
			learnedRateDegPerMin = tracker.config.learnedDriftRateDegPerMin,
			appliedCorrectionDeg = tracker.resetsHandler.adaptiveYawCorrectionDegrees,
			acceptedObservations = max(state?.acceptedObservations ?: 0, tracker.config.totalDriftObservations),
			freezeReason = state?.reason ?: if (tracker.config.adaptiveDriftLearningPaused) {
				AdaptiveDriftFreezeReason.PAUSED
			} else {
				AdaptiveDriftFreezeReason.NONE
			},
		)
	}

	@Synchronized
	fun clear(tracker: Tracker) {
		states.remove(tracker)
	}

	private fun isTargetEligible(tracker: Tracker): Boolean = tracker.isImu() &&
		tracker.hasRotation &&
		tracker.trackerPosition != null &&
		tracker.status.sendData &&
		!tracker.isInternal &&
		!tracker.isComputed &&
		tracker.resetsHandler.allowDriftCompensation &&
		tracker.config.autoLearnDrift &&
		!tracker.config.adaptiveDriftLearningPaused

	private fun selectReferences(target: Tracker, trackers: List<Tracker>): List<Tracker> = trackers
		.asSequence()
		.filter { it !== target }
		.filter { it.hasRotation && it.trackerPosition != null && it.status.sendData }
		.filter { !it.isInternal && !it.isComputed && !it.recovery.activeForSkeleton }
		.filter { referenceWeight(it) > 0f }
		.sortedByDescending { referenceWeight(it) }
		.take(6)
		.toList()

	private fun hasReferenceGeometry(references: List<Tracker>): Boolean {
		if (references.size < 2) return false
		val hasStillOpticalHead = references.any { it.isHmd || it.trackerPosition == TrackerPosition.HEAD }
		val torsoCount = references.count { it.trackerPosition in torsoPositions }
		// Two torso IMUs can preserve relative torso pose but cannot establish
		// absolute yaw. Require a world-facing HMD/optical anchor, or at least
		// three body references before using the fallback consensus.
		return hasStillOpticalHead || (references.size >= 3 && torsoCount >= 2)
	}

	private fun beginObservationWindow(state: State, target: Tracker, references: List<Tracker>, nowNanos: Long) {
		state.baselineYaw.clear()
		state.baselineYaw[target] = currentYaw(target)
		for (reference in references) state.baselineYaw[reference] = currentYaw(reference)
		state.referenceSignature = references.map {
			ReferenceSignature(it.id, it.trackerPosition, it.resetsHandler.mountingOrientation)
		}.sortedWith(compareBy({ it.id }, { it.position?.id ?: 0 }))
		state.stableSinceNanos = nowNanos
		state.learningSinceNanos = 0L
		state.baselineCorrectionRad = target.resetsHandler.adaptiveYawCorrectionRadians
		state.lastResidualRad = 0f
		state.mode = AdaptiveDriftMode.MONITORING
		state.reason = AdaptiveDriftFreezeReason.NONE
	}

	private fun resetObservationWindow(state: State) {
		state.baselineYaw.clear()
		state.referenceSignature = emptyList()
		state.stableSinceNanos = 0L
		state.learningSinceNanos = 0L
		state.lastResidualRad = 0f
	}

	private fun freeze(state: State, reason: AdaptiveDriftFreezeReason) {
		state.mode = AdaptiveDriftMode.FROZEN
		state.reason = reason
		resetObservationWindow(state)
	}

	private fun currentYaw(tracker: Tracker): Float = tracker.resetsHandler
		.getReferenceAdjustedRotationBeforeDrift(tracker.getRawRotation())
		.toEulerAngles(EulerOrder.YZX).y

	private fun yawDeltaFromBaseline(tracker: Tracker, state: State): Float = yawDelta(tracker, state.baselineYaw[tracker] ?: currentYaw(tracker))

	private fun yawDelta(tracker: Tracker, baseline: Float): Float = wrapRadians(currentYaw(tracker) - baseline)

	private fun referenceWeight(tracker: Tracker): Float = when {
		tracker.isHmd || tracker.trackerPosition == TrackerPosition.HEAD -> 4f

		tracker.trackerPosition in torsoPositions -> 3f

		tracker.trackerPosition?.isThigh() == true -> 1.75f

		tracker.trackerPosition == TrackerPosition.LEFT_LOWER_LEG ||
			tracker.trackerPosition == TrackerPosition.RIGHT_LOWER_LEG ||
			tracker.trackerPosition?.isFoot() == true -> 1f

		else -> 0f
	}

	private data class YawObservation(val yaw: Float, val weight: Float)

	private fun circularMean(values: List<YawObservation>): Float {
		var sinSum = 0f
		var cosSum = 0f
		for (value in values) {
			sinSum += sin(value.yaw) * value.weight
			cosSum += cos(value.yaw) * value.weight
		}
		return atan2(sinSum, cosSum)
	}

	private fun calculateConfidence(referenceCount: Int, disagreement: Float): Float {
		val geometry = (referenceCount / 3f).coerceIn(0f, 1f)
		val agreement = (1f - disagreement / MAX_REFERENCE_DISAGREEMENT_RAD).coerceIn(0f, 1f)
		return (0.55f + 0.25f * geometry + 0.20f * agreement).coerceIn(0f, 1f)
	}

	private fun wrapRadians(value: Float): Float {
		var wrapped = value
		while (wrapped > Math.PI.toFloat()) wrapped -= (Math.PI * 2.0).toFloat()
		while (wrapped < -Math.PI.toFloat()) wrapped += (Math.PI * 2.0).toFloat()
		return wrapped
	}
}
