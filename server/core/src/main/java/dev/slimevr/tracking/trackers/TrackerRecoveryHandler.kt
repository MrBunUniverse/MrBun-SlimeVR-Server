package dev.slimevr.tracking.trackers

import dev.slimevr.VRServer
import io.eiren.util.logging.LogManager
import io.github.axisangles.ktmath.EulerOrder
import io.github.axisangles.ktmath.Quaternion
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.max

enum class TrackerRecoveryState(val id: Int) {
	NONE(0),
	BRIDGING_GAP(1),
	COMPENSATING(2),
	WAITING_FOR_STILLNESS(3),
	VALIDATING(4),
	BLENDING(5),
	NEEDS_RESET(6),
}

enum class TrackerRecoveryReason(val id: Int) {
	NONE(0),
	TRACKER_OFFLINE(1),
	TRACKER_MOVING(2),
	POOR_PACKET_RATE(3),
	NO_REFERENCE(4),
	REFERENCE_DISAGREEMENT(5),
	ROLE_OR_MOUNTING_CHANGED(6),
	INVALID_ROTATION(7),
}

class TrackerRecoveryHandler(private val tracker: Tracker) {
	companion object {
		// Wi-Fi jitter is normally tens of milliseconds. Do not start freezing an
		// IMU pose until a gap is clearly longer than a normal transport hiccup.
		private const val BRIDGE_AFTER_MS = 750L
		private const val COMPENSATE_AFTER_MS = 3500L
		private const val STILL_TIME_MS = 1500L
		private const val BLEND_TIME_MS = 500L
		private const val SNAPSHOT_INTERVAL_MS = 50L

		// Gaps are measured against any packet from the device. A motionless
		// tracker sends no rotation and is only heard through its ping replies,
		// so anything up to a missed ping is a normal cadence.
		private const val MAX_SAMPLE_GAP_MS = 1000L
		private const val MAX_STILL_ANGLE_RAD = 2f * PI.toFloat() / 180f
		private const val MAX_REFERENCE_DISAGREEMENT_RAD = 12f * PI.toFloat() / 180f
		private const val MIN_REFERENCE_CONFIDENCE = 0.75f
		private const val MAX_LEARNABLE_CORRECTION_RAD = 45f * PI.toFloat() / 180f

		// How long returning samples stay held while waiting for trusted
		// references (or stillness) before the tracker's own data is judged.
		private const val REFERENCE_WAIT_MS = 2000L

		// How long a tracker may wait for references before the user is asked for a reset.
		private const val REMINDER_AFTER_MS = 30_000L
		private const val STILLNESS_WAIT_MS = 5000L

		// A tracker that kept running through an outage keeps its yaw reference;
		// one that rebooted returns with an unrelated yaw. Returning data within
		// this window of the expected yaw is resumed without a correction.
		private const val MAX_CONTINUITY_YAW_RAD = 25f * PI.toFloat() / 180f
		private const val SELF_RESUME_CONFIDENCE = 0.5f
		private const val MAX_ANCHORS = 6
		private val TORSO_POSITIONS = setOf(
			TrackerPosition.UPPER_CHEST,
			TrackerPosition.CHEST,
			TrackerPosition.WAIST,
			TrackerPosition.HIP,
		)
	}

	private data class AnchorSnapshot(
		val tracker: Tracker,
		val yawOffset: Float,
		val weight: Float,
	)

	@Volatile
	var state = TrackerRecoveryState.NONE
		private set

	@Volatile
	var reason = TrackerRecoveryReason.NONE
		private set

	@Volatile
	var progress = 0f
		private set

	@Volatile
	var confidence = 0f
		private set

	private var hasBaseline = false
	private var lastGoodRotation = Quaternion.IDENTITY
	private var fallbackRotation = Quaternion.IDENTITY
	private var lastSampleRotation = Quaternion.IDENTITY
	private var latestAdjustedSample = Quaternion.IDENTITY
	private var stableSince = 0L
	private var blendStartedAt = 0L
	private var resumedAt = 0L
	private var heldSince = 0L
	private var reminded = false
	private var nextSnapshotAt = 0L
	private var baselineIntervalMs = 20f
	private var snapshotCapturedAt = 0L
	private var snapshotHardwareId: String? = null
	private var snapshotPosition: TrackerPosition? = null
	private var snapshotMounting = Quaternion.IDENTITY
	private val anchorSnapshots = LinkedHashMap<Tracker, AnchorSnapshot>()

	val activeForSkeleton: Boolean
		get() = state != TrackerRecoveryState.NONE

	private fun enabled(): Boolean = VRServer.instanceInitialized &&
		VRServer.instance.configManager.vrConfig.resetsConfig.deadTrackerRecoveryEnabled &&
		tracker.isImu() &&
		tracker.trackerPosition != null &&
		!tracker.isHmd &&
		!tracker.isComputed

	/** True when this handler checks the tracker after a dropout, so the dropout itself needs no reset. */
	fun handlesDropouts(): Boolean = enabled()

	@Synchronized
	fun onRotationSample(rotation: Quaternion, gapMs: Long, now: Long): Boolean {
		if (!enabled()) {
			cancel(force = true)
			return false
		}
		if (state == TrackerRecoveryState.NEEDS_RESET && !awaitingReferences()) return true

		if (!isFinite(rotation)) {
			requireFullReset(TrackerRecoveryReason.INVALID_ROTATION)
			return true
		}
		latestAdjustedSample = rotation

		if (!hasBaseline) {
			hasBaseline = true
			lastGoodRotation = rotation
			fallbackRotation = rotation
			lastSampleRotation = rotation
			return false
		}

		if (state == TrackerRecoveryState.BRIDGING_GAP && gapMs < COMPENSATE_AFTER_MS) {
			fallbackRotation = fallbackRotation.interpR(rotation, 0.5f)
			startBlend(now, 0.85f)
			lastSampleRotation = rotation
			return true
		}

		if (state == TrackerRecoveryState.COMPENSATING || state == TrackerRecoveryState.NEEDS_RESET || gapMs >= COMPENSATE_AFTER_MS) {
			if (!configurationStillMatchesSnapshot()) {
				requireFullReset(TrackerRecoveryReason.ROLE_OR_MOUNTING_CHANGED)
				return true
			}
			if (resumedAt == 0L || gapMs >= COMPENSATE_AFTER_MS) resumedAt = now
			val liveCandidates = liveAnchorCandidates()
			val failure = referenceFailure(liveCandidates)
			if (failure != null) {
				// Missing references are usually transient (a shared Wi-Fi drop
				// puts every anchor into recovery at once), so keep re-evaluating
				// instead of latching on the first returning sample.
				lastSampleRotation = rotation
				if (state == TrackerRecoveryState.NEEDS_RESET) return true
				if (now - resumedAt < REFERENCE_WAIT_MS) {
					state = TrackerRecoveryState.COMPENSATING
					reason = failure
				} else if (yawIsContinuous(liveCandidates, rotation)) {
					resumeLive(now)
				} else {
					requireFullReset(failure, now)
				}
				return true
			}
			// Trusted references are back, so the reset request no longer applies.
			if (state == TrackerRecoveryState.NEEDS_RESET) tracker.needReset = false
			state = TrackerRecoveryState.WAITING_FOR_STILLNESS
			reason = TrackerRecoveryReason.TRACKER_MOVING
			progress = 0f
			confidence = 0f
			stableSince = now
		}

		if (state == TrackerRecoveryState.WAITING_FOR_STILLNESS) {
			val sampleAngle = angleBetween(lastSampleRotation, rotation)
			val cadenceLimit = max(MAX_SAMPLE_GAP_MS.toFloat(), baselineIntervalMs * 2f).toLong()
			val moving = gapMs > cadenceLimit || sampleAngle > MAX_STILL_ANGLE_RAD
			if (moving && now - resumedAt >= STILLNESS_WAIT_MS && yawIsContinuous(liveAnchorCandidates(), rotation)) {
				// The wearer never stood still, but the returning yaw already
				// agrees with the references, so there is nothing to realign.
				resumeLive(now)
				lastSampleRotation = rotation
				return true
			}
			if (gapMs > cadenceLimit) {
				stableSince = now
				reason = TrackerRecoveryReason.POOR_PACKET_RATE
			} else if (sampleAngle > MAX_STILL_ANGLE_RAD) {
				stableSince = now
				reason = TrackerRecoveryReason.TRACKER_MOVING
			} else {
				reason = TrackerRecoveryReason.NONE
				progress = ((now - stableSince).toFloat() / STILL_TIME_MS).coerceIn(0f, 1f)
				if (now - stableSince >= STILL_TIME_MS) state = TrackerRecoveryState.VALIDATING
			}
		}

		if (state == TrackerRecoveryState.NONE && gapMs in 1..<1000) {
			baselineIntervalMs = baselineIntervalMs * 0.95f + gapMs * 0.05f
			lastGoodRotation = rotation
		}
		lastSampleRotation = rotation
		return state != TrackerRecoveryState.NONE
	}

	@Synchronized
	fun tick(now: Long, sampleAgeMs: Long) {
		if (!enabled()) {
			cancel(force = true)
			return
		}

		when (state) {
			TrackerRecoveryState.NONE -> {
				if (hasBaseline && sampleAgeMs >= BRIDGE_AFTER_MS) {
					beginGap(now)
				} else if (hasBaseline && now >= nextSnapshotAt) {
					captureSnapshot(now)
				}
			}

			TrackerRecoveryState.BRIDGING_GAP -> {
				updateFallbackFromAnchor()
				progress = ((sampleAgeMs - BRIDGE_AFTER_MS).toFloat() / (COMPENSATE_AFTER_MS - BRIDGE_AFTER_MS)).coerceIn(0f, 1f)
				if (sampleAgeMs >= COMPENSATE_AFTER_MS) {
					state = TrackerRecoveryState.COMPENSATING
					reason = TrackerRecoveryReason.TRACKER_OFFLINE
					progress = 1f
					LogManager.warning("[TrackerRecovery] Compensating ${tracker.displayName} after ${sampleAgeMs}ms without rotation data")
				}
			}

			TrackerRecoveryState.COMPENSATING,
			TrackerRecoveryState.WAITING_FOR_STILLNESS,
			TrackerRecoveryState.VALIDATING,
			-> {
				updateFallbackFromAnchor()
				// A tracker that is perfectly still sends no further rotation,
				// so stillness also has to complete without a new sample.
				if (state == TrackerRecoveryState.WAITING_FOR_STILLNESS &&
					sampleAgeMs <= MAX_SAMPLE_GAP_MS &&
					now - stableSince >= STILL_TIME_MS
				) {
					state = TrackerRecoveryState.VALIDATING
				}
				if (state == TrackerRecoveryState.VALIDATING) validateAndApply(now)
			}

			TrackerRecoveryState.NEEDS_RESET -> {
				if (!reminded && now - heldSince >= REMINDER_AFTER_MS) remind()
			}

			TrackerRecoveryState.BLENDING -> {
				progress = ((now - blendStartedAt).toFloat() / BLEND_TIME_MS).coerceIn(0f, 1f)
				if (progress >= 1f) {
					state = TrackerRecoveryState.NONE
					reason = TrackerRecoveryReason.NONE
					tracker.status = TrackerStatus.OK
					captureSnapshot(now)
					LogManager.info("[TrackerRecovery] ${tracker.displayName} recovery blend completed")
				}
			}
		}
	}

	@Synchronized
	fun applyTo(rotation: Quaternion): Quaternion = when (state) {
		TrackerRecoveryState.NONE -> rotation
		TrackerRecoveryState.BLENDING -> fallbackRotation.interpR(rotation, progress)
		else -> fallbackRotation
	}

	@Synchronized
	fun cancel(force: Boolean = false) {
		if (state == TrackerRecoveryState.NEEDS_RESET && !force) return
		val wasActive = state != TrackerRecoveryState.NONE
		state = TrackerRecoveryState.NONE
		reason = TrackerRecoveryReason.NONE
		progress = 0f
		confidence = 0f
		stableSince = 0L
		resumedAt = 0L
		anchorSnapshots.clear()
		if (wasActive && tracker.status == TrackerStatus.BUSY) tracker.status = TrackerStatus.OK
	}

	private fun beginGap(now: Long) {
		captureSnapshot(now)
		fallbackRotation = lastGoodRotation
		resumedAt = 0L
		state = TrackerRecoveryState.BRIDGING_GAP
		reason = TrackerRecoveryReason.TRACKER_OFFLINE
		progress = 0f
		confidence = 0.25f
	}

	private fun captureSnapshot(now: Long) {
		if (!VRServer.instanceInitialized) return
		lastGoodRotation = tracker.getRotationBase()
		fallbackRotation = lastGoodRotation
		snapshotHardwareId = tracker.device?.hardwareIdentifier
		snapshotPosition = tracker.trackerPosition
		snapshotMounting = tracker.resetsHandler.mountingOrientation
		snapshotCapturedAt = now
		anchorSnapshots.clear()
		val trackerYaw = yaw(lastGoodRotation)
		val anchors = candidateAnchors()
		for (anchor in anchors) {
			anchorSnapshots[anchor] = AnchorSnapshot(
				anchor,
				wrapAngle(trackerYaw - yaw(anchor.getRotation())),
				anchorWeight(anchor),
			)
		}
		nextSnapshotAt = now + SNAPSHOT_INTERVAL_MS
	}

	private fun candidateAnchors(): List<Tracker> {
		val position = tracker.trackerPosition
		val preferred = preferredAnchorPositions(position)
		return VRServer.instance.allTrackers
			.asSequence()
			.filter { it !== tracker && !it.isInternal && it.hasRotation && it.status.sendData && !it.recovery.activeForSkeleton && it.trackerPosition in preferred }
			.sortedWith(compareByDescending<Tracker> { anchorWeight(it) }.thenBy { preferred.indexOf(it.trackerPosition) })
			.take(MAX_ANCHORS)
			.toList()
	}

	private fun preferredAnchorPositions(position: TrackerPosition?): List<TrackerPosition> = when (position) {
		TrackerPosition.CHEST -> listOf(TrackerPosition.HIP, TrackerPosition.WAIST, TrackerPosition.UPPER_CHEST, TrackerPosition.HEAD, TrackerPosition.LEFT_UPPER_LEG, TrackerPosition.RIGHT_UPPER_LEG)
		TrackerPosition.UPPER_CHEST -> listOf(TrackerPosition.CHEST, TrackerPosition.HIP, TrackerPosition.WAIST, TrackerPosition.HEAD, TrackerPosition.LEFT_UPPER_LEG, TrackerPosition.RIGHT_UPPER_LEG)
		TrackerPosition.WAIST -> listOf(TrackerPosition.HIP, TrackerPosition.CHEST, TrackerPosition.UPPER_CHEST, TrackerPosition.HEAD, TrackerPosition.LEFT_UPPER_LEG, TrackerPosition.RIGHT_UPPER_LEG)
		TrackerPosition.HIP -> listOf(TrackerPosition.CHEST, TrackerPosition.WAIST, TrackerPosition.UPPER_CHEST, TrackerPosition.HEAD, TrackerPosition.LEFT_UPPER_LEG, TrackerPosition.RIGHT_UPPER_LEG)
		TrackerPosition.LEFT_FOOT -> listOf(TrackerPosition.LEFT_LOWER_LEG, TrackerPosition.LEFT_UPPER_LEG, TrackerPosition.HIP, TrackerPosition.HEAD)
		TrackerPosition.RIGHT_FOOT -> listOf(TrackerPosition.RIGHT_LOWER_LEG, TrackerPosition.RIGHT_UPPER_LEG, TrackerPosition.HIP, TrackerPosition.HEAD)
		TrackerPosition.LEFT_LOWER_LEG -> listOf(TrackerPosition.LEFT_UPPER_LEG, TrackerPosition.LEFT_FOOT, TrackerPosition.HIP, TrackerPosition.HEAD)
		TrackerPosition.RIGHT_LOWER_LEG -> listOf(TrackerPosition.RIGHT_UPPER_LEG, TrackerPosition.RIGHT_FOOT, TrackerPosition.HIP, TrackerPosition.HEAD)
		TrackerPosition.LEFT_UPPER_LEG -> listOf(TrackerPosition.HIP, TrackerPosition.WAIST, TrackerPosition.LEFT_LOWER_LEG, TrackerPosition.HEAD)
		TrackerPosition.RIGHT_UPPER_LEG -> listOf(TrackerPosition.HIP, TrackerPosition.WAIST, TrackerPosition.RIGHT_LOWER_LEG, TrackerPosition.HEAD)
		TrackerPosition.LEFT_HAND, TrackerPosition.LEFT_LOWER_ARM -> listOf(TrackerPosition.LEFT_UPPER_ARM, TrackerPosition.UPPER_CHEST, TrackerPosition.CHEST, TrackerPosition.HEAD)
		TrackerPosition.RIGHT_HAND, TrackerPosition.RIGHT_LOWER_ARM -> listOf(TrackerPosition.RIGHT_UPPER_ARM, TrackerPosition.UPPER_CHEST, TrackerPosition.CHEST, TrackerPosition.HEAD)
		TrackerPosition.LEFT_UPPER_ARM, TrackerPosition.LEFT_SHOULDER -> listOf(TrackerPosition.UPPER_CHEST, TrackerPosition.CHEST, TrackerPosition.LEFT_LOWER_ARM, TrackerPosition.HEAD)
		TrackerPosition.RIGHT_UPPER_ARM, TrackerPosition.RIGHT_SHOULDER -> listOf(TrackerPosition.UPPER_CHEST, TrackerPosition.CHEST, TrackerPosition.RIGHT_LOWER_ARM, TrackerPosition.HEAD)
		else -> listOf(TrackerPosition.HEAD, TrackerPosition.UPPER_CHEST, TrackerPosition.CHEST, TrackerPosition.WAIST, TrackerPosition.HIP)
	}

	private fun updateFallbackFromAnchor() {
		val desiredYaw = trustedYaw(liveAnchorCandidates())?.first ?: return
		val delta = wrapAngle(desiredYaw - yaw(lastGoodRotation))
		fallbackRotation = Quaternion.rotationAroundYAxis(delta) * lastGoodRotation
	}

	private fun validateAndApply(now: Long) {
		if (!configurationStillMatchesSnapshot()) {
			requireFullReset(TrackerRecoveryReason.ROLE_OR_MOUNTING_CHANGED)
			return
		}

		val liveCandidates = liveAnchorCandidates()
		val trusted = trustedYaw(liveCandidates)
		if (trusted == null) {
			// References dropped out while waiting; the next sample re-evaluates.
			state = TrackerRecoveryState.COMPENSATING
			reason = referenceFailure(liveCandidates) ?: TrackerRecoveryReason.NO_REFERENCE
			progress = 0f
			return
		}
		val (desiredYaw, referenceConfidence) = trusted

		// The most recent adjusted sample is newer than the filter output. Using
		// it avoids validating a reconnect against the previous server frame.
		val currentRotation = latestAdjustedSample
		if (!isFinite(currentRotation)) {
			requireFullReset(TrackerRecoveryReason.INVALID_ROTATION)
			return
		}
		val correction = wrapAngle(desiredYaw - yaw(currentRotation))
		if (abs(correction) <= MAX_LEARNABLE_CORRECTION_RAD) {
			val preAdaptiveRotation = tracker.resetsHandler
				.getReferenceAdjustedRotationBeforeDrift(tracker.getRawRotation())
			val observedDrift = wrapAngle(yaw(preAdaptiveRotation) - desiredYaw)
			tracker.resetsHandler.learnDriftObservation(observedDrift, now - snapshotCapturedAt, referenceConfidence)
		}
		// The sample already includes the previous fix, so compose with it.
		tracker.resetsHandler.recoveryYawFix = Quaternion.rotationAroundYAxis(correction) * tracker.resetsHandler.recoveryYawFix
		tracker.needReset = false
		tracker.resetFilteringQuats(fallbackRotation)
		startBlend(now, referenceConfidence)
		LogManager.info("[TrackerRecovery] ${tracker.displayName} aligned with ${liveCandidates.size} references, yaw=${Math.toDegrees(correction.toDouble()).toInt()}deg, confidence=${"%.2f".format(referenceConfidence)}")
		VRServer.instance.vrcOSCHandler.sendTrackerRecoveryNotification(tracker, true)
	}

	/**
	 * Resumes the tracker's own data without a yaw correction. Only used when
	 * the returning yaw is continuous with what the body was doing, which rules
	 * out a reboot having changed the tracker's yaw reference.
	 */
	private fun resumeLive(now: Long) {
		startBlend(now, SELF_RESUME_CONFIDENCE)
		LogManager.info("[TrackerRecovery] ${tracker.displayName} resumed its own rotation without references")
		VRServer.instance.vrcOSCHandler.sendTrackerRecoveryNotification(tracker, true)
	}

	private fun yawIsContinuous(candidates: List<Pair<AnchorSnapshot, Float>>, rotation: Quaternion): Boolean {
		val expectedYaw = desiredYaw(candidates) ?: yaw(lastGoodRotation)
		return abs(wrapAngle(expectedYaw - yaw(rotation))) <= MAX_CONTINUITY_YAW_RAD
	}

	private fun referenceFailure(candidates: List<Pair<AnchorSnapshot, Float>>): TrackerRecoveryReason? = when {
		!hasEnoughLiveReferences(candidates) -> TrackerRecoveryReason.NO_REFERENCE
		trustedYaw(candidates) == null -> TrackerRecoveryReason.REFERENCE_DISAGREEMENT
		else -> null
	}

	/** A reference failure is re-evaluated; other failures need a Full Reset. */
	private fun awaitingReferences(): Boolean = state == TrackerRecoveryState.NEEDS_RESET &&
		(reason == TrackerRecoveryReason.NO_REFERENCE || reason == TrackerRecoveryReason.REFERENCE_DISAGREEMENT)

	private fun startBlend(now: Long, recoveryConfidence: Float) {
		resumedAt = 0L
		state = TrackerRecoveryState.BLENDING
		reason = TrackerRecoveryReason.NONE
		progress = 0f
		confidence = recoveryConfidence
		blendStartedAt = now
		tracker.status = TrackerStatus.BUSY
	}

	private fun liveAnchorCandidates(): List<Pair<AnchorSnapshot, Float>> = anchorSnapshots.values.mapNotNull { snapshot ->
		if (snapshot.tracker.status.sendData && !snapshot.tracker.recovery.activeForSkeleton) {
			snapshot to wrapAngle(yaw(snapshot.tracker.getRotation()) + snapshot.yawOffset)
		} else {
			null
		}
	}

	private fun hasEnoughLiveReferences(candidates: List<Pair<AnchorSnapshot, Float>>): Boolean {
		if (candidates.size < 2) return false
		val hasHead = candidates.any { it.first.tracker.trackerPosition == TrackerPosition.HEAD }
		val torsoCount = candidates.count { it.first.tracker.trackerPosition in TORSO_POSITIONS }
		return hasHead || torsoCount >= 2
	}

	private fun configurationStillMatchesSnapshot(): Boolean = snapshotHardwareId == tracker.device?.hardwareIdentifier &&
		snapshotPosition == tracker.trackerPosition &&
		snapshotMounting == tracker.resetsHandler.mountingOrientation

	private fun requireFullReset(failure: TrackerRecoveryReason, now: Long = 0L) {
		state = TrackerRecoveryState.NEEDS_RESET
		reason = failure
		progress = 0f
		confidence = 0f
		heldSince = now
		reminded = false
		// Missing or disagreeing references usually come back within seconds (a shared dropout,
		// lying down, standing up). The tracker is held and realigns when they return, so only
		// remind the user if that hasn't happened after a while.
		if (awaitingReferences()) return
		remind()
	}

	private fun remind() {
		reminded = true
		// The reset reminders switch (recoveryChatboxNotifications) also silences the checklist prompt.
		if (!VRServer.instanceInitialized || VRServer.instance.configManager.vrConfig.resetsConfig.recoveryChatboxNotifications) {
			tracker.needReset = true
		}
		if (VRServer.instanceInitialized) {
			LogManager.warning("[TrackerRecovery] ${tracker.displayName} needs reset: $reason")
			VRServer.instance.vrcOSCHandler.sendTrackerRecoveryNotification(tracker, false)
		}
	}

	private fun yaw(rotation: Quaternion): Float = rotation.toEulerAngles(EulerOrder.YZX).y

	private fun wrapAngle(value: Float): Float {
		var result = value
		while (result > PI) result -= (2.0 * PI).toFloat()
		while (result < -PI) result += (2.0 * PI).toFloat()
		return result
	}

	private fun angleBetween(a: Quaternion, b: Quaternion): Float {
		val dot = abs(a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z).coerceIn(0f, 1f)
		return 2f * kotlin.math.acos(dot)
	}

	private fun isFinite(rotation: Quaternion): Boolean = rotation.w.isFinite() && rotation.x.isFinite() && rotation.y.isFinite() && rotation.z.isFinite()

	private fun anchorWeight(anchor: Tracker): Float = when {
		anchor.trackerPosition in TORSO_POSITIONS -> 3.0f
		anchor.isHmd || anchor.trackerPosition == TrackerPosition.HEAD -> 2.5f
		anchor.trackerPosition?.isThigh() == true -> 1.75f
		else -> 1.0f
	}

	private fun desiredYaw(candidates: List<Pair<AnchorSnapshot, Float>>): Float? {
		if (candidates.isEmpty()) return null
		val totalWeight = candidates.sumOf { it.first.weight.toDouble() }
		if (totalWeight <= 0.0) return null
		val sinSum = candidates.sumOf { kotlin.math.sin(it.second.toDouble()) * it.first.weight }
		val cosSum = candidates.sumOf { kotlin.math.cos(it.second.toDouble()) * it.first.weight }
		return atan2(sinSum, cosSum).toFloat()
	}

	private fun weightedDisagreement(candidates: List<Pair<AnchorSnapshot, Float>>, center: Float): Float {
		var totalWeight = 0.0f
		var weightedError = 0.0f
		for ((snapshot, candidateYaw) in candidates) {
			totalWeight += snapshot.weight
			weightedError += abs(wrapAngle(candidateYaw - center)) * snapshot.weight
		}
		if (totalWeight <= 0.0f) return Float.MAX_VALUE
		return weightedError / totalWeight
	}

	private fun trustedYaw(candidates: List<Pair<AnchorSnapshot, Float>>): Pair<Float, Float>? {
		if (!hasEnoughLiveReferences(candidates)) return null
		val desiredYaw = desiredYaw(candidates) ?: return null
		if (!desiredYaw.isFinite()) return null
		val disagreement = weightedDisagreement(candidates, desiredYaw)
		val confidence = (1f - disagreement / MAX_REFERENCE_DISAGREEMENT_RAD).coerceIn(0f, 1f)
		return if (confidence.isFinite() && confidence >= MIN_REFERENCE_CONFIDENCE) desiredYaw to confidence else null
	}
}
