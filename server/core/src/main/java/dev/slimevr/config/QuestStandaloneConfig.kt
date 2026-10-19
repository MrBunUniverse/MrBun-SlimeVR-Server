package dev.slimevr.config

enum class RecenterBehavior {
	KEEP_FLOOR,
	REANCHOR_ON_RECENTER,
	REANCHOR_ON_FULL_RESET,
}

enum class TrackingProfileType {
	STANDING,
	CROUCHING,
	SITTING,
	CUSTOM,
}

class TrackingProfile {
	var floorAnchorEnabled: Boolean = true
	var floorHeight: Float = 0.0f
	var correctionStrength: Float = 0.5f // 0.0 to 1.0 (0% to 100%)
	var footPlantStrength: Float = 0.5f
	var skatingCorrectionStrength: Float = 0.5f
	var crouchCompensation: Boolean = true
	var crouchStrength: Float = 0.5f
	var hmdVerticalOffset: Float = 0.0f // in meters (e.g. 0.00m)
	var recenterBehavior: RecenterBehavior = RecenterBehavior.REANCHOR_ON_FULL_RESET
	var skeletonConstraintsEnabled: Boolean = true
	var constraintStrength: Float = 0.8f
	var filteringType: String = "smoothing"
	var predictionEnabled: Boolean = false
}

class QuestStandaloneConfig {
	var enabled: Boolean = true
	var activeProfile: TrackingProfileType = TrackingProfileType.STANDING
	var floorAnchorEnabled: Boolean = true
	var floorHeight: Float = 0.0f // in meters
	var correctionStrength: Float = 0.5f // 0.0 to 1.0
	var hmdVerticalOffset: Float = 0.0f // in meters
	var recenterBehavior: RecenterBehavior = RecenterBehavior.REANCHOR_ON_FULL_RESET
	var crouchCompensationEnabled: Boolean = true
	var crouchCompensationStrength: Float = 0.5f
	var footPlantStrength: Float = 0.5f
	var skatingCorrectionStrength: Float = 0.5f
	var skeletonConstraintsEnabled: Boolean = true
	var constraintStrength: Float = 0.8f
	var predictionEnabled: Boolean = false
	var oscRate: Int = 60 // 30, 50, 60, 90 Hz
	var chatboxEnabled: Boolean = true
	var chatboxIntervalSeconds: Int = 30
	var chatboxLowBatteryWarning: Boolean = true
	var chatboxOnlyMode: Boolean = false
	var profiles: MutableMap<String, TrackingProfile> = mutableMapOf()

	init {
		// Initialize default tracking profiles
		profiles["STANDING"] = TrackingProfile().apply {
			floorAnchorEnabled = true
			correctionStrength = 0.5f
			footPlantStrength = 0.5f
			skatingCorrectionStrength = 0.5f
			crouchCompensation = true
			crouchStrength = 0.5f
		}
		profiles["CROUCHING"] = TrackingProfile().apply {
			floorAnchorEnabled = true
			correctionStrength = 0.7f
			footPlantStrength = 0.7f
			skatingCorrectionStrength = 0.3f
			crouchCompensation = true
			crouchStrength = 0.8f
		}
		profiles["SITTING"] = TrackingProfile().apply {
			floorAnchorEnabled = false
			correctionStrength = 0.2f
			footPlantStrength = 0.0f
			skatingCorrectionStrength = 0.0f
			crouchCompensation = false
			crouchStrength = 0.0f
		}
		profiles["CUSTOM"] = TrackingProfile()
	}
}
