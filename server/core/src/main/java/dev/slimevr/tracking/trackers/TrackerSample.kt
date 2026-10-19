package dev.slimevr.tracking.trackers

import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3

/**
 * The complete input snapshot consumed by the VR server thread.
 *
 * [arrivalTimeNanos] is monotonic and describes packet arrival, not wall-clock
 * time. A null acceleration means the rotation packet did not carry acceleration.
 */
data class TrackerSample(
	val rotation: Quaternion,
	val acceleration: Vector3?,
	val arrivalTimeNanos: Long,
)

data class TrackerAccelerationSample(
	val acceleration: Vector3,
	val arrivalTimeNanos: Long,
)
