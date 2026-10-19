package dev.slimevr.config

class TelemetryConfig {
	var recordTelemetry: Boolean = false
	var telemetryPath: String = "logs/telemetry"
	var autoRecordOnStartup: Boolean = false
	var sampleIntervalMs: Long = 100L
}
