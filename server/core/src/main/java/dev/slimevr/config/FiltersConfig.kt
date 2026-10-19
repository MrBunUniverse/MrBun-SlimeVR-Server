package dev.slimevr.config

import dev.slimevr.VRServer

class FiltersConfig {

	// Timestamp-aware adaptive filtering is the safe default for mixed server and
	// ESP32 packet cadence. Existing explicit user choices remain unchanged.
	var type = "adaptive_hybrid"

	// Amount/Intensity of the specified filtering (0 to 1)
	var amount = 0.2f

	fun updateTrackersFilters() {
		for (tracker in VRServer.instance.allTrackers) {
			if (tracker.allowFiltering) {
				tracker.filteringHandler.readFilteringConfig(this, tracker.getRotation())
			}
		}
	}
}
