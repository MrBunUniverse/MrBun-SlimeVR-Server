import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function loadCaptureModule() {
  const source = readFileSync(
    new URL('../electron/main/quest-capture.ts', import.meta.url),
    'utf8'
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require: (name: string) => {
      if (name === './paths') return { getGuiDataFolder: () => '/tmp/slimevr-test' };
      if (name === './quest-audio') {
        return {
          findAdb: async () => null,
          findScrcpy: async () => null,
          getQuestAudioStatus: async () => ({}),
          startAudioStream: async () => ({ success: true }),
          stopAudioStream: async () => ({ success: true }),
        };
      }
      return require(name);
    },
    process,
    setTimeout,
    clearTimeout,
  });
  return exports as any;
}

const capture = loadCaptureModule();

test('single-eye crop selects aligned left and right halves', () => {
  assert.deepEqual(
    { ...capture.calculateVideoCrop(3664, 1920, 'left', 'source') },
    {
      width: 1832,
      height: 1920,
      x: 0,
      y: 0,
    }
  );
  assert.deepEqual(
    { ...capture.calculateVideoCrop(3664, 1920, 'right', 'source') },
    {
      width: 1832,
      height: 1920,
      x: 1832,
      y: 0,
    }
  );
});

test('16:9 framing center-crops one eye without stretching', () => {
  const crop = capture.calculateVideoCrop(4000, 2000, 'left', '16:9');
  assert.deepEqual({ ...crop }, { width: 2000, height: 1120, x: 0, y: 440 });
  assert.ok(Math.abs(crop.width / crop.height - 16 / 9) < 0.02);
});

test('manual crop rejects rectangles outside the source', () => {
  assert.throws(
    () =>
      capture.normalizeVideoOptions({
        profile: 'custom',
        eye: 'manual',
        aspect: 'source',
        manualCrop: { x: 60, y: 0, width: 50, height: 100 },
        codec: 'h264',
        bitrateMbps: 8,
        maxSize: 1920,
        maxFps: 60,
        bufferMs: 0,
        rotation: 0,
        flipHorizontal: false,
        alwaysOnTop: false,
        borderless: true,
        windowWidth: 1280,
        windowHeight: 720,
        renderer: 'auto',
      }),
    /within the source frame/
  );
});

test('scrcpy video args isolate video and keep a stable OBS title', () => {
  const options = capture.normalizeVideoOptions({
    profile: 'low-latency',
    eye: 'left',
    aspect: '16:9',
    codec: 'h264',
    bitrateMbps: 8,
    maxSize: 1920,
    maxFps: 60,
    bufferMs: 0,
    rotation: 0,
    flipHorizontal: false,
    alwaysOnTop: false,
    borderless: true,
    windowWidth: 1280,
    windowHeight: 720,
    renderer: 'auto',
    serial: '192.168.1.20:5555',
  });
  const args = capture.buildVideoArgs(options, {
    width: 1920,
    height: 1080,
    x: 0,
    y: 420,
  });
  assert.ok(args.includes('--no-audio'));
  assert.ok(args.includes('--no-control'));
  assert.ok(args.includes('--window-title=SlimeVR Quest Mirror'));
  assert.ok(args.includes('--crop=1920:1080:0:420'));
  assert.deepEqual(Array.from(args.slice(-2)), ['-s', '192.168.1.20:5555']);
});

test('adaptive quality reduces bitrate before resolution or frame rate', () => {
  const original = capture.normalizeVideoOptions({
    profile: 'balanced',
    eye: 'left',
    aspect: '16:9',
    codec: 'h264',
    bitrateMbps: 10,
    maxSize: 1920,
    maxFps: 60,
    bufferMs: 20,
    rotation: 0,
    flipHorizontal: false,
    alwaysOnTop: false,
    borderless: true,
    windowWidth: 1280,
    windowHeight: 720,
    renderer: 'auto',
    adaptiveQuality: true,
    autoReconnect: true,
    maxReconnectAttempts: 3,
  });

  const first = capture.downshiftVideoOptions(original);
  assert.equal(first.bitrateMbps, 8);
  assert.equal(first.maxSize, 1920);
  assert.equal(first.maxFps, 60);

  const atMinimumBitrate = { ...original, bitrateMbps: 4 };
  const second = capture.downshiftVideoOptions(atMinimumBitrate);
  assert.equal(second.bitrateMbps, 4);
  assert.equal(second.maxSize, 1440);
  assert.equal(second.maxFps, 60);
});
