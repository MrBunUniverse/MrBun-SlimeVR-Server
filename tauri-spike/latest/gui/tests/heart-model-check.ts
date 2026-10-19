// Checks that the simulated heart rate behaves like a real one.
// Run: node --experimental-strip-types tests/heart-model-check.ts
import assert from 'node:assert/strict';
import { HeartModel, type ActivityTracker } from '../src/utils/adaptive-bpm.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROLES: ActivityTracker['role'][] = ['torso', 'torso', 'thigh', 'thigh', 'leg', 'leg'];

/** Runs the model at 20 Hz; `effort` (0..1) sets how fast the six trackers turn and shake. */
function run(model: HeartModel, seconds: number, effort: (t: number) => number, start = 0) {
  const angles = ROLES.map(() => 0);
  const out: number[] = [];
  for (let ms = 0; ms < seconds * 1000; ms += 50) {
    const now = start + ms;
    const e = effort(ms / 1000);
    const trackers = ROLES.map((role, i) => {
      angles[i] += e * 3 * 0.05 * (i % 2 ? 1 : -1);
      const shake = e * 6 * Math.sin(now / 90 + i);
      return {
        id: String(i),
        role,
        rotation: { x: 0, y: Math.sin(angles[i] / 2), z: 0, w: Math.cos(angles[i] / 2) },
        acceleration: { x: shake, y: 0, z: 0 },
      };
    });
    model.sample(trackers, now);
    model.step(now);
    if (ms % 1000 === 0) out.push(model.snapshot(now).bpm);
  }
  return out;
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const std = (v: number[]) => Math.sqrt(mean(v.map((x) => (x - mean(v)) ** 2)));

// Holding still: stays near resting (posture unknown here, so slightly above), never flatlines.
{
  const m = new HeartModel(seeded(1));
  const bpm = run(m, 300, () => 0).slice(60);
  assert.ok(Math.abs(mean(bpm) - 72) < 6, `still mean ${mean(bpm)}`);
  assert.ok(std(bpm) > 0.7, `resting should wobble, std ${std(bpm)}`);
  assert.ok(new Set(bpm.slice(-30)).size > 2, 'resting reading is stuck on one number');
}

// A 3 s arm-wave-sized burst barely moves it.
{
  const m = new HeartModel(seeded(3));
  const bpm = run(m, 120, (t) => (t > 60 && t < 63 ? 0.8 : 0));
  const before = mean(bpm.slice(40, 60));
  assert.ok(Math.max(...bpm.slice(60, 90)) - before < 12, 'short burst caused a big spike');
}

// Three minutes of hard movement: well up, but under max; then a fast first-minute drop.
{
  const m = new HeartModel(seeded(4));
  const bpm = run(m, 600, (t) => (t > 60 && t < 240 ? 0.85 : 0));
  const rest = mean(bpm.slice(40, 60));
  const peak = Math.max(...bpm.slice(200, 241));
  assert.ok(peak > rest + 45, `effort peak ${peak} vs rest ${rest}`);
  assert.ok(peak < 208 - 0.7 * 25, 'went past max heart rate');
  assert.ok(peak - bpm[300] > 12, `first-minute recovery only ${peak - bpm[300]}`);
  assert.ok(bpm[599] < rest + 12, `still ${bpm[599] - rest} above rest after 6 min`);
}

console.log('heart model checks passed');
