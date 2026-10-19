package dev.slimevr.unit

import com.google.flatbuffers.FlatBufferBuilder
import dev.slimevr.config.config
import dev.slimevr.protocol.datafeed.createTrackerInfos
import dev.slimevr.tracking.trackers.Tracker
import dev.slimevr.tracking.trackers.TrackerPosition
import dev.slimevr.tracking.trackers.TrackerStatus
import dev.slimevr.tracking.trackers.udp.IMUType
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import solarxr_protocol.data_feed.tracker.TrackerInfo

class DataFeedBuilderTests {

	@Test
	fun `tracker info with imu profile override serializes`() {
		val tracker = Tracker(
			device = null,
			id = 1,
			name = "TestTracker",
			trackerPosition = TrackerPosition.CHEST,
			trackerNum = 0,
			hasRotation = true,
			imuType = IMUType.MPU6050,
			allowReset = true,
			allowMounting = true,
			trackRotDirection = false,
		).apply {
			status = TrackerStatus.OK
			config.imuProfileOverride = "mpu6050"
		}

		val builder = FlatBufferBuilder(512)
		val trackerInfoOffset = createTrackerInfos(builder, true, tracker)
		builder.finish(trackerInfoOffset)

		val trackerInfo = TrackerInfo.getRootAsTrackerInfo(builder.dataBuffer())
		assertEquals("mpu6050", trackerInfo.imuProfileOverride())
	}
}
