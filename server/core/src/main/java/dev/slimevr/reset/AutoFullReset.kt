package dev.slimevr.reset

import dev.slimevr.VRServer
import dev.slimevr.tracking.trackers.TrackerStatus
import io.eiren.util.logging.LogManager
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min

/**
 * Does the first full reset by itself: once trackers need a reset and the user stands
 * upright and still with the headset on, it resets them. Only before the first full reset of a server run.
 */
class AutoFullReset(private val server: VRServer) {
	private val detector = StandStillDetector()
	private var fired = false

	fun tick() {
		if (fired || !server.configManager.vrConfig.resetsConfig.autoFullReset) return

		val hmd = server.humanPoseManager.skeleton.headTracker
		val imus = server.allTrackers.filter {
			it.trackerPosition != null && !it.isInternal && it.isImu() && it.allowReset &&
				it.status != TrackerStatus.DISCONNECTED
		}
		// Any full reset (ours or the user's) clears needReset; after that, a tracker reconnecting
		// mid-game must not trigger a reset the user didn't ask for, so stop for this run.
		if (imus.isNotEmpty() && imus.all { it.status == TrackerStatus.OK && !it.needReset }) {
			fired = true
			return
		}

		val ready = hmd != null && hmd.status == TrackerStatus.OK && imus.isNotEmpty() &&
			imus.any { it.needReset } && imus.all { it.status == TrackerStatus.OK }
		if (!ready) {
			detector.clear()
			return
		}

		val fire = detector.update(
			System.currentTimeMillis(),
			hmd!!.position,
			hmd.getRotation(),
			imus.map { it.getRawRotation() },
			server.humanPoseManager.userHeightFromConfig,
		)
		if (fire) {
			fired = true
			LogManager.info("[AutoFullReset] Standing still with the headset on, doing the first full reset")
			server.scheduleResetTrackersFull(SOURCE, 0)
		}
	}

	companion object {
		const val SOURCE = "AutoFullReset"
	}
}

/**
 * True once the headset is at standing height and level, and the headset and every tracker
 * have stayed within small limits of where they were for [HOLD_MS].
 */
class StandStillDetector {
	private var startMs = 0L
	private var hmdPos0: Vector3? = null
	private var hmdRot0 = Quaternion.IDENTITY
	private var rots0: List<Quaternion> = emptyList()

	fun clear() {
		hmdPos0 = null
	}

	fun update(nowMs: Long, hmdPos: Vector3, hmdRot: Quaternion, rots: List<Quaternion>, userHeight: Float): Boolean {
		// Standing: headset near standing height (skip the check if no height is set) and not tilted
		val standing = (userHeight < MIN_HEIGHT || hmdPos.y >= userHeight * HEIGHT_RATIO) &&
			hmdRot.sandwich(Vector3.POS_Y).dot(Vector3.POS_Y) >= cos(MAX_TILT)
		if (!standing) {
			clear()
			return false
		}

		val pos0 = hmdPos0
		val still = pos0 != null && rots.size == rots0.size &&
			(hmdPos - pos0).len() <= MAX_HMD_MOVE &&
			angle(hmdRot, hmdRot0) <= MAX_HMD_TURN &&
			rots.indices.all { angle(rots[it], rots0[it]) <= MAX_TRACKER_TURN }
		if (!still) {
			// Moved (or first sample): the hold starts again from here
			startMs = nowMs
			hmdPos0 = hmdPos
			hmdRot0 = hmdRot
			rots0 = rots
			return false
		}
		return nowMs - startMs >= HOLD_MS
	}

	// q and -q are the same rotation, so take the shorter way round
	private fun angle(a: Quaternion, b: Quaternion): Float {
		val r = a.angleToR(b)
		return min(r, (2 * PI).toFloat() - r)
	}

	companion object {
		const val HOLD_MS = 2000L
		const val MIN_HEIGHT = 0.4f
		const val HEIGHT_RATIO = 0.9f
		val MAX_TILT = Math.toRadians(25.0).toFloat()
		const val MAX_HMD_MOVE = 0.05f
		val MAX_HMD_TURN = Math.toRadians(6.0).toFloat()
		val MAX_TRACKER_TURN = Math.toRadians(4.0).toFloat()
	}
}
