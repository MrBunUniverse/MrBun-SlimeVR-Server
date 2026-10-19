package dev.slimevr.tracking.processor.stayaligned.trackers

import dev.slimevr.math.Angle
import dev.slimevr.tracking.processor.stayaligned.StayAlignedDefaults
import dev.slimevr.tracking.trackers.Tracker
import io.github.axisangles.ktmath.Quaternion

class StayAlignedTrackerState(
	val tracker: Tracker,
) {
	// Whether to hide the yaw correction
	var hideCorrection = false

	// Detects whether the tracker is at rest
	val restDetector = StayAlignedDefaults.makeRestDetector()

	// Rotation of the tracker when it was locked
	var lockedRotation: Quaternion? = null

	// Yaw correction to apply to tracker rotation
	var yawCorrection = Angle.ZERO

	// Alignment error that yaw correction attempts to minimize
	var yawErrors = YawErrors()

	// Kinetic angular velocity in rad/sec, smoothed for motion gating
	var angularVelocity: Float = 0.0f
		private set

	private var lastDataRotation = Quaternion.IDENTITY
	private var lastDataTimeNanos = 0L

	fun onNewData(rawRotation: Quaternion, timestampNanos: Long = System.nanoTime()) {
		if (lastDataTimeNanos > 0L && timestampNanos > lastDataTimeNanos) {
			val dt = ((timestampNanos - lastDataTimeNanos) / 1_000_000_000.0f).coerceIn(0.001f, 0.5f)
			val angleDelta = lastDataRotation.angleToR(rawRotation)
			val instantVel = angleDelta / dt
			// Exponential moving average using packet time, not server frame time.
			angularVelocity = angularVelocity * 0.7f + instantVel * 0.3f
		}
		lastDataTimeNanos = timestampNanos
		lastDataRotation = rawRotation
	}

	fun update() {
		restDetector.update(tracker.getRawRotation())
		if (restDetector.state == RestDetector.State.AT_REST) {
			if (lockedRotation == null) {
				lockedRotation = tracker.getAdjustedRotationForceStayAligned()
			}
		} else {
			lockedRotation = null
		}
	}

	fun reset() {
		restDetector.reset()
		lockedRotation = null
		yawCorrection = Angle.ZERO
		yawErrors = YawErrors()
	}
}
