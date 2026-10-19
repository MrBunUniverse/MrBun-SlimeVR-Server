package dev.slimevr.tracking.processor.stayaligned

import dev.slimevr.tracking.processor.stayaligned.adjust.TrackerYaw
import dev.slimevr.tracking.processor.stayaligned.trackers.TrackerSkeleton
import io.github.axisangles.ktmath.Vector3
import kotlin.math.abs

enum class KineticPosture {
	STANDING_OR_DANCING,
	SITTING,
	LAYING_DOWN,
}

object AdaptiveKineticPostureDetector {

	/**
	 * Detects whether the user is standing/dancing, sitting (chair, sofa, cross-legged),
	 * or laying down based on spine and thigh orientation relative to gravity (POS_Y).
	 */
	fun detectPosture(trackers: TrackerSkeleton): KineticPosture {
		val upperBody = trackers.upperBody
		val leftUpperLeg = trackers.leftUpperLeg
		val rightUpperLeg = trackers.rightUpperLeg

		// 1. Laying down detection: spine is near horizontal
		val spineTracker = upperBody.firstOrNull { TrackerYaw.hasTrackerYaw(it) } ?: upperBody.firstOrNull()
		if (spineTracker != null) {
			val rot = spineTracker.getAdjustedRotationForceStayAligned()
			val spineY = rot.sandwichUnitY()
			val spineVerticalDot = abs(spineY.dot(Vector3.POS_Y))
			// If spine is tilted > 63 deg from vertical (dot < 0.45), user is laying down
			if (spineVerticalDot < 0.45f) {
				return KineticPosture.LAYING_DOWN
			}
		}

		// 2. Sitting detection: spine is upright, but thigh(s) are pitched horizontally
		var horizontalLegCount = 0
		listOfNotNull(leftUpperLeg, rightUpperLeg).forEach { leg ->
			val rot = leg.getAdjustedRotationForceStayAligned()
			val legY = rot.sandwichUnitY()
			val legVerticalDot = abs(legY.dot(Vector3.POS_Y))
			// When standing, leg is vertical (dot > 0.8). When sitting, thigh is pitched forward (dot < 0.55)
			if (legVerticalDot < 0.55f) {
				horizontalLegCount++
			}
		}

		if (horizontalLegCount >= 1) {
			return KineticPosture.SITTING
		}

		return KineticPosture.STANDING_OR_DANCING
	}
}
