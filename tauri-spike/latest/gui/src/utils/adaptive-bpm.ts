// Simulated heart rate that should pass for a real watch: it follows how hard the body is
// working (from live trackers) through a simple model of how a heart responds, and keeps the
// small natural wobble a real reading has.

export interface ActivityRotation {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface ActivityVector {
  x: number;
  y: number;
  z: number;
}

export interface ActivityTracker {
  id: string;
  /** Big muscles (legs) cost more than a moving chest, and a waving hand costs least. */
  role: 'torso' | 'thigh' | 'leg' | 'other';
  rotation: ActivityRotation;
  /** Linear acceleration in m/s², if the tracker reports it. */
  acceleration?: ActivityVector | null;
  postureRotation?: ActivityRotation | null;
}

export type ActivityPosture = 'Standing' | 'Sitting' | 'Lying down' | 'Unknown posture';

export interface HeartProfile {
  restingBpm: number;
  age: number;
}

export const DEFAULT_PROFILE: HeartProfile = { restingBpm: 68, age: 25 };

const ROLE_WEIGHT = { thigh: 1, leg: 1, torso: 0.7, other: 0.4 };

// Heart rate above or below resting, per posture.
const POSTURE_OFFSET: Record<ActivityPosture, number> = {
  'Lying down': -5,
  Sitting: 0,
  Standing: 10,
  'Unknown posture': 4,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Fraction of the way to a target after dt seconds, for a time constant tau. */
const ease = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);

function normalized(q: ActivityRotation): ActivityRotation | null {
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  if (!Number.isFinite(length) || length < 0.001) return null;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

/** Standard normal sample from a uniform source (Box–Muller). */
function gaussian(random: () => number) {
  const u = Math.max(random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

export class HeartModel {
  profile: HeartProfile = DEFAULT_PROFILE;

  // Live activity from trackers
  private previous = new Map<string, ActivityRotation>();
  private accBaseline = new Map<string, ActivityVector>();
  private lastSample = -Infinity;
  private lastValid = -Infinity;
  private liveActivity = 0;
  private livePosture: ActivityPosture = 'Unknown posture';
  private candidate: ActivityPosture = 'Unknown posture';
  private candidateSince = 0;

  // Heart state, in bpm above or below the baseline
  private lastStep = -Infinity;
  private baseline = DEFAULT_PROFILE.restingBpm;
  private fast = 0; // reacts within seconds when movement starts or stops
  private slow = 0; // builds over a minute or two of sustained effort
  private drift = 0; // slow wandering that never stops
  private breathPhase = 0;
  private bpm = DEFAULT_PROFILE.restingBpm;
  private readonly recent: { t: number; bpm: number }[] = [];

  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /** Feeds one data-feed frame. */
  sample(trackers: ActivityTracker[], now: number) {
    const elapsed = (now - this.lastSample) / 1000;
    if (elapsed < 0.05) return;
    const dt = Math.min(elapsed, 0.5);
    const continuous = elapsed <= 1;
    this.lastSample = now;

    const next = new Map<string, ActivityRotation>();
    let weighted = 0;
    let weights = 0;
    const torso: number[] = [];
    const thighs: number[] = [];
    for (const tracker of trackers) {
      const q = normalized(tracker.rotation);
      if (!q) continue;
      next.set(tracker.id, q);
      const previous = continuous ? this.previous.get(tracker.id) : undefined;
      let turn = 0;
      if (previous) {
        // q and -q are the same orientation. Raw rotations avoid reset jumps.
        const dot = Math.abs(
          q.x * previous.x + q.y * previous.y + q.z * previous.z + q.w * previous.w
        );
        turn = (2 * Math.acos(Math.min(1, dot))) / dt;
      }
      // Acceleration around its own recent average, so a bias or leftover gravity doesn't count.
      let shake = 0;
      const a = tracker.acceleration;
      if (a && Number.isFinite(a.x + a.y + a.z)) {
        const base = this.accBaseline.get(tracker.id) ?? a;
        const k = ease(dt, 1.5);
        const nextBase = {
          x: base.x + (a.x - base.x) * k,
          y: base.y + (a.y - base.y) * k,
          z: base.z + (a.z - base.z) * k,
        };
        this.accBaseline.set(tracker.id, nextBase);
        shake = Math.hypot(a.x - nextBase.x, a.y - nextBase.y, a.z - nextBase.z);
      }
      // ponytail: thresholds guessed for MPU6050 noise (about 0.1 rad/s, 0.3 m/s² at rest); tune from playtests
      const effort =
        0.5 * clamp01((turn - 0.15) / 3) + 0.5 * clamp01((shake - 0.35) / 5);
      const w = ROLE_WEIGHT[tracker.role];
      weighted += effort * w;
      weights += w;

      const calibrated = tracker.postureRotation && normalized(tracker.postureRotation);
      if (calibrated) {
        const vertical = Math.abs(1 - 2 * (calibrated.x ** 2 + calibrated.z ** 2));
        if (tracker.role === 'torso') torso.push(vertical);
        if (tracker.role === 'thigh') thighs.push(vertical);
      }
    }
    this.previous = next;
    if (!next.size) {
      this.lastValid = -Infinity;
      return;
    }
    this.lastValid = now;

    // Effort counts when it's sustained, so a quick wave of the arm barely registers.
    this.liveActivity += (weighted / weights - this.liveActivity) * ease(dt, 3);

    const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
    const torsoVertical = mean(torso);
    const thighVertical = mean(thighs);
    const candidate: ActivityPosture =
      torso.length && thighs.length
        ? torsoVertical < 0.45 && thighVertical < 0.55
          ? 'Lying down'
          : torsoVertical > 0.7 && thighVertical < 0.55
            ? 'Sitting'
            : torsoVertical > 0.7 && thighVertical > 0.75
              ? 'Standing'
              : 'Unknown posture'
        : 'Unknown posture';
    if (candidate !== this.candidate) {
      this.candidate = candidate;
      this.candidateSince = now;
    }
    if (now - this.candidateSince >= 2500) this.livePosture = candidate;
  }

  /** Advances the heart. Call a few times a second, with or without tracker data. */
  step(now: number) {
    const elapsed = (now - this.lastStep) / 1000;
    this.lastStep = now;
    if (!Number.isFinite(elapsed) || elapsed <= 0) return;
    const dt = Math.min(elapsed, 1);
    const { restingBpm, age } = this.profile;
    const maxBpm = 208 - 0.7 * age; // Tanaka estimate

    const activity = this.liveActivity;
    const posture = this.livePosture;

    const baseTarget = restingBpm + POSTURE_OFFSET[posture];
    this.baseline += (baseTarget - this.baseline) * ease(dt, 20);

    // Moving starts: the heart jumps within seconds, then keeps climbing while effort lasts.
    // Stopping: it drops fast for the first minute, then slowly over the next few.
    const fastTarget = 18 * clamp01(activity * 1.6);
    const reserve = Math.max(0, maxBpm - this.baseline - 18);
    const slowTarget = reserve * 0.85 * clamp01(activity) ** 1.3;
    this.fast += (fastTarget - this.fast) * ease(dt, fastTarget > this.fast ? 5 : 15);
    this.slow += (slowTarget - this.slow) * ease(dt, slowTarget > this.slow ? 40 : 100);

    // Slow wandering, and breathing that speeds up the heart on each breath in.
    this.drift +=
      -this.drift * (dt / 45) + 1.8 * Math.sqrt((2 * dt) / 45) * gaussian(this.random);
    const exertion = clamp01((this.fast + this.slow) / Math.max(1, reserve));
    const breathPeriod = 4.6 - 2.2 * exertion;
    this.breathPhase = (this.breathPhase + dt / breathPeriod) % 1;
    const breathing = (2.5 * (1 - exertion) + 0.4) * Math.sin(2 * Math.PI * this.breathPhase);

    this.bpm = Math.min(
      maxBpm,
      Math.max(38, this.baseline + this.fast + this.slow + this.drift + breathing)
    );
    this.recent.push({ t: now, bpm: this.bpm });
    while (this.recent.length && now - this.recent[0].t > 4000) this.recent.shift();
  }

  snapshot(now: number) {
    const available = now - this.lastValid < 2000;
    // Like a watch, the shown number is the average of the last few seconds.
    const shown = this.recent.length
      ? this.recent.reduce((s, r) => s + r.bpm, 0) / this.recent.length
      : this.bpm;
    const posture = this.livePosture;
    return {
      available,
      bpm: Math.round(shown),
      intensity: available ? Math.round(this.liveActivity * 100) : 0,
      posture: available ? posture : ('Unknown posture' as ActivityPosture),
      activity: !available
        ? 'Waiting for trackers'
        : this.liveActivity > 0.5
          ? 'Working hard'
          : this.liveActivity > 0.15
            ? 'Moving'
            : posture === 'Unknown posture'
              ? 'Still'
              : posture,
    };
  }
}
