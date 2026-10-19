package dev.slimevr.tracking.trackers

import kotlin.math.abs

data class PoseStabilityResult(
	val stable: Boolean,
	val reason: AdaptiveDriftFreezeReason,
)

/**
 * Shared stable-pose gate for persistent drift learning.
 *
 * This deliberately uses raw acceleration and packet-time angular velocity;
 * filtered output must not be allowed to make a moving tracker look stable.
 */
class PoseStabilityEstimator(
	private val maxAngularVelocityRadPerSec: Float = 0.15f,
	private val maxPacketJitterMs: Float = 30f,
) {
	fun evaluate(
		target: Tracker,
		references: List<Tracker>,
		nowNanos: Long = System.nanoTime(),
	): PoseStabilityResult {
		if ((references + target).any { it.hasAcceleration && !it.hasFreshAcceleration(nowNanos) }) {
			return PoseStabilityResult(false, AdaptiveDriftFreezeReason.PACKET_QUALITY)
		}
		if (!isStable(target) || references.any { !isStable(it) }) {
			return PoseStabilityResult(false, AdaptiveDriftFreezeReason.MOVING)
		}
		if (references.any { it.filteringHandler.getPacketJitterMs() > maxPacketJitterMs }) {
			return PoseStabilityResult(false, AdaptiveDriftFreezeReason.PACKET_QUALITY)
		}
		return PoseStabilityResult(true, AdaptiveDriftFreezeReason.NONE)
	}

	private fun isStable(tracker: Tracker): Boolean = tracker.stayAligned.angularVelocity <= maxAngularVelocityRadPerSec && isGravityStable(tracker)

	private fun isGravityStable(tracker: Tracker): Boolean {
		if (!tracker.hasAcceleration) return true
		val magnitude = tracker.getRawAcceleration().len()
		if (magnitude == 0f) return false
		// Existing firmware paths have used both g-scaled and m/s²-scaled
		// acceleration. Accept either known stationary unit.
		return abs(magnitude - GRAVITY_MPS2) <= GRAVITY_MPS2_TOLERANCE ||
			abs(magnitude - GRAVITY_G) <= GRAVITY_G_TOLERANCE
	}

	private companion object {
		const val GRAVITY_MPS2 = 9.80665f
		const val GRAVITY_MPS2_TOLERANCE = 2.5f
		const val GRAVITY_G = 1f
		const val GRAVITY_G_TOLERANCE = 0.25f
	}
}
