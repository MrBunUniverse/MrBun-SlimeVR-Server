package dev.slimevr.tracking.processor.stayaligned.adjust

import dev.slimevr.config.StayAlignedConfig
import dev.slimevr.math.Angle
import dev.slimevr.math.AngleAverage
import dev.slimevr.tracking.processor.stayaligned.AdaptiveKineticPostureDetector
import dev.slimevr.tracking.processor.stayaligned.KineticPosture
import dev.slimevr.tracking.processor.stayaligned.StayAlignedDefaults.CENTER_ERROR_HEAD_WEIGHT
import dev.slimevr.tracking.processor.stayaligned.StayAlignedDefaults.CENTER_ERROR_LOWER_LEG_WEIGHT
import dev.slimevr.tracking.processor.stayaligned.StayAlignedDefaults.CENTER_ERROR_UPPER_BODY_WEIGHT
import dev.slimevr.tracking.processor.stayaligned.StayAlignedDefaults.CENTER_ERROR_UPPER_LEG_WEIGHT
import dev.slimevr.tracking.processor.stayaligned.adjust.TrackerYaw.hasTrackerYaw
import dev.slimevr.tracking.processor.stayaligned.adjust.TrackerYaw.trackerYaw
import dev.slimevr.tracking.processor.stayaligned.trackers.TrackerSkeleton

object CenterYaw {

	fun ofSkeleton(
		trackers: TrackerSkeleton,
		config: StayAlignedConfig? = null,
	): Angle? {
		val head = trackers.head
		val upperBody = trackers.upperBody
		val leftUpperLeg = trackers.leftUpperLeg
		val rightUpperLeg = trackers.rightUpperLeg
		val leftLowerLeg = trackers.leftLowerLeg
		val rightLowerLeg = trackers.rightLowerLeg

		if (
			// Head optional, because some mocap scenarios don't use one
			upperBody.isEmpty() ||
			leftUpperLeg == null ||
			rightUpperLeg == null ||
			leftLowerLeg == null ||
			rightLowerLeg == null
		) {
			return null
		}

		// Need a minimum set of trackers, and the trackers need to be oriented in a
		// way where we can actually calculate its yaw.
		val hasCenterYaw =
			upperBody.all(::hasTrackerYaw) &&
				hasTrackerYaw(leftUpperLeg) &&
				hasTrackerYaw(rightUpperLeg) &&
				hasTrackerYaw(leftLowerLeg) &&
				hasTrackerYaw(rightLowerLeg)
		if (!hasCenterYaw) {
			return null
		}

		val isAdaptive = config?.adaptiveKinetic == true
		val posture = if (isAdaptive) {
			AdaptiveKineticPostureDetector.detectPosture(trackers)
		} else {
			KineticPosture.STANDING_OR_DANCING
		}

		// Calculate average yaw of the body
		val averageYaw = AngleAverage()

		if (head != null && hasTrackerYaw(head)) {
			// In adaptive kinetic mode, 6-DoF optical HMD acts as the ground truth anchor
			val headWeight = if (isAdaptive && (head.isHmd || !head.isImu())) {
				3.0f
			} else {
				CENTER_ERROR_HEAD_WEIGHT
			}
			averageYaw.add(trackerYaw(head), headWeight)
		}

		upperBody.forEach {
			averageYaw.add(trackerYaw(it), CENTER_ERROR_UPPER_BODY_WEIGHT)
		}

		// When sitting in adaptive mode, reduce leg yaw influence so crossed legs don't skew center yaw
		val legWeightMult = if (isAdaptive && posture == KineticPosture.SITTING) 0.2f else 1.0f

		averageYaw.add(trackerYaw(leftUpperLeg), CENTER_ERROR_UPPER_LEG_WEIGHT * legWeightMult)
		averageYaw.add(trackerYaw(rightUpperLeg), CENTER_ERROR_UPPER_LEG_WEIGHT * legWeightMult)

		averageYaw.add(trackerYaw(leftLowerLeg), CENTER_ERROR_LOWER_LEG_WEIGHT * legWeightMult)
		averageYaw.add(trackerYaw(rightLowerLeg), CENTER_ERROR_LOWER_LEG_WEIGHT * legWeightMult)

		return averageYaw.toAngle()
	}
}
