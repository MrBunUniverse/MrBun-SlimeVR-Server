package dev.slimevr.tracking.trackers

import dev.slimevr.VRServer
import dev.slimevr.config.TrackerConfig
import dev.slimevr.tracking.processor.stayaligned.trackers.StayAlignedTrackerState
import dev.slimevr.tracking.trackers.TrackerPosition.Companion.getByDesignation
import dev.slimevr.tracking.trackers.udp.IMUType
import dev.slimevr.tracking.trackers.udp.MagnetometerStatus
import dev.slimevr.tracking.trackers.udp.TrackerDataType
import dev.slimevr.util.InterpolationHandler
import io.eiren.util.BufferedTimer
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import java.util.concurrent.atomic.AtomicReference
import kotlin.properties.Delegates
import kotlin.time.Duration.Companion.microseconds
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.DurationUnit
import kotlin.time.TimeSource

private const val MAX_ACCELERATION_AGE_NANOS = 250_000_000L

const val TIMEOUT_MS = 2_000L
const val DISCONNECT_MS = 3_000L + TIMEOUT_MS

/**
 * Generic tracker class for input and output tracker,
 * with flags on instantiation.
 */
class Tracker @JvmOverloads constructor(
	val device: Device?,
	/**
	 * VRServer.nextLocalTrackerId
	 */
	val id: Int,
	/**
	 * unique, for config
	 */
	val name: String,
	/**
	 * default display GUI name
	 */
	val displayName: String = "Tracker #$id",
	trackerPosition: TrackerPosition?,
	/**
	 * It's like the ID, but it should be local to the device if it has one
	 */
	trackerNum: Int? = null,
	val hasPosition: Boolean = false,
	val hasRotation: Boolean = false,
	val hasAcceleration: Boolean = false,
	/**
	 * User can change TrackerPosition, mounting...
	 */
	val userEditable: Boolean = false,
	/**
	 * Is used within SlimeVR (shareable trackers)
	 */
	val isInternal: Boolean = false,
	/**
	 * Has solved position + rotation (Vive trackers)
	 */
	val isComputed: Boolean = false,
	val imuType: IMUType? = null,
	/**
	 * Automatically set the status to DISCONNECTED
	 */
	val usesTimeout: Boolean = false,
	/**
	 * If true, smoothing and prediction may be enabled. If either are enabled, then
	 * rotations will be updated with [tick]. This will not have any effect if
	 * [trackRotDirection] is set to false.
	 */
	val allowFiltering: Boolean = false,

	/**
	 * If true, the tracker can be reset
	 */
	val allowReset: Boolean = false,
	/**
	 * If true, the tracker can do mounting calibration
	 */
	val allowMounting: Boolean = false,

	/**
	 * If true, the tracker will send Derived Velocity.
	 */
	var allowVelocity: Boolean = false,

	val isHmd: Boolean = false,

	/**
	 * If true, the tracker need the user to perform a reset
	 */
	var needReset: Boolean = false,

	/**
	 * Whether to track the direction of the tracker's rotation
	 * (positive vs negative rotation). This needs to be disabled for AutoBone and
	 * unit tests, where the rotation is absolute and not temporal.
	 *
	 * If true, the output rotation will only be updated after [dataTick]. If false, the
	 * output rotation will be updated immediately with the raw rotation.
	 */
	val trackRotDirection: Boolean = true,
	magStatus: MagnetometerStatus = MagnetometerStatus.NOT_SUPPORTED,
	/**
	 * Rotation by default.
	 * NOT the same as hasRotation (other data types emulate rotation)
	 */
	val trackerDataType: TrackerDataType = TrackerDataType.ROTATION,

	/**
	 * Set status when tracker is sleeping
	 */
	val usesSleep: Boolean = false,
) {
	private val timer = BufferedTimer(1f)
	private var timeAtLastUpdate: Long = monotonicMillis()
	private var timeAtLastRotationUpdate: Long = timeAtLastUpdate
	private var timeAtLastRotationTimestampNanos: Long = 0L
	private var timeScheduledSleep: Long = Long.MAX_VALUE
	private var _rotation = Quaternion.IDENTITY
	private val pendingSample = AtomicReference<TrackerSample?>(null)
	private val pendingAcceleration = AtomicReference<TrackerAccelerationSample?>(null)
	private var lastAccelerationCaptureTimeNanos = 0L

	@Volatile
	var mailboxOverruns: Long = 0
		private set

	// IMU: +z forward, +x left, +y up
	// SlimeVR: +z backward, +x right, +y up
	private var _acceleration = Vector3.NULL
	private var _velocity = Vector3.NULL
	private var _magVector = Vector3.NULL
	var configFallback: TrackerConfig? = null

	/**
	 * Velocity state server-side differentiation based on sent poses
	 */
	private data class VelocityState(
		var prevMark: TimeSource.Monotonic.ValueTimeMark? = null,
		var prevPos: Vector3 = Vector3(0f, 0f, 0f),
	)

	private val velocityState = VelocityState()

	var position = Vector3.NULL
	val resetsHandler: TrackerResetsHandler = TrackerResetsHandler(this)
	val recovery: TrackerRecoveryHandler = TrackerRecoveryHandler(this)
	val filteringHandler: TrackerFilteringHandler = TrackerFilteringHandler()
	val trackerFlexHandler: TrackerFlexHandler = TrackerFlexHandler(this)
	val filterHealth: FilterHealth
		get() = filteringHandler.getHealth()
	val adaptiveDriftStatus: AdaptiveDriftStatus
		get() = AdaptiveDriftCompensation.statusFor(this)
	var batteryVoltage: Float? = null
	var batteryLevel: Float? = null
	var batteryRemainingRuntime: Long? = null
	var ping: Int? = null
	var signalStrength: Int? = null
	var temperature: Float? = null
	var button: Int? = null
	var packetsReceived: Int? = null
	var packetsLost: Int? = null
	var packetLoss: Float? = null
	var customName: String? = null

	/**
	 * Please don't use this and instead set it via [Device.setMag]
	 */
	var magStatus: MagnetometerStatus = magStatus
		internal set

	/**
	 * Watch the rest calibration status
	 */
	var hasCompletedRestCalibration: Boolean? = null

	/**
	 * If the tracker has gotten disconnected after it was initialized first time
	 */
	var status: TrackerStatus by Delegates.observable(TrackerStatus.DISCONNECTED) { _, old, new ->
		if (old == new) return@observable

		// A dropout alone doesn't mean the tracker lost its orientation. When recovery is on, it
		// checks the tracker once it's back and asks for a reset only if it can't line it up.
		if (allowReset && !old.reset && new.reset && !needReset && !recovery.handlesDropouts()) {
			needReset = true
		}

		if (!isInternal && VRServer.instanceInitialized) {
			// If the status of a non-internal tracker has changed, inform
			// the VRServer to recreate the skeleton, as it may need to
			// assign or un-assign the tracker to a body part
			VRServer.instance.updateSkeletonModel()
			VRServer.instance.refreshTrackersDriftCompensationEnabled()
			VRServer.instance.trackerStatusChanged(this, old, new)
		}
	}

	var trackerPosition: TrackerPosition? by Delegates.observable(trackerPosition) { _, old, new ->
		if (old == new) return@observable

		if (allowReset && !needReset) {
			needReset = true
		}

		if (!isInternal) {
			// Set default mounting orientation for that body part
			new?.let { resetsHandler.mountingOrientation = it.defaultMounting() }
		}
		recovery.cancel()
	}

	// Computed value to simplify availability checks
	val hasAdjustedRotation = hasRotation && (allowFiltering || allowReset)

	/**
	 * It's like the ID, but it should be local to the device if it has one
	 */
	val trackerNum: Int = trackerNum ?: id

	val stayAligned = StayAlignedTrackerState(this)
	val yawResetSmoothing = InterpolationHandler()

	init {
		// IMPORTANT: Look here for the required states of inputs
		require(!allowReset || (hasRotation && allowReset)) {
			"If ${::allowReset.name} is true, then ${::hasRotation.name} must also be true"
		}
		require(!allowMounting || (allowReset && allowMounting)) {
			"If ${::allowMounting.name} is true, then ${::allowReset.name} must also be true"
		}
		require(!isHmd || (hasPosition && isHmd)) {
			"If ${::isHmd.name} is true, then ${::hasPosition.name} must also be true"
		}
// 		require(device != null && _trackerNum == null) {
// 			"If ${::device.name} exists, then ${::trackerNum.name} must not be null"
// 		}
	}

	/**
	 * Reads/loads from the given config
	 */
	fun readConfig(config: TrackerConfig) {
		config.customName?.let {
			customName = it
		}
		config.designation?.let { designation ->
			getByDesignation(designation)?.let { trackerPosition = it }
		} ?: run { trackerPosition = null }
		if (allowMounting) {
			// Load manual mounting
			config.mountingOrientation?.let { resetsHandler.mountingOrientation = it.toValue() }
		}
		if (this.isImu() && config.allowDriftCompensation == null) {
			// If value didn't exist, default to true and save
			val isBno = config.imuProfileOverride?.equals("bno085", ignoreCase = true) == true ||
				(this.imuType?.name?.contains("BNO") == true && (config.imuProfileOverride.isNullOrEmpty() || config.imuProfileOverride.equals("auto", ignoreCase = true)))
			resetsHandler.allowDriftCompensation = !isBno
			if (VRServer.instanceInitialized) {
				VRServer.instance.configManager.vrConfig.getTracker(this).allowDriftCompensation = !isBno
				VRServer.instance.configManager.saveConfig()
			}
		} else {
			config.allowDriftCompensation?.let {
				resetsHandler.allowDriftCompensation = it
			}
		}
		if (this.isImu()) {
			resetsHandler.readAdaptiveProfile(config)
		}
	}

	/**
	 * Writes/saves to the given config
	 */
	fun writeConfig(config: TrackerConfig) {
		trackerPosition?.let { config.designation = it.designation } ?: run { config.designation = null }
		customName?.let { config.customName = it }
		if (allowMounting) {
			// Save manual mounting
			config.mountingOrientation = resetsHandler.mountingOrientation.toObject()
		}
		if (this.isImu()) {
			config.allowDriftCompensation = resetsHandler.allowDriftCompensation
			resetsHandler.writeAdaptiveProfile(config)
		}
	}

	/**
	 * Loads the mounting reset quaternion from disk
	 */
	fun saveMountingResetOrientation(config: TrackerConfig) {
		// Load automatic mounting
		config.mountingResetOrientation?.let {
			resetsHandler.trySetMountingReset(it.toValue())
		}
	}

	/**
	 * Saves the mounting reset quaternion to disk
	 */
	fun saveMountingResetOrientation(quat: Quaternion?) {
		if (VRServer.instanceInitialized) {
			val configManager = VRServer.instance.configManager
			configManager.vrConfig.getTracker(this).mountingResetOrientation = quat?.toObject()
			configManager.saveConfig()
		}
	}

	/**
	 * Synchronized with the VRServer's 1000hz while loop
	 */
	fun tick(deltaTime: Float) {
		consumePendingSample()
		val now = monotonicMillis()
		val connectionAgeMs = now - timeAtLastUpdate
		val sampleAgeMs = now - timeAtLastRotationUpdate
		// Firmware only sends rotation while it changes, so a motionless tracker
		// is silent on rotation but still answers pings. Liveness and recovery
		// must follow the connection, not the age of the last rotation.
		if (usesTimeout) {
			if (connectionAgeMs > DISCONNECT_MS) {
				status = TrackerStatus.DISCONNECTED
			} else if (connectionAgeMs > TIMEOUT_MS) {
				status = TrackerStatus.TIMED_OUT
			}
		}

		if (usesSleep && status != TrackerStatus.DISCONNECTED) {
			if (System.currentTimeMillis() > timeScheduledSleep) {
				status = TrackerStatus.TIMED_OUT
			}
			// Want to also use timeout but without following disconnect
			if (monotonicMillis() - timeAtLastUpdate > TIMEOUT_MS) {
				status = TrackerStatus.TIMED_OUT
			}
		}

		filteringHandler.update(deltaTime, sampleAgeMs)
		yawResetSmoothing.tick(deltaTime)
		stayAligned.update()
		recovery.tick(now, connectionAgeMs)
	}

	/**
	 * Tells the tracker that it received new data
	 * NOTE: Use only when rotation is received
	 */
	fun dataTick(timestampNanos: Long = System.nanoTime()) {
		// Existing synthetic, OSC, HID, and computed trackers call dataTick
		// synchronously. Network transports use ingestSample so their callbacks
		// never mutate the filtering/recovery path concurrently with the server.
		pendingSample.set(null)
		pendingAcceleration.getAndSet(null)?.let(::applyAccelerationSample)
		processRotationSample(timestampNanos)
	}

	/**
	 * Publishes the latest packet to a bounded mailbox. Intermediate packets may
	 * be replaced when the server is busy; consuming the newest sample avoids a
	 * stale backlog and keeps the skeleton responsive after Wi-Fi bursts.
	 */
	fun ingestSample(
		rotation: Quaternion,
		acceleration: Vector3? = null,
		arrivalTimeNanos: Long = System.nanoTime(),
	) {
		val sample = TrackerSample(
			rotation = rotation,
			acceleration = acceleration,
			arrivalTimeNanos = arrivalTimeNanos,
		)
		if (pendingSample.getAndSet(sample) != null) mailboxOverruns++
	}

	private fun consumePendingSample() {
		val sample = pendingSample.getAndSet(null)
		val newerAcceleration = pendingAcceleration.getAndSet(null)
		if (sample != null) {
			_rotation = sample.rotation
			sample.acceleration?.let {
				applyAccelerationSample(TrackerAccelerationSample(it, sample.arrivalTimeNanos), allowEqualTimestamp = true)
			}
			newerAcceleration?.let(::applyAccelerationSample)
			processRotationSample(sample.arrivalTimeNanos)
		} else {
			newerAcceleration?.let(::applyAccelerationSample)
		}
	}

	private fun applyAccelerationSample(sample: TrackerAccelerationSample, allowEqualTimestamp: Boolean = false) {
		if (sample.arrivalTimeNanos < lastAccelerationCaptureTimeNanos ||
			(!allowEqualTimestamp && sample.arrivalTimeNanos == lastAccelerationCaptureTimeNanos)
		) {
			return
		}
		_acceleration = sample.acceleration
		lastAccelerationCaptureTimeNanos = sample.arrivalTimeNanos
	}

	private fun processRotationSample(sampleTimeNanos: Long) {
		val now = monotonicMillis()
		val gapMs = if (timeAtLastRotationTimestampNanos > 0L && sampleTimeNanos > timeAtLastRotationTimestampNanos) {
			((sampleTimeNanos - timeAtLastRotationTimestampNanos) / 1_000_000L).coerceAtLeast(0L)
		} else {
			now - timeAtLastRotationUpdate
		}
		// How long the device itself was silent before this sample. A tracker
		// that kept answering pings while motionless was never offline.
		val silenceMs = (sampleTimeNanos / 1_000_000L - timeAtLastUpdate).coerceIn(0L, gapMs)
		timer.update()
		timeAtLastUpdate = maxOf(timeAtLastUpdate, sampleTimeNanos / 1_000_000L)
		timeAtLastRotationUpdate = sampleTimeNanos / 1_000_000L
		timeAtLastRotationTimestampNanos = sampleTimeNanos
		stayAligned.onNewData(_rotation, sampleTimeNanos)
		val adjustedSample = getAdjustedRotation()
		if (trackRotDirection) {
			filteringHandler.dataTick(adjustedSample, sampleTimeNanos)
		}
		val recovering = recovery.onRotationSample(adjustedSample, silenceMs, now)
		if (recovering) {
			status = TrackerStatus.BUSY
		} else if (status == TrackerStatus.TIMED_OUT || status == TrackerStatus.DISCONNECTED) {
			status = TrackerStatus.OK
		}
	}

	/**
	 * A way to delay the timeout of the tracker
	 */
	fun heartbeat() {
		timeAtLastUpdate = monotonicMillis()
	}

	private fun monotonicMillis(): Long = System.nanoTime() / 1_000_000L

	/**
	 * Gets the adjusted tracker rotation after the resetsHandler's corrections
	 * (reset, mounting and drift compensation).
	 * This is the rotation that is applied on the SlimeVR skeleton bones.
	 * Warning: This performs several Quaternion multiplications, so calling
	 * it too much should be avoided for performance reasons.
	 */
	private fun getAdjustedRotation(): Quaternion {
		var rot = _rotation

		// Reset/mounting/adaptive drift comes before transient Stay Aligned.
		rot = if (allowReset && !(isComputed && isInternal) && trackerDataType == TrackerDataType.ROTATION) {
			// Adjust to reset, mounting and drift compensation
			resetsHandler.getReferenceAdjustedDriftRotationFrom(rot)
		} else {
			rot
		}
		return if (!stayAligned.hideCorrection) {
			Quaternion.rotationAroundYAxis(stayAligned.yawCorrection.toRad()) * rot
		} else {
			rot
		}
	}

	/**
	 * Same as getAdjustedRotation except that Stay Aligned correction is always
	 * applied. This allows Stay Aligned to do gradient descent with the tracker's
	 * rotation.
	 */
	fun getAdjustedRotationForceStayAligned(): Quaternion {
		var rot = _rotation

		// Reset/mounting/adaptive drift comes before transient Stay Aligned.
		rot = if (allowReset && !(isComputed && isInternal) && trackerDataType == TrackerDataType.ROTATION) {
			// Adjust to reset, mounting and drift compensation
			resetsHandler.getReferenceAdjustedDriftRotationFrom(rot)
		} else {
			rot
		}
		return Quaternion.rotationAroundYAxis(stayAligned.yawCorrection.toRad()) * rot
	}

	/**
	 * If derived velocity is enabled, updates the derived velocity of the tracker,
	 * calculating it based on the position displacement since the last update,
	 * applying a sanity check on the time delta to filter out noise and ensure data stability.
	 */
	fun updateDerivedVelocity() {
		if (!allowVelocity || !hasPosition) {
			velocityState.prevMark = null
			_velocity = Vector3.NULL
			return
		}

		val pos = position
		val now = TimeSource.Monotonic.markNow()

		val prevMark = velocityState.prevMark
		if (prevMark != null) {
			val dt = now - prevMark
			if (dt in 100.microseconds..250.milliseconds) {
				val dtSeconds = dt.toDouble(DurationUnit.SECONDS)
				_velocity = Vector3(
					((pos.x - velocityState.prevPos.x) / dtSeconds).toFloat(),
					((pos.y - velocityState.prevPos.y) / dtSeconds).toFloat(),
					((pos.z - velocityState.prevPos.z) / dtSeconds).toFloat(),
				)
			} else {
				_velocity = Vector3.NULL
			}
		}
		velocityState.prevMark = now
		velocityState.prevPos = pos
	}

	/**
	 * Gets the identity-adjusted tracker rotation after the resetsHandler's corrections
	 * (identity reset, drift and identity mounting).
	 * This is used for debugging/visualizing tracker data
	 */
	fun getIdentityAdjustedRotation(): Quaternion {
		var rot = _rotation

		// Reset if needed or is a computed tracker besides head
		rot = if (allowReset && !(isComputed && trackerPosition != TrackerPosition.HEAD) && trackerDataType == TrackerDataType.ROTATION) {
			// Adjust to reset and mounting
			resetsHandler.getIdentityAdjustedDriftRotationFrom(rot)
		} else {
			rot
		}
		return if (!stayAligned.hideCorrection) {
			Quaternion.rotationAroundYAxis(stayAligned.yawCorrection.toRad()) * rot
		} else {
			rot
		}
	}

	/**
	 * Get the rotation of the tracker after the resetsHandler's corrections, filtering,
	 * and reset smoothing if applicable
	 */
	fun getRotation(): Quaternion = recovery.applyTo(getRotationBase())

	internal fun getRotationBase(): Quaternion {
		var rot = getRotationNoResetSmooth()

		if (yawResetSmoothing.remainingTime > 0f) {
			rot = yawResetSmoothing.curRotation * rot
		}

		return rot
	}

	/**
	 * Get the rotation of the tracker after the resetsHandler's corrections and
	 * filtering if applicable
	 */
	fun getRotationNoResetSmooth(): Quaternion = if (trackRotDirection) {
		filteringHandler.getFilteredRotation()
	} else {
		// Get non-filtered rotation
		getAdjustedRotation()
	}

	/**
	 * Gets the world-adjusted acceleration
	 */
	fun getAcceleration(): Vector3 = if (allowReset) {
		resetsHandler.getReferenceAdjustedAccel(_rotation, _acceleration)
	} else {
		_acceleration
	}

	/** Gets the sensor-space acceleration without reset or mounting corrections. */
	fun getRawAcceleration(): Vector3 = _acceleration

	/**
	 * Gets the raw (unadjusted) rotation of the tracker.
	 * If this is an IMU, this will be the raw sensor rotation.
	 */
	fun getRawRotation() = _rotation

	/**
	 * Sets the raw (unadjusted) rotation of the tracker.
	 */
	fun setRotation(rotation: Quaternion) {
		this._rotation = rotation
	}

	/**
	 * Sets the raw (unadjusted) acceleration of the tracker.
	 */
	fun setAcceleration(vec: Vector3, arrivalTimeNanos: Long = System.nanoTime()) {
		pendingAcceleration.set(TrackerAccelerationSample(vec, arrivalTimeNanos))
	}

	/** True only while captured acceleration is recent enough for stability evidence. */
	fun hasFreshAcceleration(nowNanos: Long = System.nanoTime()): Boolean {
		val ageNanos = nowNanos - lastAccelerationCaptureTimeNanos
		return hasAcceleration &&
			lastAccelerationCaptureTimeNanos > 0L &&
			ageNanos in 0L..MAX_ACCELERATION_AGE_NANOS &&
			_acceleration.len() > 0f
	}

	/**
	 * Sets the derived velocity of the tracker.
	 */
	fun setVelocity(vec: Vector3) {
		this._velocity = if (allowVelocity) vec else Vector3.NULL
	}

	/**
	 * Gets the derived velocity of the tracker.
	 */
	fun getVelocity(): Vector3 = _velocity

	/**
	 * True if the tracker has valid velocity data.
	 */
	val hasVelocity: Boolean
		get() = allowVelocity && _velocity != Vector3.NULL

	/**
	 * True if the raw rotation is coming directly from an IMU (no cameras or lighthouses)
	 * For example, flex sensor trackers are not considered as IMU trackers (see TrackerDataType)
	 */
	fun isImu(): Boolean = imuType != null && trackerDataType == TrackerDataType.ROTATION

	/**
	 * Gets the magnetic field vector, in mGauss.
	 */
	fun getMagVector() = if (allowReset) {
		resetsHandler.getReferenceAdjustedAccel(_rotation, _magVector)
	} else {
		_magVector
	}

	/**
	 * Sets the magnetic field vector.
	 */
	fun setMagVector(vec: Vector3) {
		this._magVector = vec
	}

	/**
	 * Gets the current TPS of the tracker
	 */
	val tps: Float
		get() = timer.averageFPS

	/**
	 * Call when doing a full reset to reset the tracking of rotations >180 degrees
	 */
	fun resetFilteringQuats(reference: Quaternion) {
		filteringHandler.resetMovingAverage(getAdjustedRotation(), reference)
	}

	/**
	 * Sets time in future if a tracker is expected to sleep
	 */
	fun setSleepTime(time: Long) {
		this.timeScheduledSleep = time
	}
}
