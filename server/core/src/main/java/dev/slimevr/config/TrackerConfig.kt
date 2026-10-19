package dev.slimevr.config

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.JsonNodeFactory
import dev.slimevr.VRServer
import dev.slimevr.tracking.trackers.Tracker
import io.github.axisangles.ktmath.ObjectQuaternion

class TrackerConfig {
	var customName: String? = null
	var designation: String? = null

	@get:JvmName("isHide")
	var hide: Boolean = false
	var adjustment: ObjectQuaternion? = null
	var mountingOrientation: ObjectQuaternion? = null
	var mountingResetOrientation: ObjectQuaternion? = null
	var allowDriftCompensation: Boolean? = null

	/**
	 * Only checked if [ServerConfig.useMagnetometerOnAllTrackers] enabled
	 */
	var shouldHaveMagEnabled: Boolean? = null

	// Adaptive Drift Profile & Persistent IMU Memory
	var learnedDriftRateDegPerMin: Float = 0.0f
	var totalDriftObservations: Int = 0
	// Drift auto-learning is switched off until the recorded-data redesign.
	// Every learning and restore path checks this flag, and the setter also
	// overrides a saved `true` from older configs.
	var autoLearnDrift: Boolean = false
		set(_) {
			field = false
		}
	var imuProfileOverride: String? = null
	var adaptiveDriftModelVersion: Int = 1
	var adaptiveDriftConfidence: Float = 0.0f
	var adaptiveDriftLastAcceptedAt: Long = 0L
	var adaptiveDriftLearningPaused: Boolean = false
	var previousLearnedDriftRateDegPerMin: Float = 0.0f
	var previousTotalDriftObservations: Int = 0
	var previousAdaptiveDriftConfidence: Float = 0.0f
	var previousAdaptiveDriftLastAcceptedAt: Long = 0L
	var hasPreviousAdaptiveDriftModel: Boolean = false

	constructor()

	constructor(tracker: Tracker) {
		this.designation = if (tracker.trackerPosition != null) tracker.trackerPosition!!.designation else null
		this.customName = tracker.customName
		allowDriftCompensation = tracker.isImu() && tracker.imuType?.name?.contains("BNO") != true
		shouldHaveMagEnabled = tracker.isImu()
	}

	companion object {
		@JvmStatic
		fun toV2(v1: JsonNode, factory: JsonNodeFactory): JsonNode {
			val node = factory.objectNode()
			if (v1.has("customName")) node.set<JsonNode>("customName", v1["customName"])
			if (v1.has("designation")) node.set<JsonNode>("designation", v1["designation"])
			if (v1.has("hide")) node.set<JsonNode>("hide", v1["hide"])
			if (v1.has("mountingRotation")) node.set<JsonNode>("mountingRotation", v1["mountingRotation"])
			if (v1.has("adjustment")) node.set<JsonNode>("adjustment", v1["adjustment"])
			return node
		}
	}
}

val Tracker.config: TrackerConfig
	get() = if (VRServer.instanceInitialized) {
		VRServer.instance.configManager.vrConfig.getTracker(this)
	} else {
		configFallback ?: TrackerConfig(this).also { configFallback = it }
	}
