package dev.slimevr.unit

import com.google.flatbuffers.FlatBufferBuilder
import dev.slimevr.config.ResetsConfig
import dev.slimevr.protocol.rpc.settings.applyRecoverySettings
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import solarxr_protocol.rpc.ResetsSettings

class OptionalResetSettingsCompatibilityTests {
	@Test
	fun `legacy packets preserve saved recovery settings and marker enables explicit values`() {
		val config = ResetsConfig().apply {
			deadTrackerRecoveryEnabled = false
			recoveryChatboxNotifications = false
		}

		val legacySettings = settingsWith(marker = false, deadTrackerRecovery = true, chatboxNotifications = true)
		assertTrue(legacySettings.resetMountingFeet())
		applyRecoverySettings(legacySettings, config)
		assertFalse(config.deadTrackerRecoveryEnabled)
		assertFalse(config.recoveryChatboxNotifications)

		applyRecoverySettings(settingsWith(marker = true, deadTrackerRecovery = false, chatboxNotifications = true), config)
		assertFalse(config.deadTrackerRecoveryEnabled)
		assertTrue(config.recoveryChatboxNotifications)

		applyRecoverySettings(settingsWith(marker = true, deadTrackerRecovery = true, chatboxNotifications = false), config)
		assertTrue(config.deadTrackerRecoveryEnabled)
		assertFalse(config.recoveryChatboxNotifications)
	}

	private fun settingsWith(marker: Boolean, deadTrackerRecovery: Boolean, chatboxNotifications: Boolean): ResetsSettings {
		val builder = FlatBufferBuilder(64)
		val offset = ResetsSettings.createResetsSettings(
			builder,
			true,
			0,
			0f,
			false,
			false,
			deadTrackerRecovery,
			chatboxNotifications,
			marker,
		)
		builder.finish(offset)
		return ResetsSettings.getRootAsResetsSettings(builder.dataBuffer())
	}
}
