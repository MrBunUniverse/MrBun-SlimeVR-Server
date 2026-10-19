package dev.slimevr.unit

import dev.slimevr.tracking.processor.skeleton.FootClampOutput
import dev.slimevr.tracking.processor.skeleton.StanceState
import dev.slimevr.tracking.processor.skeleton.ZeroSlideFootClamp
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class ZeroSlideFootClampTests {

	private lateinit var clamp: ZeroSlideFootClamp

	@BeforeEach
	fun setup() {
		clamp = ZeroSlideFootClamp(null)
	}

	@Test
	fun testFootEntersStanceAndLocksTranslation() {
		val floorLevel = 0.0f
		val footLength = 0.15f
		val initialPos = Vector3(0.1f, 0.02f, 0.5f)
		val rot = Quaternion.IDENTITY
		val accel = Vector3(0f, 0f, 0f)

		// Frame 1: Initial position initialization (dt = 0.01s)
		clamp.update(
			leftRawPos = initialPos,
			rightRawPos = Vector3(-0.1f, 0.02f, 0.5f),
			leftRawRot = rot,
			rightRawRot = rot,
			leftAccel = accel,
			rightAccel = accel,
			floorLevel = floorLevel,
			footLength = footLength,
			leftSoleOffset = 0f,
			rightSoleOffset = 0f,
			isStanding = true,
			strength = 1.0f,
			overrideDt = 0.01f,
		)

		// Frame 2: Still near ground -> Enters STANCE_LOCKED
		val res2 = clamp.update(
			leftRawPos = initialPos,
			rightRawPos = Vector3(-0.1f, 0.02f, 0.5f),
			leftRawRot = rot,
			rightRawRot = rot,
			leftAccel = accel,
			rightAccel = accel,
			floorLevel = floorLevel,
			footLength = footLength,
			leftSoleOffset = 0f,
			rightSoleOffset = 0f,
			isStanding = true,
			strength = 1.0f,
			overrideDt = 0.01f,
		)

		assertEquals(StanceState.STANCE_LOCKED, res2.leftState)

		// Frame 3: Simulate raw sensor drift / slide of 3 cm horizontally
		val driftedRawPos = Vector3(0.13f, 0.02f, 0.52f)
		val res3 = clamp.update(
			leftRawPos = driftedRawPos,
			rightRawPos = Vector3(-0.1f, 0.02f, 0.5f),
			leftRawRot = rot,
			rightRawRot = rot,
			leftAccel = accel,
			rightAccel = accel,
			floorLevel = floorLevel,
			footLength = footLength,
			leftSoleOffset = 0f,
			rightSoleOffset = 0f,
			isStanding = true,
			strength = 1.0f,
			overrideDt = 0.01f,
		)

		// Verification: The foot must NOT slide! It must remain clamped to the initial touchdown X and Z
		assertEquals(StanceState.STANCE_LOCKED, res3.leftState)
		assertEquals(initialPos.x, res3.leftFootPosition.x, 0.0001f, "Foot X slid during stance!")
		assertEquals(initialPos.z, res3.leftFootPosition.z, 0.0001f, "Foot Z slid during stance!")
	}

	@Test
	fun testZeroFloorPenetration() {
		val floorLevel = 0.0f
		val footLength = 0.15f
		val startPos = Vector3(0.1f, 0.01f, 0.0f)
		val rot = Quaternion.IDENTITY
		val accel = Vector3(0f, 0f, 0f)

		// Frame 1 & 2: establish lock at floor
		clamp.update(
			leftRawPos = startPos,
			rightRawPos = Vector3(-0.1f, 0.01f, 0.0f),
			leftRawRot = rot,
			rightRawRot = rot,
			leftAccel = accel,
			rightAccel = accel,
			floorLevel = floorLevel,
			footLength = footLength,
			leftSoleOffset = 0f,
			rightSoleOffset = 0f,
			isStanding = true,
			strength = 1.0f,
			overrideDt = 0.01f,
		)

		clamp.update(
			leftRawPos = startPos,
			rightRawPos = Vector3(-0.1f, 0.01f, 0.0f),
			leftRawRot = rot,
			rightRawRot = rot,
			leftAccel = accel,
			rightAccel = accel,
			floorLevel = floorLevel,
			footLength = footLength,
			leftSoleOffset = 0f,
			rightSoleOffset = 0f,
			isStanding = true,
			strength = 1.0f,
			overrideDt = 0.01f,
		)

		// Frame 3: Knee flex causes raw foot position to penetrate into floor (y = -0.06m)
		val penetratingPos = Vector3(0.1f, -0.06f, 0.0f)
		val res = clamp.update(
			leftRawPos = penetratingPos,
			rightRawPos = Vector3(-0.1f, 0.01f, 0.0f),
			leftRawRot = rot,
			rightRawRot = rot,
			leftAccel = accel,
			rightAccel = accel,
			floorLevel = floorLevel,
			footLength = footLength,
			leftSoleOffset = 0f,
			rightSoleOffset = 0f,
			isStanding = true,
			strength = 1.0f,
			overrideDt = 0.01f,
		)

		// Verification: The foot must be clamped flush with the floor, strictly preventing ground penetration
		assertTrue(res.leftFootPosition.y >= floorLevel, "Foot penetrated the ground plane! Y was ${res.leftFootPosition.y}")
	}

	@Test
	fun testBreakoutOnDeliberateStep() {
		val floorLevel = 0.0f
		val footLength = 0.15f
		val startPos = Vector3(0.1f, 0.01f, 0.0f)
		val rot = Quaternion.IDENTITY
		val accel = Vector3(0f, 0f, 0f)

		// Lock foot
		clamp.update(startPos, startPos, rot, rot, accel, accel, floorLevel, footLength, 0f, 0f, true, 1.0f, 0.01f)
		val lockRes = clamp.update(startPos, startPos, rot, rot, accel, accel, floorLevel, footLength, 0f, 0f, true, 1.0f, 0.01f)
		assertEquals(StanceState.STANCE_LOCKED, lockRes.leftState)

		// User takes a large forward step (displacement > 30cm)
		val steppedPos = Vector3(0.1f, 0.01f, 0.35f)
		val stepRes = clamp.update(steppedPos, startPos, rot, rot, accel, accel, floorLevel, footLength, 0f, 0f, true, 1.0f, 0.01f)

		// Breakout must trigger
		assertEquals(StanceState.RELEASE_BLEND, stepRes.leftState, "Foot failed to initiate breakout release on forward step!")
	}

	@Test
	fun testLiftOffOnUpwardVelocity() {
		val floorLevel = 0.0f
		val footLength = 0.15f
		val startPos = Vector3(0.1f, 0.01f, 0.0f)
		val rot = Quaternion.IDENTITY
		val accel = Vector3(0f, 0f, 0f)

		// Lock foot
		clamp.update(startPos, startPos, rot, rot, accel, accel, floorLevel, footLength, 0f, 0f, true, 1.0f, 0.01f)
		clamp.update(startPos, startPos, rot, rot, accel, accel, floorLevel, footLength, 0f, 0f, true, 1.0f, 0.01f)

		// Foot lifts upward with vertical velocity
		val liftedPos = Vector3(0.1f, 0.06f, 0.0f)
		val liftRes = clamp.update(liftedPos, startPos, rot, rot, accel, accel, floorLevel, footLength, 0f, 0f, true, 1.0f, 0.01f)

		// Lift release must trigger
		assertEquals(StanceState.RELEASE_BLEND, liftRes.leftState, "Foot failed to release when lifted upward!")
	}

	@Test
	fun testBypassWhenNotStanding() {
		val floorLevel = 0.0f
		val footLength = 0.15f
		val pos = Vector3(0.1f, 0.01f, 0.0f)
		val rot = Quaternion.IDENTITY
		val accel = Vector3(0f, 0f, 0f)

		val res = clamp.update(
			leftRawPos = pos,
			rightRawPos = pos,
			leftRawRot = rot,
			rightRawRot = rot,
			leftAccel = accel,
			rightAccel = accel,
			floorLevel = floorLevel,
			footLength = footLength,
			leftSoleOffset = 0f,
			rightSoleOffset = 0f,
			isStanding = false, // User is sitting or lying down
			strength = 1.0f,
			overrideDt = 0.01f,
		)

		assertEquals(StanceState.SWING, res.leftState)
		assertEquals(pos.x, res.leftFootPosition.x, 0.0001f)
		assertEquals(pos.y, res.leftFootPosition.y, 0.0001f)
		assertEquals(pos.z, res.leftFootPosition.z, 0.0001f)
	}

	// --- Scenario simulations -------------------------------------------------

	private val restingRight = Vector3(-0.1f, 0.01f, 0f)
	private val restingLeft = Vector3(0.1f, 0.01f, 0f)

	private fun step(
		left: Vector3,
		right: Vector3 = restingRight,
		standing: Boolean = true,
		strength: Float = 1.0f,
		dt: Float = 0.01f,
		leftRot: Quaternion = Quaternion.IDENTITY,
	) = clamp.update(left, right, leftRot, Quaternion.IDENTITY, Vector3.NULL, Vector3.NULL, 0f, 0.15f, 0f, 0f, standing, strength, dt)

	/** Moves the left foot linearly to [to] and returns the last output. */
	private fun moveLeft(
		from: Vector3,
		to: Vector3,
		seconds: Float,
		standing: Boolean = true,
		strength: Float = 1.0f,
		dt: Float = 0.01f,
		onFrame: (Vector3, FootClampOutput) -> Unit = { _, _ -> },
	): FootClampOutput {
		val frames = Math.round(seconds / dt)
		var out = step(from, standing = standing, strength = strength, dt = dt)
		for (i in 1..frames) {
			val t = i.toFloat() / frames
			val raw = from * (1f - t) + to * t
			out = step(raw, standing = standing, strength = strength, dt = dt)
			onFrame(raw, out)
		}
		return out
	}

	private fun lockLeft(at: Vector3 = restingLeft, strength: Float = 1.0f) {
		val out = moveLeft(at, at, 0.2f, strength = strength)
		assertEquals(StanceState.STANCE_LOCKED, out.leftState)
		assertEquals(StanceState.STANCE_LOCKED, out.rightState)
	}

	private fun assertFollowsRaw(raw: Vector3, out: FootClampOutput) {
		assertEquals(raw.x, out.leftFootPosition.x, 0.0001f)
		assertEquals(raw.y, out.leftFootPosition.y, 0.0001f)
		assertEquals(raw.z, out.leftFootPosition.z, 0.0001f)
	}

	@Test
	fun standingContactStaysAnchoredThroughSlowDrift() {
		lockLeft()
		// 2 seconds of 3 cm/s sensor drift: 6 cm total, never an intentional step
		val out = moveLeft(restingLeft, Vector3(0.16f, 0.01f, 0f), 2f)

		assertEquals(StanceState.STANCE_LOCKED, out.leftState)
		assertEquals(StanceState.STANCE_LOCKED, out.rightState)
		assertEquals(restingLeft.x, out.leftFootPosition.x, 0.0001f)
		assertEquals(restingLeft.z, out.leftFootPosition.z, 0.0001f)
	}

	@Test
	fun walkingStepReleasesAndReacquiresAtTheNewContact() {
		lockLeft()
		val apex = Vector3(0.1f, 0.12f, 0.3f)
		val landing = Vector3(0.1f, 0.01f, 0.6f)
		val swing = moveLeft(restingLeft, apex, 0.25f)
		assertEquals(StanceState.SWING, swing.leftState)
		assertFollowsRaw(apex, swing)
		moveLeft(apex, landing, 0.25f)
		val planted = moveLeft(landing, landing, 0.3f)

		assertEquals(StanceState.STANCE_LOCKED, planted.leftState)
		assertFollowsRaw(landing, planted)
		assertEquals(StanceState.STANCE_LOCKED, planted.rightState, "The supporting foot must stay planted")
	}

	@Test
	fun slowLiftReleasesTheFoot() {
		lockLeft()
		// 4 cm/s upward, far below the toe-off velocity threshold
		val lifted = Vector3(0.14f, 0.11f, 0f)
		val out = moveLeft(restingLeft, lifted, 2.5f)

		assertEquals(StanceState.SWING, out.leftState)
		assertFollowsRaw(lifted, out)
	}

	@Test
	fun smallShuffleStepIsNotLeftAnchored() {
		lockLeft()
		// 12 cm slide along the floor at 40 cm/s, without lifting
		val target = Vector3(0.1f, 0.01f, 0.12f)
		moveLeft(restingLeft, target, 0.3f)
		val out = moveLeft(target, target, 0.5f)

		assertEquals(StanceState.STANCE_LOCKED, out.leftState, "The foot should re-plant once it stops")
		assertFollowsRaw(target, out)
	}

	@Test
	fun crouchKeepsFeetPlantedAndStandLieStandReacquiresFreshAnchors() {
		lockLeft()
		// Crouch: the reconstructed foot dips a few centimetres into the floor
		val dipped = Vector3(0.1f, -0.04f, 0f)
		val crouched = moveLeft(restingLeft, dipped, 0.5f)
		assertEquals(StanceState.STANCE_LOCKED, crouched.leftState)
		assertTrue(crouched.leftFootPosition.y >= 0f)
		moveLeft(dipped, restingLeft, 0.5f)

		// Lie down: feet travel far while the user is not standing
		val lying = Vector3(0.9f, 0.25f, 0.7f)
		val down = moveLeft(restingLeft, lying, 1.0f, standing = false)
		assertEquals(StanceState.SWING, down.leftState)
		assertFollowsRaw(lying, down)

		// Stand up somewhere else, moving slowly near the floor the whole time
		val newSpot = Vector3(0.6f, 0.01f, 0.5f)
		moveLeft(lying, newSpot, 1.0f, standing = false)
		val standing = moveLeft(newSpot, newSpot, 0.3f)

		assertEquals(StanceState.STANCE_LOCKED, standing.leftState)
		assertFollowsRaw(newSpot, standing)
	}

	@Test
	fun leavingStandingDoesNotSnapTheFoot() {
		lockLeft(strength = 0.5f)
		val slid = Vector3(0.1f, 0.01f, 0.06f)
		val locked = moveLeft(restingLeft, slid, 2f, strength = 0.5f)
		assertEquals(StanceState.STANCE_LOCKED, locked.leftState)
		assertEquals(0.03f, locked.leftFootPosition.z, 0.001f)

		val first = step(slid, standing = false, strength = 0.5f)
		assertTrue(kotlin.math.abs(first.leftFootPosition.z - locked.leftFootPosition.z) < 0.01f, "Foot snapped by ${first.leftFootPosition.z - locked.leftFootPosition.z} m")
		val settled = moveLeft(slid, slid, 0.1f, standing = false, strength = 0.5f)
		assertFollowsRaw(slid, settled)
	}

	@Test
	fun belowFloorEstimateDoesNotEstablishContact() {
		// A badly wrong pose puts both feet 30 cm under the floor
		val buried = Vector3(0.1f, -0.3f, 0f)
		val buriedRight = Vector3(-0.1f, -0.3f, 0f)
		var out = step(buried, buriedRight)
		repeat(100) { out = step(buried, buriedRight) }
		assertEquals(StanceState.SWING, out.leftState)
		assertEquals(StanceState.SWING, out.rightState)
		assertFollowsRaw(buried, out)

		// A planted foot that sinks that far is released rather than held
		clamp.reset()
		lockLeft()
		val sunk = moveLeft(restingLeft, Vector3(0.1f, -0.3f, 0.03f), 1.0f)
		assertEquals(StanceState.SWING, sunk.leftState)
		assertFollowsRaw(Vector3(0.1f, -0.3f, 0.03f), sunk)
	}

	@Test
	fun frozenInputDoesNotPoisonLaterMovement() {
		lockLeft()
		// Tracker recovery holds the leg pose: 5 s of identical input
		moveLeft(restingLeft, restingLeft, 5f)
		// Data returns and the foot is somewhere else after a long frame
		val jumped = Vector3(0.1f, 0.2f, 0.5f)
		step(jumped, dt = 0.1f)
		val out = moveLeft(jumped, jumped, 0.1f)

		assertEquals(StanceState.SWING, out.leftState)
		assertFollowsRaw(jumped, out)
	}

	@Test
	fun disabledStrengthPassesThroughEvenAfterALock() {
		lockLeft()
		val raw = Vector3(0.13f, -0.02f, 0.05f)
		val out = step(raw, strength = 0f)

		assertEquals(StanceState.SWING, out.leftState)
		assertFollowsRaw(raw, out)
		assertEquals(restingRight.x, out.rightFootPosition.x, 0.0001f)
	}

	@Test
	fun releaseBehavesTheSameAcrossFrameTimings() {
		for (dt in listOf(0.001f, 0.004f, 0.011f, 0.02f, 0.05f)) {
			clamp.reset()
			lockLeft()
			val target = Vector3(0.1f, 0.01f, 0.12f)
			moveLeft(restingLeft, target, 0.3f, dt = dt)
			val shuffled = moveLeft(target, target, 0.5f, dt = dt)
			assertEquals(target.z, shuffled.leftFootPosition.z, 0.0001f, "shuffle dt=$dt")

			val lifted = Vector3(0.14f, 0.11f, 0.12f)
			val out = moveLeft(target, lifted, 2.5f, dt = dt)
			assertEquals(StanceState.SWING, out.leftState, "lift dt=$dt")
		}
	}

	@Test
	fun releaseIsContinuousAtPartialStrength() {
		val strength = 0.26f
		lockLeft(strength = strength)
		var previous = restingLeft
		var largestJump = 0f
		var released = false
		// Slow 10 cm/s slide until the stride breakout releases the foot
		moveLeft(restingLeft, Vector3(0.1f, 0.01f, 0.4f), 4f, strength = strength) { _, out ->
			largestJump = kotlin.math.max(largestJump, (out.leftFootPosition - previous).len())
			previous = out.leftFootPosition
			if (out.leftState != StanceState.STANCE_LOCKED) released = true
		}

		assertTrue(released)
		// The 40 ms release ease covers the ~7 cm locked offset; a snap to the
		// full anchor would be ~19 cm in a single frame.
		assertTrue(largestJump < 0.04f, "Foot jumped $largestJump m in one frame")
	}
}
