import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type TestToneChannel = 'left' | 'right' | 'mono';

let toneDirectory: string | null = null;
let toneFiles: Partial<Record<TestToneChannel, string>> = {};

function createStereoWav(channel: TestToneChannel): Buffer {
  const sampleRate = 44_100;
  const duration = channel === 'mono' ? 0.35 : 0.25;
  const frames = Math.ceil(sampleRate * duration);
  const dataSize = frames * 4;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < frames; frame++) {
    const time = frame / sampleRate;
    const envelope = Math.min(1, time / 0.006) * Math.exp((-7 * time) / duration);
    const base = Math.sin(2 * Math.PI * (channel === 'mono' ? 440 : 880) * time);
    const harmonic =
      channel === 'mono' ? 0.3 * Math.asin(Math.sin(2 * Math.PI * 659.25 * time)) : 0;
    const sample = Math.round(
      Math.max(-1, Math.min(1, (base + harmonic) * envelope * 0.85)) * 32767
    );
    const offset = 44 + frame * 4;
    wav.writeInt16LE(channel === 'right' ? 0 : sample, offset);
    wav.writeInt16LE(channel === 'left' ? 0 : sample, offset + 2);
  }

  return wav;
}

async function getToneFile(channel: TestToneChannel): Promise<string> {
  if (toneFiles[channel]) return toneFiles[channel];
  toneDirectory ??= await mkdtemp(join(tmpdir(), 'slimevr-channel-test-'));
  const file = join(toneDirectory, `${channel}.wav`);
  await writeFile(file, createStereoWav(channel));
  toneFiles[channel] = file;
  return file;
}

export async function playNativeTestTone(
  channel: TestToneChannel,
  volume: number
): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  const file = await getToneFile(channel);
  const gain = String(Math.max(0, Math.min(1, volume)));
  return new Promise((resolve) => {
    const player = spawn('/usr/bin/afplay', ['-v', gain, file], { stdio: 'ignore' });
    player.once('error', () => resolve(false));
    player.once('spawn', () => resolve(true));
  });
}

export async function cleanupNativeTestTones(): Promise<void> {
  if (!toneDirectory) return;
  await rm(toneDirectory, { recursive: true, force: true });
  toneDirectory = null;
  toneFiles = {};
}
