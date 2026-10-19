package dev.slimevr.filtering

import java.util.*

enum class TrackerFilters(val id: Int, val configKey: String) {
	NONE(0, "none"),
	SMOOTHING(1, "smoothing"),
	PREDICTION(2, "prediction"),
	ADAPTIVE_HYBRID(3, "adaptive_hybrid"),

	// Plays rotations back a fixed time late so uneven packet arrival and
	// single lost packets are drawn through instead of shown as stutter.
	FIXED_DELAY(4, "fixed_delay"),

	// Fixed delay plus a centred average around the playout time: trades more
	// latency for motion without shake or stutter on weak links and cheap IMUs.
	SMOOTH_PLAYBACK(5, "smooth_playback"),
	;

	companion object {
		private val byConfigkey: MutableMap<String, TrackerFilters> = HashMap()

		init {
			for (configVal in values()) {
				byConfigkey[configVal.configKey.lowercase(Locale.getDefault())] =
					configVal
			}
		}

		val values = values()

		@JvmStatic
		fun fromId(id: Int): TrackerFilters? {
			for (filter in values) {
				if (filter.id == id) return filter
			}
			return null
		}

		@JvmStatic
		fun getByConfigkey(configKey: String?): TrackerFilters? = if (configKey == null) null else byConfigkey[configKey.lowercase(Locale.getDefault())]
	}
}
