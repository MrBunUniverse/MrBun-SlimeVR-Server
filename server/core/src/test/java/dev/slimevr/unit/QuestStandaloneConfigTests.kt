package dev.slimevr.unit

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import dev.slimevr.config.QuestStandaloneConfig
import dev.slimevr.config.RecenterBehavior
import dev.slimevr.config.TrackingProfileType
import dev.slimevr.config.VRConfig
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class QuestStandaloneConfigTests {

	@Test
	fun `test default quest standalone config values`() {
		val config = QuestStandaloneConfig()
		assertTrue(config.enabled)
		assertEquals(TrackingProfileType.STANDING, config.activeProfile)
		assertTrue(config.floorAnchorEnabled)
		assertEquals(0.0f, config.floorHeight)
		assertEquals(0.5f, config.correctionStrength)
		assertEquals(0.0f, config.hmdVerticalOffset)
		assertEquals(RecenterBehavior.REANCHOR_ON_FULL_RESET, config.recenterBehavior)
		assertTrue(config.crouchCompensationEnabled)
		assertEquals(0.5f, config.crouchCompensationStrength)
		assertTrue(config.skeletonConstraintsEnabled)

		// Test default profiles exist
		assertTrue(config.profiles.containsKey("STANDING"))
		assertTrue(config.profiles.containsKey("CROUCHING"))
		assertTrue(config.profiles.containsKey("SITTING"))
		assertTrue(config.profiles.containsKey("CUSTOM"))

		val standingProfile = config.profiles["STANDING"]
		assertNotNull(standingProfile)
		assertTrue(standingProfile!!.floorAnchorEnabled)
		assertEquals(0.5f, standingProfile.correctionStrength)
	}

	@Test
	fun `test serialization and migration compatibility`() {
		val mapper = ObjectMapper(YAMLFactory())
		val vrConfig = VRConfig()

		val yamlString = mapper.writeValueAsString(vrConfig)
		assertNotNull(yamlString)
		assertTrue(yamlString.contains("questStandalone:"))

		// Test deserialization into fresh instance
		val deserialized = mapper.readValue(yamlString, VRConfig::class.java)
		assertNotNull(deserialized.questStandalone)
		assertTrue(deserialized.questStandalone.floorAnchorEnabled)
		assertEquals(0.5f, deserialized.questStandalone.correctionStrength)
	}

	@Test
	fun `test default vrc osc tracker roles enabled`() {
		val vrConfig = VRConfig()
		val vrcOsc = vrConfig.vrcOSC

		assertTrue(vrcOsc.getOSCTrackerRole(dev.slimevr.tracking.trackers.TrackerRole.CHEST, false), "CHEST should be enabled by default")
		assertTrue(vrcOsc.getOSCTrackerRole(dev.slimevr.tracking.trackers.TrackerRole.WAIST, false), "WAIST should be enabled by default")
		assertTrue(vrcOsc.getOSCTrackerRole(dev.slimevr.tracking.trackers.TrackerRole.LEFT_KNEE, false), "LEFT_KNEE should be enabled by default")
		assertTrue(vrcOsc.getOSCTrackerRole(dev.slimevr.tracking.trackers.TrackerRole.RIGHT_KNEE, false), "RIGHT_KNEE should be enabled by default")
		assertTrue(vrcOsc.getOSCTrackerRole(dev.slimevr.tracking.trackers.TrackerRole.LEFT_FOOT, false), "LEFT_FOOT should be enabled by default")
		assertTrue(vrcOsc.getOSCTrackerRole(dev.slimevr.tracking.trackers.TrackerRole.RIGHT_FOOT, false), "RIGHT_FOOT should be enabled by default")
	}

	@Test
	fun `test quest standalone osc rate default and values`() {
		val vrConfig = VRConfig()
		assertEquals(60, vrConfig.questStandalone.oscRate)

		listOf(30, 50, 60, 90).forEach { rate ->
			vrConfig.questStandalone.oscRate = rate
			assertEquals(rate, vrConfig.questStandalone.oscRate)
		}
	}
}
