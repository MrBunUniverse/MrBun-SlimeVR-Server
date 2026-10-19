package dev.slimevr.unit

import com.illposed.osc.OSCBundle
import com.illposed.osc.OSCMessage
import com.illposed.osc.OSCMessageListener
import com.illposed.osc.OSCPacketDispatcher
import com.illposed.osc.OSCPacketEvent
import com.illposed.osc.argument.OSCTimeTag64
import com.illposed.osc.messageselector.OSCPatternAddressMessageSelector
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.Date

/**
 * A bundle time-tagged by a clock ahead of ours (Quest vs Mac) must be
 * dispatched now, not parked on JavaOSC's scheduler where it leaks memory.
 */
class OSCBundleDispatchTests {
	private fun deliveredNow(immediate: Boolean): Int {
		val dispatcher = OSCPacketDispatcher()
		dispatcher.isAlwaysDispatchingImmediately = immediate
		var received = 0
		dispatcher.addListener(
			OSCPatternAddressMessageSelector("/tracking/vrsystem/head/pose"),
			OSCMessageListener { received++ },
		)
		val oneHourAhead = OSCTimeTag64.valueOf(Date(System.currentTimeMillis() + 3_600_000))
		val bundle = OSCBundle(listOf(OSCMessage("/tracking/vrsystem/head/pose", listOf(0f, 1.6f, 0f, 0f, 0f, 0f))), oneHourAhead)
		dispatcher.handlePacket(OSCPacketEvent(this, bundle))
		return received
	}

	@Test
	fun futureBundleIsDispatchedImmediately() {
		assertEquals(0, deliveredNow(immediate = false), "JavaOSC default should schedule future bundles")
		assertEquals(1, deliveredNow(immediate = true))
	}
}
