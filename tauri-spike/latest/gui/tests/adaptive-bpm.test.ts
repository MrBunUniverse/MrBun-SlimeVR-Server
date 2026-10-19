import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveBpmModel } from '../src/utils/adaptive-bpm.ts';

const upright = { x: 0, y: 0, z: 0, w: 1 };
const horizontal = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
function pose(torso = upright, thigh = upright, rotation = upright) {
  return [
    { id: 'torso', role: 'torso' as const, rotation, postureRotation: torso },
    { id: 'thigh', role: 'thigh' as const, rotation, postureRotation: thigh },
  ];
}
function feed(
  model: AdaptiveBpmModel,
  start: number,
  end: number,
  moving = false,
  interval = 100
) {
  for (let time = start; time <= end; time += interval) {
    const angle = moving ? (time / 1000) * 3 : 0;
    model.sample(
      pose(upright, upright, {
        x: 0,
        y: Math.sin(angle / 2),
        z: 0,
        w: Math.cos(angle / 2),
      }),
      time
    );
  }
}

test('recognizes sustained standing, sitting and lying down without a headset', () => {
  const model = new AdaptiveBpmModel();
  feed(model, 0, 4000);
  assert.equal(model.snapshot(4000).posture, 'Standing');
  for (let t = 4100; t <= 8000; t += 100) model.sample(pose(upright, horizontal), t);
  assert.equal(model.snapshot(8000).posture, 'Sitting');
  for (let t = 8100; t <= 12000; t += 100)
    model.sample(pose(horizontal, horizontal), t);
  assert.equal(model.snapshot(12000).posture, 'Lying down');
});

test('brief bends do not switch posture, missing calibrated limbs report unknown', () => {
  const model = new AdaptiveBpmModel();
  feed(model, 0, 4000);
  model.sample(pose(upright, horizontal), 4100);
  assert.equal(model.snapshot(4100).posture, 'Standing');
  model.sample([{ id: 'hand', role: 'other', rotation: upright }], 4200);
  assert.equal(model.snapshot(4200).posture, 'Unknown posture');
});

test('sustained movement raises BPM, rest recovers gradually, output stays bounded', () => {
  const model = new AdaptiveBpmModel();
  feed(model, 0, 30000);
  const rest = model.snapshot(30000).bpm;
  feed(model, 30100, 60100, true);
  const peak = model.snapshot(60100).bpm;
  assert.ok(peak > rest + 40);
  assert.ok(peak <= 160);
  feed(model, 60200, 65200);
  assert.ok(model.snapshot(65200).bpm > rest + 20);
  feed(model, 65300, 185300);
  assert.ok(model.snapshot(185300).bpm < peak - 40);
});

test('stale, disconnected and invalid data are unavailable; reconnection has no motion spike', () => {
  const model = new AdaptiveBpmModel();
  feed(model, 0, 4000);
  assert.equal(model.snapshot(6001).available, false);
  model.sample(pose(upright, upright, horizontal), 7000);
  assert.equal(model.snapshot(7000).intensity, 0);
  model.sample([], 7100);
  assert.equal(model.snapshot(7100).available, false);
  model.sample([{ id: 'bad', role: 'other', rotation: { ...upright, x: NaN } }], 7200);
  assert.equal(model.snapshot(7200).available, false);
});

test('quaternion sign flips do not count as movement', () => {
  const model = new AdaptiveBpmModel();
  for (let t = 0; t <= 10000; t += 100)
    model.sample(pose(upright, upright, { ...upright, w: t % 200 ? -1 : 1 }), t);
  assert.equal(model.snapshot(10000).intensity, 0);
});

test('motion estimates are comparable at different feed rates', () => {
  const slow = new AdaptiveBpmModel();
  const fast = new AdaptiveBpmModel();
  feed(slow, 0, 30000, true, 100);
  feed(fast, 0, 30000, true, 20);
  assert.ok(Math.abs(slow.snapshot(30000).bpm - fast.snapshot(30000).bpm) <= 2);
});
