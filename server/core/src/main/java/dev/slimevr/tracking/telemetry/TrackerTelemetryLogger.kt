package dev.slimevr.tracking.telemetry

import dev.slimevr.config.config
import dev.slimevr.tracking.trackers.Tracker
import io.eiren.util.logging.LogManager
import io.github.axisangles.ktmath.EulerOrder
import io.github.axisangles.ktmath.Quaternion
import java.io.BufferedWriter
import java.io.File
import java.io.FileWriter
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.atomic.AtomicBoolean

/** Bounded, session-isolated telemetry writer. The tracking thread only snapshots data. */
object TrackerTelemetryLogger {
	private const val QUEUE_CAPACITY = 8
	private const val FLUSH_BATCHES = 10

	private data class Sample(
		val timestamp: Long,
		val name: String,
		val imuType: String,
		val rotation: Quaternion,
		val driftSinceSec: Float,
		val learnedDrift: Float,
		val adaptiveMode: String,
		val adaptiveConfidence: Float,
		val adaptiveCorrectionDeg: Float,
		val filterHealth: dev.slimevr.tracking.trackers.FilterHealth,
	)

	private data class Session(
		val file: File,
		val writer: BufferedWriter,
		val queue: ArrayBlockingQueue<List<Sample>>,
		val recording: AtomicBoolean,
	)

	@Volatile
	private var currentSession: Session? = null
	private var lastSampleTime = 0L

	fun isRecording(): Boolean = currentSession?.recording?.get() == true

	fun getTelemetryDirectory(path: String = "logs/telemetry"): File {
		val dir = File(path)
		if (!dir.exists() && !dir.mkdirs() && !dir.isDirectory) {
			throw IllegalStateException("Unable to create telemetry directory: ${dir.absolutePath}")
		}
		return dir
	}

	@Synchronized
	fun startSession(path: String = "logs/telemetry"): File? {
		currentSession?.takeIf { it.recording.get() }?.let { return it.file }
		return try {
			val dir = getTelemetryDirectory(path)
			val timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss"))
			val file = File(dir, "telemetry_$timestamp.csv")
			val session = Session(
				file,
				BufferedWriter(FileWriter(file, true)),
				ArrayBlockingQueue(QUEUE_CAPACITY),
				AtomicBoolean(true),
			)
			session.writer.write("timestamp_ms,tracker_name,imu_type,yaw_deg,pitch_deg,roll_deg,drift_since_sec,learned_drift_deg_min,adaptive_mode,adaptive_confidence,adaptive_correction_deg,input_rate_hz,packet_jitter_ms,packet_loss,prediction_horizon_ms,effective_latency_ms,filtering_impact_rad\n")
			session.writer.flush()
			currentSession = session
			lastSampleTime = 0L
			Thread({ writeSession(session) }, "TrackerTelemetryLogger").apply {
				isDaemon = true
				start()
			}
			LogManager.info("[TelemetryLogger] Started recording tracker telemetry to ${file.absolutePath}")
			file
		} catch (e: Exception) {
			LogManager.severe("[TelemetryLogger] Failed to start telemetry recording", e)
			null
		}
	}

	@Synchronized
	fun stopSession(): File? {
		val session = currentSession ?: return null
		if (!session.recording.compareAndSet(true, false)) return session.file
		currentSession = null
		LogManager.info("[TelemetryLogger] Stopped recording tracker telemetry.")
		return session.file
	}

	fun logTick(trackers: List<Tracker>, sampleIntervalMs: Long = 100L) {
		val session = currentSession ?: return
		if (!session.recording.get()) return
		val now = System.currentTimeMillis()
		if (sampleIntervalMs > 0L && now - lastSampleTime < sampleIntervalMs) return
		lastSampleTime = now

		val samples = trackers.asSequence()
			.filter { it.isImu() }
			.map { tracker ->
				val adaptiveStatus = tracker.adaptiveDriftStatus
				Sample(
					now,
					tracker.name,
					tracker.imuType?.name ?: "UNKNOWN",
					tracker.getRotation(),
					tracker.resetsHandler.getDriftSinceDurationSeconds(),
					tracker.config.learnedDriftRateDegPerMin,
					adaptiveStatus.mode.name,
					adaptiveStatus.confidence,
					adaptiveStatus.appliedCorrectionDeg,
					tracker.filterHealth,
				)
			}
			.toList()
		if (samples.isNotEmpty()) session.queue.offer(samples)
	}

	private fun writeSession(session: Session) {
		var batchesSinceFlush = 0
		try {
			while (session.recording.get() || session.queue.isNotEmpty()) {
				val batch = session.queue.poll()
				if (batch == null) {
					Thread.sleep(10)
					continue
				}
				for (sample in batch) {
					val euler = sample.rotation.toEulerAngles(EulerOrder.YZX)
					val yaw = Math.toDegrees(euler.y.toDouble()).toFloat()
					val pitch = Math.toDegrees(euler.x.toDouble()).toFloat()
					val roll = Math.toDegrees(euler.z.toDouble()).toFloat()
					session.writer.write(
						"${sample.timestamp},\"${csv(sample.name)}\",\"${csv(sample.imuType)}\"," +
							"${"%.2f".format(Locale.ROOT, yaw)},${"%.2f".format(Locale.ROOT, pitch)}," +
							"${"%.2f".format(Locale.ROOT, roll)},${"%.1f".format(Locale.ROOT, sample.driftSinceSec)}," +
							"${"%.3f".format(Locale.ROOT, sample.learnedDrift)}," +
							"${sample.adaptiveMode},${"%.3f".format(Locale.ROOT, sample.adaptiveConfidence)}," +
							"${"%.2f".format(Locale.ROOT, sample.adaptiveCorrectionDeg)}," +
							"${"%.2f".format(Locale.ROOT, sample.filterHealth.inputRateHz)}," +
							"${"%.2f".format(Locale.ROOT, sample.filterHealth.packetJitterMs)}," +
							"${"%.4f".format(Locale.ROOT, sample.filterHealth.packetLoss)}," +
							"${"%.2f".format(Locale.ROOT, sample.filterHealth.predictionHorizonMs)}," +
							"${"%.2f".format(Locale.ROOT, sample.filterHealth.effectiveLatencyMs)}," +
							"${"%.4f".format(Locale.ROOT, sample.filterHealth.filteringImpactRad)}\n",
					)
				}
				batchesSinceFlush++
				if (batchesSinceFlush >= FLUSH_BATCHES) {
					session.writer.flush()
					batchesSinceFlush = 0
				}
			}
			session.writer.flush()
		} catch (e: InterruptedException) {
			Thread.currentThread().interrupt()
		} catch (e: Exception) {
			LogManager.warning("[TelemetryLogger] Error writing telemetry: ${e.message}")
		} finally {
			try {
				session.writer.close()
			} catch (e: Exception) {
				LogManager.warning("[TelemetryLogger] Error closing telemetry writer: ${e.message}")
			}
		}
	}

	private fun csv(value: String): String = value.replace("\"", "\"\"")
}
