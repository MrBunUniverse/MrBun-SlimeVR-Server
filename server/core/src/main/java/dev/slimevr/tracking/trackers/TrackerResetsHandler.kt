package dev.slimevr.tracking.trackers

import com.jme3.math.FastMath
import dev.slimevr.VRServer
import dev.slimevr.config.ArmsResetModes
import dev.slimevr.config.DriftCompensationConfig
import dev.slimevr.config.ResetsConfig
import dev.slimevr.config.TrackerConfig
import dev.slimevr.config.config
import dev.slimevr.filtering.CircularArrayList
import dev.slimevr.tracking.trackers.udp.TrackerDataType
import io.github.axisangles.ktmath.EulerAngles
import io.github.axisangles.ktmath.EulerOrder
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import kotlin.math.*

private const val DRIFT_COOLDOWN_MS = 50000L

/** Class taking care of full reset, yaw reset, mounting reset, and drift compensation logic. */
class TrackerResetsHandler(val tracker: Tracker) {

	private val HalfHorizontal = EulerAngles(
		EulerOrder.YZX,
		0f,
		Math.PI.toFloat(),
		0f,
	).toQuaternion()
	private var driftAmount = 0f
	private var averagedDriftQuat = Quaternion.IDENTITY
	private var rotationSinceReset = Quaternion.IDENTITY
	private var driftQuats = CircularArrayList<Quaternion>(0)
	private var driftTimes = CircularArrayList<Long>(0)
	private var totalDriftTime: Long = 0
	private var driftSince: Long = 0
	private var timeAtLastReset: Long = 0
	var compensateDrift = false
	private var driftPrediction = false
	private var driftCompensationEnabled = false
	private var adaptiveYawCorrectionRad = 0f
	private var adaptiveYawTargetRad = 0f
	private var adaptiveConfigDirty = false
	private var lastAdaptiveConfigSaveAt = 0L
	private var armsResetMode = ArmsResetModes.BACK
	private var yawResetSmoothTime = 0.0f
	var saveMountingReset = false
	var resetHmdPitch = false
	var allowDriftCompensation = true
		set(value) {
			field = value
			refreshDriftCompensationEnabled()
		}
	var lastResetQuaternion: Quaternion? = null
	var recoveryYawFix = Quaternion.IDENTITY

	val adaptiveYawCorrectionDegrees: Float
		get() = Math.toDegrees(adaptiveYawCorrectionRad.toDouble()).toFloat()
	val adaptiveYawCorrectionRadians: Float
		get() = adaptiveYawCorrectionRad

	// Manual mounting orientation
	var mountingOrientation = HalfHorizontal
		set(value) {
			field = value
			clearRecovery()
			// Clear the mounting reset now that it's been set manually
			clearMounting()
			// A mounting/role change invalidates the runtime correction's reference
			// frame. Keep the learned rate, but re-learn its live offset from the
			// newly mounted pose.
			rebaseAdaptiveCorrectionForReset()
		}

	// Reference adjustment quats

	/**
	 * Gyro fix is set by full reset. This sets the current y rotation to 0, correcting
	 * for initial yaw rotation and the rotation incurred by mounting orientation. This
	 * is a local offset in rotation and does not affect the axes of rotation.
	 *
	 * This rotation is only used to compute [attachmentFix], otherwise [yawFix] would
	 * correct for the same rotation.
	 */
	private var gyroFix = Quaternion.IDENTITY

	/**
	 * Attachment fix is set by full reset. This sets the current x and z rotations to
	 * 0, correcting for initial pitch and roll rotation. This is a global offset in
	 * rotation and affects the axes of rotation.
	 *
	 * This effectively sets the rotation at the moment of a full reset to be
	 * zero-reference in the x and z axes.
	 */
	private var attachmentFix = Quaternion.IDENTITY

	/**
	 * Mounting rotation fix is set by mounting reset. This corrects for the mounting
	 * orientation, then the inverse is used to correct for the rotation incurred. This
	 * value is computed after [yawFix], but takes effect before [yawFix]. This affects
	 * the axes of rotation, but does not incur an offset in rotation.
	 *
	 * This rotation is done in addition to [mountingOrientation] as to not interfere
	 * with the functionality of manual mounting orientation. This effectively sets the
	 * rotation at the moment of a mounting reset to be zero-reference in the y-axis. If
	 * no mounting reset is done, then this rotation will not be used and only
	 * [mountingOrientation] will apply.
	 */
	var mountRotFix = Quaternion.IDENTITY
		private set

	/**
	 * Yaw fix is set by yaw reset. This sets the current y rotation to match the
	 * provided reference, correlating the tracker to the provided frame of reference.
	 * This is a local offset in rotation and does not affect the axes of rotation.
	 *
	 * This effectively aligns the current yaw rotation to the head tracker's yaw
	 * rotation.
	 */
	private var yawFix = Quaternion.IDENTITY

	/**
	 * Constraint fix is set by skeleton constraints. This corrects for any yaw rotation
	 * that violates the skeleton constraints. This is a local offset in rotation and
	 * does not affect the axes of rotation.
	 */
	private var constraintFix = Quaternion.IDENTITY

	// Zero-reference/identity adjustment quats for IMU debugging
	private var gyroFixNoMounting = Quaternion.IDENTITY
	private var attachmentFixNoMounting = Quaternion.IDENTITY
	private var yawFixZeroReference = Quaternion.IDENTITY

	/**
	 * T-Pose down fix is set by full reset. This corrects for the pitch of the rotation
	 * assuming a t-pose reference, adjusting to match our expected i-pose reference.
	 * This is a global offset in rotation and affects the axes of rotation.
	 */
	private var tposeDownFix = Quaternion.IDENTITY

	/**
	 * Reads/loads drift compensation settings from given config
	 */
	fun readDriftCompensationConfig(config: DriftCompensationConfig) {
		driftPrediction = config.prediction
		driftAmount = config.amount
		val maxResets = config.maxResets

		if (maxResets != driftQuats.capacity()) {
			driftQuats = CircularArrayList<Quaternion>(maxResets)
			driftTimes = CircularArrayList<Long>(maxResets)
		}

		seedLearnedDriftIfEmpty()
		val isBno = tracker.config.imuProfileOverride?.equals("bno085", ignoreCase = true) == true ||
			(tracker.imuType?.name?.contains("BNO") == true && (tracker.config.imuProfileOverride.isNullOrEmpty() || tracker.config.imuProfileOverride.equals("auto", ignoreCase = true)))
		compensateDrift = !isBno && (config.enabled || (tracker.config.autoLearnDrift && tracker.config.learnedDriftRateDegPerMin != 0.0f))
		refreshDriftCompensationEnabled()
	}

	fun seedLearnedDriftIfEmpty() {
		if (driftQuats.isEmpty() && tracker.isImu()) {
			var effectiveRate = tracker.config.learnedDriftRateDegPerMin
			val override = tracker.config.imuProfileOverride ?: "auto"
			if (override.equals("bno085", ignoreCase = true)) {
				effectiveRate = 0.0f
				compensateDrift = false
			} else if (effectiveRate == 0.0f) {
				// Seed baseline if a known profile preset or IMU is active
				effectiveRate = when (override.lowercase()) {
					"mpu6050" -> 4.5f

					"bmi160" -> 3.15f

					"lsm6_icm" -> 0.85f

					else -> {
						val imuName = tracker.imuType?.name ?: ""
						when {
							imuName.contains("6050") || imuName.contains("6500") -> 4.5f
							imuName.contains("160") -> 3.15f
							imuName.contains("270") || imuName.contains("LSM") || imuName.contains("42688") -> 0.85f
							imuName.contains("BNO") -> 0.0f
							else -> 0.0f
						}
					}
				}
				if (effectiveRate != 0.0f) {
					tracker.config.learnedDriftRateDegPerMin = effectiveRate
				}
			}

			// A profile seed is only a migration prior. It is not applied as active
			// compensation until measured observations have earned confidence.
			if (effectiveRate != 0.0f &&
				tracker.config.totalDriftObservations > 0 &&
				tracker.config.adaptiveDriftLastAcceptedAt <= 0L
			) {
				val baselineMinutes = 5.0f
				val seedAngleRad = Math.toRadians((effectiveRate * baselineMinutes).toDouble()).toFloat()
				val seedQuat = EulerAngles(EulerOrder.YZX, 0f, seedAngleRad, 0f).toQuaternion()
				if (driftQuats.capacity() == 0) {
					driftQuats = CircularArrayList(6)
					driftTimes = CircularArrayList(6)
				}
				driftQuats.add(seedQuat)
				val baselineMs = (baselineMinutes * 60000L).toLong()
				driftTimes.add(baselineMs)
				totalDriftTime = baselineMs
				averagedDriftQuat = seedQuat
				driftSince = System.currentTimeMillis()
			}
		}
	}

	fun readAdaptiveProfile(config: TrackerConfig) {
		seedLearnedDriftIfEmpty()
		val isBno = tracker.config.imuProfileOverride?.equals("bno085", ignoreCase = true) == true ||
			(tracker.imuType?.name?.contains("BNO") == true && (tracker.config.imuProfileOverride.isNullOrEmpty() || tracker.config.imuProfileOverride.equals("auto", ignoreCase = true)))
		if (isBno) {
			compensateDrift = false
		} else if (tracker.config.autoLearnDrift && tracker.config.learnedDriftRateDegPerMin != 0.0f) {
			compensateDrift = true
		}
		if (!isBno && allowDriftCompensation) restoreAdaptiveDriftModel()
		refreshDriftCompensationEnabled()
	}

	/** Restores only measured model state; profile defaults remain a weak prior. */
	private fun restoreAdaptiveDriftModel() {
		adaptiveYawCorrectionRad = 0f
		adaptiveYawTargetRad = 0f
		val acceptedAt = tracker.config.adaptiveDriftLastAcceptedAt
		if (!tracker.config.autoLearnDrift || tracker.config.totalDriftObservations <= 0 || acceptedAt <= 0L) return

		val elapsedMs = (System.currentTimeMillis() - acceptedAt).coerceAtLeast(0L)
		// learnedDriftRate is the measured sensor drift direction; runtime
		// compensation applies its inverse.
		val predictedDegrees = (-tracker.config.learnedDriftRateDegPerMin * elapsedMs / 60000.0f)
			.coerceIn(-45.0f, 45.0f)
		adaptiveYawCorrectionRad = Math.toRadians(predictedDegrees.toDouble()).toFloat()
		adaptiveYawTargetRad = adaptiveYawCorrectionRad
	}

	/**
	 * Slews the persistent correction toward a stable-pose estimate. The rate
	 * limit prevents a bad single frame from snapping the torso.
	 */
	fun setAdaptiveYawCorrectionTarget(targetRadians: Float, deltaTimeSeconds: Float) {
		if (!targetRadians.isFinite() || !deltaTimeSeconds.isFinite()) return
		adaptiveYawTargetRad = wrapRadians(targetRadians)
		val error = wrapRadians(adaptiveYawTargetRad - adaptiveYawCorrectionRad)
		val maxStep = Math.toRadians((3.0f * deltaTimeSeconds.coerceIn(0f, 0.1f)).toDouble()).toFloat()
		adaptiveYawCorrectionRad = wrapRadians(
			adaptiveYawCorrectionRad + error.coerceIn(-maxStep, maxStep),
		)
	}

	fun clearAdaptiveYawCorrection() {
		adaptiveYawCorrectionRad = 0f
		adaptiveYawTargetRad = 0f
	}

	/**
	 * Re-anchors live adaptive state after a user calibration without deleting
	 * the persistent learned rate. The next stable-pose window must start from
	 * the new reset reference instead of applying the old pose's correction.
	 */
	private fun rebaseAdaptiveCorrectionForReset() {
		clearAdaptiveYawCorrection()
		AdaptiveDriftCompensation.clear(tracker)
	}

	fun setAdaptiveDriftLearningPaused(paused: Boolean) {
		if (!tracker.isImu()) return
		tracker.config.adaptiveDriftLearningPaused = paused
		if (paused) AdaptiveDriftCompensation.clear(tracker)
		if (VRServer.instanceInitialized) VRServer.instance.configManager.saveConfig()
	}

	fun setAdaptiveDriftEnabled(enabled: Boolean) {
		if (!tracker.isImu()) return
		allowDriftCompensation = enabled
		tracker.config.allowDriftCompensation = enabled
		if (!enabled) {
			clearAdaptiveYawCorrection()
			AdaptiveDriftCompensation.clear(tracker)
		}
		if (VRServer.instanceInitialized) VRServer.instance.configManager.saveConfig()
	}

	/** Restores the model that was accepted immediately before the current one. */
	fun restorePreviousAdaptiveDriftModel(): Boolean {
		val config = tracker.config
		if (!config.hasPreviousAdaptiveDriftModel) return false
		config.learnedDriftRateDegPerMin = config.previousLearnedDriftRateDegPerMin
		config.totalDriftObservations = config.previousTotalDriftObservations
		config.adaptiveDriftConfidence = config.previousAdaptiveDriftConfidence
		config.adaptiveDriftLastAcceptedAt = config.previousAdaptiveDriftLastAcceptedAt
		clearAdaptiveYawCorrection()
		restoreAdaptiveDriftModel()
		AdaptiveDriftCompensation.clear(tracker)
		if (VRServer.instanceInitialized) VRServer.instance.configManager.saveConfig()
		return true
	}

	/** Debounced config persistence for learned observations. */
	fun flushAdaptiveConfigPersistence(nowMs: Long = System.currentTimeMillis()) {
		if (!adaptiveConfigDirty || !VRServer.instanceInitialized) return
		if (lastAdaptiveConfigSaveAt != 0L && nowMs - lastAdaptiveConfigSaveAt < 5_000L) return
		VRServer.instance.configManager.saveConfig()
		lastAdaptiveConfigSaveAt = nowMs
		adaptiveConfigDirty = false
	}

	private fun markAdaptiveConfigDirty() {
		adaptiveConfigDirty = true
		flushAdaptiveConfigPersistence()
	}

	private fun wrapRadians(value: Float): Float {
		var wrapped = value
		while (wrapped > Math.PI.toFloat()) wrapped -= (Math.PI * 2.0).toFloat()
		while (wrapped < -Math.PI.toFloat()) wrapped += (Math.PI * 2.0).toFloat()
		return wrapped
	}

	fun setAdaptiveProfileOverride(profile: String) {
		val normalized = profile.trim().lowercase().takeIf { it in setOf("auto", "mpu6050", "bmi160", "lsm6_icm", "bno085") }
			?: return
		val current = tracker.config.imuProfileOverride ?: "auto"
		if (current == normalized) return

		tracker.config.imuProfileOverride = normalized
		tracker.config.learnedDriftRateDegPerMin = 0.0f
		tracker.config.totalDriftObservations = 0
		tracker.config.adaptiveDriftConfidence = 0.0f
		tracker.config.adaptiveDriftLastAcceptedAt = 0L
		tracker.config.adaptiveDriftModelVersion = 1
		tracker.config.hasPreviousAdaptiveDriftModel = false
		clearAdaptiveYawCorrection()
		clearDriftCompensation()
		AdaptiveDriftCompensation.clear(tracker)
		readAdaptiveProfile(tracker.config)
		if (VRServer.instanceInitialized) {
			readDriftCompensationConfig(VRServer.instance.configManager.vrConfig.driftCompensation)
		}
	}

	fun writeAdaptiveProfile(config: TrackerConfig) {
		// Preserved via tracker.config mutations directly
	}

	fun getDriftSinceDurationSeconds(): Float = if (driftSince > 0) (System.currentTimeMillis() - driftSince) / 1000.0f else 0.0f

	/**
	 * Clears drift compensation data
	 */
	fun clearDriftCompensation() {
		driftSince = 0L
		timeAtLastReset = 0L
		totalDriftTime = 0L
		driftQuats.clear()
		driftTimes.clear()
		adaptiveYawCorrectionRad = 0f
		adaptiveYawTargetRad = 0f
	}

	/**
	 * Resets persistent learned drift and clears active drift compensation buffers.
	 */
	fun resetLearnedDrift() {
		tracker.config.learnedDriftRateDegPerMin = 0.0f
		tracker.config.totalDriftObservations = 0
		tracker.config.adaptiveDriftConfidence = 0.0f
		tracker.config.adaptiveDriftLastAcceptedAt = 0L
		tracker.config.adaptiveDriftModelVersion = 1
		clearDriftCompensation()
		AdaptiveDriftCompensation.clear(tracker)
		if (VRServer.instanceInitialized) {
			VRServer.instance.configManager.saveConfig()
		}
	}

	/**
	 * Records a drift observation obtained from an independent tracker reference.
	 *
	 * Reconnect recovery is deliberately the only automatic reference source here:
	 * the correction is measured after a real outage and validated against multiple
	 * trackers, so normal body motion and Stay Aligned's own correction are not
	 * mistaken for sensor drift.
	 */
	fun learnDriftObservation(observedYaw: Float, elapsedMs: Long, confidence: Float) {
		if (!tracker.isImu() || !tracker.config.autoLearnDrift || elapsedMs < 30_000L || confidence < 0.75f) return
		if (!observedYaw.isFinite() || !confidence.isFinite()) return

		val elapsedMinutes = elapsedMs / 60000.0f
		if (elapsedMinutes <= 0.0f) return

		var observedRate = Math.toDegrees(observedYaw.toDouble()).toFloat() / elapsedMinutes
		while (observedRate > 180.0f) observedRate -= 360.0f
		while (observedRate < -180.0f) observedRate += 360.0f
		// A larger value is more likely to be a mounting change than gyro drift.
		if (abs(observedRate) > 20.0f) return

		val observationCount = tracker.config.totalDriftObservations
		val alpha = if (observationCount < 3) 0.35f else 0.15f
		val currentRate = tracker.config.learnedDriftRateDegPerMin
		tracker.config.previousLearnedDriftRateDegPerMin = currentRate
		tracker.config.previousTotalDriftObservations = observationCount
		tracker.config.previousAdaptiveDriftConfidence = tracker.config.adaptiveDriftConfidence
		tracker.config.previousAdaptiveDriftLastAcceptedAt = tracker.config.adaptiveDriftLastAcceptedAt
		tracker.config.hasPreviousAdaptiveDriftModel = true
		tracker.config.learnedDriftRateDegPerMin =
			((1.0f - alpha) * currentRate + alpha * observedRate).coerceIn(-20.0f, 20.0f)
		tracker.config.totalDriftObservations = observationCount + 1
		tracker.config.adaptiveDriftModelVersion = 1
		tracker.config.adaptiveDriftConfidence = confidence.coerceIn(0f, 1f)
		tracker.config.adaptiveDriftLastAcceptedAt = System.currentTimeMillis()
		markAdaptiveConfigDirty()
	}

	/** Stable-pose observations share the same safety and persistence gate. */
	fun learnStablePoseObservation(observedYaw: Float, elapsedMs: Long, confidence: Float) = learnDriftObservation(observedYaw, elapsedMs, confidence)

	/**
	 * Checks for compensateDrift, allowDriftCompensation, and if
	 * a computed head tracker exists.
	 */
	fun refreshDriftCompensationEnabled() {
		driftCompensationEnabled = compensateDrift &&
			allowDriftCompensation &&
			VRServer.instanceInitialized &&
			TrackerUtils.getNonInternalNonImuTrackerForBodyPosition(
				VRServer.instance.allTrackers,
				TrackerPosition.HEAD,
			) != null
	}

	/**
	 * Reads/loads reset settings from the given config
	 */
	fun readResetConfig(config: ResetsConfig) {
		armsResetMode = config.mode
		yawResetSmoothTime = config.yawResetSmoothTime
		saveMountingReset = config.saveMountingReset
		resetHmdPitch = config.resetHmdPitch
	}

	fun clearRecovery(fullReset: Boolean = false) {
		if (tracker.recovery.state == TrackerRecoveryState.NEEDS_RESET && !fullReset) return
		recoveryYawFix = Quaternion.IDENTITY
		tracker.recovery.cancel(force = fullReset)
	}

	fun trySetMountingReset(quat: Quaternion) {
		if (saveMountingReset) {
			mountRotFix = quat
		}
	}

	/**
	 * Takes a rotation and adjusts it to resets, mounting,
	 * and drift compensation, with the HMD as the reference.
	 */
	fun getReferenceAdjustedDriftRotationFrom(rotation: Quaternion): Quaternion = adjustToDrift(adjustToReference(rotation))

	/**
	 * Returns the mounting/reset-adjusted sample before adaptive drift. The
	 * stable-pose learner must observe this stage so it cannot learn its own fix.
	 */
	fun getReferenceAdjustedRotationBeforeDrift(rotation: Quaternion): Quaternion = adjustToReference(rotation)

	/**
	 * Takes a rotation and adjusts it to resets and mounting,
	 * with the identity Quaternion as the reference.
	 */
	fun getIdentityAdjustedDriftRotationFrom(rotation: Quaternion): Quaternion = adjustToDrift(adjustToIdentity(rotation))

	/**
	 * Get the reference adjusted accel.
	 */
	// TODO: Make this actually adjusted to the corrected IMU heading. The current
	//  implementation for heading correction doesn't appear to be correct and may simply
	//  make acceleration worse, so I'm just leaving this until we work that out. The
	//  output of this will be world space, but with an unknown offset to heading (yaw).
	//  - Butterscotch
	fun getReferenceAdjustedAccel(rawRot: Quaternion, accel: Vector3): Vector3 = rawRot.sandwich(accel)

	/**
	 * Converts raw or filtered rotation into reference- and
	 * mounting-reset-adjusted by applying quaternions produced after
	 * full reset, yaw rest and mounting reset
	 */
	private fun adjustToReference(rotation: Quaternion): Quaternion {
		var rot = rotation
		// Align heading axis with bone space
		if (!tracker.isHmd || tracker.trackerPosition != TrackerPosition.HEAD) {
			rot *= mountingOrientation
		}
		// Heading correction assuming manual orientation is correct
		rot = gyroFix * rot
		// Align attitude axes with bone space
		rot *= attachmentFix
		// Secondary heading axis alignment with bone space for automatic mounting
		// Note: Applying an inverse amount of heading correction corresponding to the
		//  axis alignment quaternion will leave the correction to another variable
		rot = mountRotFix.inv() * (rot * mountRotFix)
		// More attitude axes alignment specifically for the t-pose configuration, this
		//  probably shouldn't be a separate variable from attachmentFix?
		rot *= tposeDownFix
		// More heading correction
		rot = yawFix * rot
		rot = recoveryYawFix * rot
		rot = constraintFix * rot
		return rot
	}

	/**
	 * Converts raw or filtered rotation into zero-reference-adjusted by
	 * applying quaternions produced after full reset and yaw reset only
	 */
	// This is essentially just adjustToReference but aligning to quaternion identity
	//  rather than to the bone.
	private fun adjustToIdentity(rotation: Quaternion): Quaternion {
		var rot = rotation
		rot = gyroFixNoMounting * rot
		rot *= attachmentFixNoMounting
		rot = yawFixZeroReference * rot
		rot = recoveryYawFix * rot
		rot = constraintFix * rot
		return rot
	}

	/**
	 * Adjust the given rotation for drift compensation if enabled,
	 * and returns it
	 */
	private fun adjustToDrift(rotation: Quaternion, includeAdaptiveYaw: Boolean = true): Quaternion {
		var adjusted = rotation
		if (driftCompensationEnabled && totalDriftTime > 0) {
			var driftTimeRatio = ((System.currentTimeMillis() - driftSince).toFloat() / totalDriftTime)
			if (!driftPrediction) {
				driftTimeRatio = min(1.0f, driftTimeRatio)
			}
			adjusted = averagedDriftQuat.pow(driftAmount * driftTimeRatio) * adjusted
		}
		if (includeAdaptiveYaw && allowDriftCompensation && adaptiveYawCorrectionRad != 0f) {
			adjusted = Quaternion.rotationAroundYAxis(adaptiveYawCorrectionRad) * adjusted
		}
		return adjusted
	}

	/**
	 * Reset the tracker so that its current rotation is counted as (0, HMD Yaw,
	 * 0). This allows the tracker to be strapped to body at any pitch and roll.
	 */
	fun resetFull(reference: Quaternion) {
		clearRecovery(fullReset = true)
		rebaseAdaptiveCorrectionForReset()
		constraintFix = Quaternion.IDENTITY

		if (tracker.trackerDataType == TrackerDataType.FLEX_RESISTANCE) {
			tracker.trackerFlexHandler.resetMin()
			postProcessResetFull(reference)
			return
		} else if (tracker.trackerDataType == TrackerDataType.FLEX_ANGLE) {
			postProcessResetFull(reference)
			return
		}

		// Adjust for T-Pose (down)
		tposeDownFix = if (((tracker.trackerPosition.isLeftArm() || tracker.trackerPosition.isLeftFinger()) && armsResetMode == ArmsResetModes.TPOSE_DOWN)) {
			EulerAngles(EulerOrder.YZX, 0f, 0f, -FastMath.HALF_PI).toQuaternion()
		} else if (((tracker.trackerPosition.isRightArm() || tracker.trackerPosition.isRightFinger()) && armsResetMode == ArmsResetModes.TPOSE_DOWN)) {
			EulerAngles(EulerOrder.YZX, 0f, 0f, FastMath.HALF_PI).toQuaternion()
		} else {
			Quaternion.IDENTITY
		}

		// Old rot for drift compensation
		val oldRot = adjustToReference(tracker.getRawRotation())
		lastResetQuaternion = oldRot

		// Adjust raw rotation to mountingOrientation
		val mountingAdjustedRotation = tracker.getRawRotation() * mountingOrientation

		// Gyrofix
		if (tracker.allowMounting || (tracker.trackerPosition == TrackerPosition.HEAD && !tracker.isHmd)) {
			gyroFix = if (tracker.isComputed) {
				fixGyroscope(tracker.getRawRotation())
			} else {
				fixGyroscope(mountingAdjustedRotation * tposeDownFix)
			}
		}

		// Mounting for computed trackers
		if (tracker.isComputed && tracker.trackerPosition != TrackerPosition.HEAD) {
			// Set mounting to the reference's yaw so that a computed
			// tracker goes forward according to the head tracker.
			mountRotFix = getYawQuaternion(reference)
		}

		// Attachment fix
		attachmentFix = if (tracker.trackerPosition == TrackerPosition.HEAD && tracker.isHmd) {
			if (resetHmdPitch) {
				// Reset the HMD's pitch if it's assigned to head and resetHmdPitch is true
				// Get rotation without yaw (make sure to use the raw rotation directly!)
				val rotBuf = getYawQuaternion(tracker.getRawRotation()).inv() * tracker.getRawRotation()
				// Isolate pitch
				Quaternion(rotBuf.w, -rotBuf.x, 0f, 0f).unit()
			} else {
				// Don't reset the HMD at all
				Quaternion.IDENTITY
			}
		} else {
			fixAttachment(mountingAdjustedRotation)
		}

		// Rotate attachmentFix by 180 degrees as a workaround for t-pose (down)
		if (tposeDownFix != Quaternion.IDENTITY && tracker.allowMounting) {
			attachmentFix *= HalfHorizontal
		}

		makeIdentityAdjustmentQuatsFull()

		// Don't adjust yaw if head and computed
		if (tracker.trackerPosition != TrackerPosition.HEAD || !tracker.isComputed) {
			yawFix = fixYaw(mountingAdjustedRotation, reference)
			tracker.yawResetSmoothing.reset()
		}

		calculateDrift(oldRot)

		// Reset Stay Aligned (before resetting filtering, which depends on the
		// tracker's rotation)
		tracker.stayAligned.reset()

		postProcessResetFull(reference)
	}

	private fun postProcessResetFull(reference: Quaternion) {
		if (this.tracker.needReset) {
			this.tracker.needReset = false
		}

		tracker.resetFilteringQuats(reference)
	}

	/**
	 * Reset the tracker so that its current yaw rotation is aligned with the HMD's
	 * Yaw. This allows the tracker to have yaw independent of the HMD. Tracker
	 * should still report yaw as if it was mounted facing HMD, mounting
	 * position should be corrected in the source.
	 */
	fun resetYaw(reference: Quaternion) {
		if (tracker.recovery.state == TrackerRecoveryState.NEEDS_RESET) return
		clearRecovery()
		rebaseAdaptiveCorrectionForReset()
		// TODO HMD doesn't get yaw reset, which makes it so tracker.resetFilteringQuats() doesn't get called

		constraintFix = Quaternion.IDENTITY

		if (tracker.trackerDataType == TrackerDataType.FLEX_RESISTANCE ||
			tracker.trackerDataType == TrackerDataType.FLEX_ANGLE
		) {
			// Don't do anything as these don't have yaw anyways
			return
		}

		// Old rot for drift compensation
		val oldRot = adjustToReference(tracker.getRawRotation())
		lastResetQuaternion = oldRot

		val yawFixOld = yawFix
		yawFix = fixYaw(tracker.getRawRotation() * mountingOrientation, reference)
		tracker.yawResetSmoothing.reset()

		makeIdentityAdjustmentQuatsYaw()

		calculateDrift(oldRot)

		// Start at yaw before reset if smoothing enabled
		if (yawResetSmoothTime > 0.0f) {
			tracker.yawResetSmoothing.interpolate(
				yawFixOld / yawFix,
				Quaternion.IDENTITY,
				yawResetSmoothTime,
			)
		}

		// Reset Stay Aligned (before resetting filtering, which depends on the
		// tracker's rotation)
		tracker.stayAligned.reset()

		tracker.resetFilteringQuats(reference)
	}

	/**
	 * Perform the math to align the tracker to go forward
	 * and stores it in mountRotFix, and adjusts yawFix
	 */
	fun resetMounting(reference: Quaternion) {
		if (tracker.recovery.state == TrackerRecoveryState.NEEDS_RESET) return
		clearRecovery()
		rebaseAdaptiveCorrectionForReset()
		// Mounting calibration must capture the physical pose, not a transient
		// Stay Aligned correction that was calculated from the previous pose.
		tracker.stayAligned.reset()
		if (tracker.trackerDataType == TrackerDataType.FLEX_RESISTANCE) {
			tracker.trackerFlexHandler.resetMax()
			tracker.resetFilteringQuats(reference)
			return
		} else if (tracker.trackerDataType == TrackerDataType.FLEX_ANGLE) {
			return
		}

		constraintFix = Quaternion.IDENTITY

		// Get the current calibrated rotation
		// Do not bake the persistent adaptive yaw correction into mountRotFix.
		// It is cleared above and will be learned again against this new frame.
		var rotBuf = adjustToDrift(
			tracker.getRawRotation() * mountingOrientation,
			includeAdaptiveYaw = false,
		)
		rotBuf = gyroFix * rotBuf
		rotBuf *= attachmentFix
		rotBuf = yawFix * rotBuf

		// Adjust buffer to reference
		rotBuf = reference.project(Vector3.POS_Y).inv().unit() * rotBuf

		// Rotate a vector pointing up by the quat
		val rotVector = rotBuf.sandwich(Vector3.POS_Y)

		// Calculate the yaw angle using tan
		var yawAngle = atan2(rotVector.x, rotVector.z)

		// Adjust for T-Pose and fingers
		if ((tracker.trackerPosition.isLeftArm() && armsResetMode == ArmsResetModes.TPOSE_DOWN) ||
			(tracker.trackerPosition.isRightArm() && armsResetMode == ArmsResetModes.TPOSE_UP) ||
			tracker.trackerPosition.isLeftFinger()
		) {
			// Tracker goes right
			yawAngle -= FastMath.HALF_PI
		}
		if ((tracker.trackerPosition.isLeftArm() && armsResetMode == ArmsResetModes.TPOSE_UP) ||
			(tracker.trackerPosition.isRightArm() && armsResetMode == ArmsResetModes.TPOSE_DOWN) ||
			tracker.trackerPosition.isRightFinger()
		) {
			// Tracker goes left
			yawAngle += FastMath.HALF_PI
		}

		// Adjust for forward/back arms and thighs
		val isLowerArmBack = armsResetMode == ArmsResetModes.BACK && (tracker.trackerPosition.isLeftLowerArm() || tracker.trackerPosition.isRightLowerArm())
		val isArmForward = armsResetMode == ArmsResetModes.FORWARD && (tracker.trackerPosition.isLeftArm() || tracker.trackerPosition.isRightArm())
		if (!tracker.trackerPosition.isThigh() && !isArmForward && !isLowerArmBack) {
			// Tracker goes back
			yawAngle -= FastMath.PI
		}

		// Make an adjustment quaternion from the angle
		mountRotFix = EulerAngles(EulerOrder.YZX, 0f, yawAngle, 0f).toQuaternion()

		// save mounting reset
		if (saveMountingReset) tracker.saveMountingResetOrientation(mountRotFix)

		tracker.resetFilteringQuats(reference)
	}

	/**
	 * Apply a corrective rotation to the gyroFix
	 */
	fun updateConstraintFix(correctedRotation: Quaternion) {
		constraintFix *= correctedRotation
	}

	fun clearMounting() {
		mountRotFix = Quaternion.IDENTITY
	}

	private fun fixGyroscope(sensorRotation: Quaternion): Quaternion = getYawQuaternion(sensorRotation).inv()

	private fun fixAttachment(sensorRotation: Quaternion): Quaternion = (gyroFix * sensorRotation).inv()

	private fun fixYaw(sensorRotation: Quaternion, reference: Quaternion): Quaternion {
		var rot = gyroFix * sensorRotation
		rot *= attachmentFix
		rot = mountRotFix.inv() * (rot * mountRotFix)
		rot = getYawQuaternion(rot, useHorizontalFootHeading = tracker.trackerPosition.isFoot())
		return rot.inv() * reference.project(Vector3.POS_Y).unit()
	}

	/**
	 * Extract a foot heading from the most horizontal tracker axis.
	 *
	 * Euler yaw is not invariant to the order in which a foot tracker is tilted
	 * and rolled. That made a yaw reset assign a different sideways correction to
	 * each foot, which could visibly shift the feet and open the stance. Prefer
	 * the axis with the strongest horizontal component so this remains defined
	 * when a foot is mounted nearly on its side. Other tracker roles retain the
	 * established YZX convention because their reset semantics depend on it.
	 */
	private fun getYawQuaternion(rot: Quaternion, useHorizontalFootHeading: Boolean = false): Quaternion {
		if (!useHorizontalFootHeading) {
			return EulerAngles(EulerOrder.YZX, 0f, rot.toEulerAngles(EulerOrder.YZX).y, 0f).toQuaternion().twinNearest(rot)
		}

		val normalized = rot.unit()
		val localX = normalized.sandwichUnitX()
		val localZ = normalized.sandwichUnitZ()
		val xHorizontalSq = localX.x * localX.x + localX.z * localX.z
		val zHorizontalSq = localZ.x * localZ.x + localZ.z * localZ.z
		val yaw = when {
			xHorizontalSq >= zHorizontalSq && xHorizontalSq > 1e-6f -> atan2(-localX.z, localX.x)
			zHorizontalSq > 1e-6f -> atan2(localZ.x, localZ.z)
			else -> 0f
		}

		return Quaternion.rotationAroundYAxis(yaw).twinNearest(rot)
	}

	private fun makeIdentityAdjustmentQuatsFull() {
		val sensorRotation = tracker.getRawRotation()
		gyroFixNoMounting = fixGyroscope(sensorRotation)
		attachmentFixNoMounting = (gyroFixNoMounting * sensorRotation).inv()
		yawFixZeroReference = Quaternion.IDENTITY
	}

	private fun makeIdentityAdjustmentQuatsYaw() {
		var sensorRotation = tracker.getRawRotation()
		sensorRotation = gyroFixNoMounting * sensorRotation
		sensorRotation *= attachmentFixNoMounting
		yawFixZeroReference = fixGyroscope(sensorRotation)
	}

	/**
	 * Calculates drift since last reset and store the data related to it in
	 * driftQuat and timeAtLastReset
	 */
	private fun calculateDrift(beforeQuat: Quaternion) {
		val rotQuat = adjustToReference(tracker.getRawRotation())

		// Auto-learn persistent drift rate across sessions if interval is valid (>30s)
		if (tracker.isImu() && driftSince > 0) {
			val elapsedMs = System.currentTimeMillis() - driftSince
			val elapsedMin = elapsedMs / 60000.0f

			if (tracker.config.autoLearnDrift && elapsedMin >= 0.5f) {
				val deltaQuat = getYawQuaternion(rotQuat) / getYawQuaternion(beforeQuat)
				val deltaEuler = deltaQuat.toEulerAngles(EulerOrder.YZX)
				var deltaYawDeg = Math.toDegrees(deltaEuler.y.toDouble()).toFloat()
				while (deltaYawDeg > 180f) deltaYawDeg -= 360f
				while (deltaYawDeg < -180f) deltaYawDeg += 360f

				val observedRate = deltaYawDeg / elapsedMin
				// Filter out extreme resets (> 20 deg/min, likely posture re-calibration or manual turns)
				if (abs(observedRate) <= 20.0f) {
					val currentLearned = tracker.config.learnedDriftRateDegPerMin
					val obsCount = tracker.config.totalDriftObservations
					val alpha = if (obsCount < 3) 0.5f else 0.2f
					val newLearned = (1f - alpha) * currentLearned + alpha * observedRate
					tracker.config.learnedDriftRateDegPerMin = newLearned
					tracker.config.totalDriftObservations = obsCount + 1
					tracker.config.adaptiveDriftModelVersion = 1
					tracker.config.adaptiveDriftLastAcceptedAt = System.currentTimeMillis()
					markAdaptiveConfigDirty()
				}
			}
		}

		if (driftCompensationEnabled) {
			if (driftSince > 0 && System.currentTimeMillis() - timeAtLastReset > DRIFT_COOLDOWN_MS) {
				// Check and remove from lists to keep them under the reset limit
				if (driftQuats.size == driftQuats.capacity()) {
					driftQuats.removeLast()
					driftTimes.removeLast()
				}

				// Add new drift quaternion
				driftQuats.add(getYawQuaternion(rotQuat) / getYawQuaternion(beforeQuat))

				// Add drift time to total
				driftTimes.add(System.currentTimeMillis() - driftSince)
				totalDriftTime = 0
				for (time in driftTimes) {
					totalDriftTime += time
				}

				// Calculate drift Quaternions' weights
				val driftWeights = ArrayList<Float>(driftTimes.size)
				for (time in driftTimes) {
					driftWeights.add(time.toFloat() / totalDriftTime.toFloat())
				}

				// Make it so recent Quaternions weigh more
				for (i in driftWeights.size - 1 downTo 1) {
					// Add some of i-1's value to i
					driftWeights[i] = driftWeights[i] + driftWeights[i - 1] / driftWeights.size
					// Remove the value that was added to i from i-1
					driftWeights[i - 1] = driftWeights[i - 1] - driftWeights[i - 1] / driftWeights.size
				}

				// Set final averaged drift Quaternion
				averagedDriftQuat = fromAveragedQuaternions(driftQuats, driftWeights)

				// Save tracker rotation and current time
				rotationSinceReset = driftQuats.latest
				timeAtLastReset = System.currentTimeMillis()
			} else if (System.currentTimeMillis() - timeAtLastReset < DRIFT_COOLDOWN_MS && driftQuats.size > 0) {
				// Replace latest drift quaternion
				rotationSinceReset *= (getYawQuaternion(rotQuat) / getYawQuaternion(beforeQuat))
				driftQuats[driftQuats.size - 1] = rotationSinceReset

				// Add drift time to total
				driftTimes[driftTimes.size - 1] = driftTimes.latest + System.currentTimeMillis() - driftSince
				totalDriftTime = 0
				for (time in driftTimes) {
					totalDriftTime += time
				}

				// Calculate drift Quaternions' weights
				val driftWeights = ArrayList<Float>(driftTimes.size)
				for (time in driftTimes) {
					driftWeights.add(time.toFloat() / totalDriftTime.toFloat())
				}

				// Make it so recent Quaternions weigh more
				for (i in driftWeights.size - 1 downTo 1) {
					// Add some of i-1's value to i
					driftWeights[i] = driftWeights[i] + driftWeights[i - 1] / driftWeights.size
					// Remove the value that was added to i from i-1
					driftWeights[i - 1] = driftWeights[i - 1] - driftWeights[i - 1] / driftWeights.size
				}

				// Set final averaged drift Quaternion
				averagedDriftQuat = fromAveragedQuaternions(driftQuats, driftWeights)
			} else {
				timeAtLastReset = System.currentTimeMillis()
			}
		}

		driftSince = System.currentTimeMillis()
	}

	/**
	 * Calculates and returns the averaged Quaternion
	 * from the given Quaternions and weights.
	 */
	private fun fromAveragedQuaternions(
		qn: CircularArrayList<Quaternion>,
		tn: ArrayList<Float>,
	): Quaternion {
		var totalMatrix = qn[0].toMatrix() * tn[0]
		for (i in 1 until qn.size) {
			totalMatrix += (qn[i].toMatrix() * tn[i])
		}
		return totalMatrix.toQuaternion()
	}
}
