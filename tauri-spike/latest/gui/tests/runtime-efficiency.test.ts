import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const protocol = require('solarxr-protocol');

test('dictation survives rerenders during microphone startup and listening', async () => {
  const slots: any[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  const same = (a: any[], b: any[]) =>
    a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useRef: (current: unknown) => (slots[cursor++] ??= { current }),
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in slots))
        slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[index],
        (value: any) => {
          slots[index] = typeof value === 'function' ? value(slots[index]) : value;
        },
      ];
    },
    useCallback: (fn: any, deps: any[]) => {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { fn, deps };
      return slots[index].fn;
    },
    useEffect: (fn: any, deps: any[]) => {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps))
        effects.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { deps, cleanup: fn() };
        });
    },
  };
  let resolveStream!: (stream: any) => void;
  let stopped = 0;
  let closed = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  const node = () => ({ connect() {}, disconnect() {} });
  class AudioContextMock {
    state = 'running';
    sampleRate = 48000;
    destination = {};
    createAnalyser() {
      return { ...node(), frequencyBinCount: 128, getByteFrequencyData() {} };
    }
    createMediaStreamSource() {
      return node();
    }
    createScriptProcessor() {
      return node();
    }
    createGain() {
      return { ...node(), gain: { value: 0 } };
    }
    close() {
      closed++;
      return Promise.resolve();
    }
  }
  const hooks = loadHook(
    'use-speech-dictation',
    { react },
    {
      Buffer,
      console,
      localStorage: { getItem: () => null, setItem() {} },
      window: { AudioContext: AudioContextMock },
      navigator: {
        mediaDevices: {
          enumerateDevices: async () => [],
          getUserMedia: () =>
            new Promise((resolve) => {
              resolveStream = resolve;
            }),
        },
      },
      requestAnimationFrame: () => 1,
      cancelAnimationFrame() {},
    }
  );
  const render = () => {
    cursor = 0;
    const result = hooks.useSpeechDictation(() => {});
    const pending = effects;
    effects = [];
    pending.forEach((effect) => effect());
    return result;
  };
  let api = render();
  const starting = api.startListening();
  await Promise.resolve();
  render();
  resolveStream(stream);
  await starting;
  api = render();
  assert.equal(api.isListening, true);
  api = render();
  assert.equal(api.isListening, true);
  assert.equal(stopped, 0);
  assert.equal(closed, 0);
  api.stopListening();
  assert.equal(render().isListening, false);
  assert.equal(stopped, 1);
  assert.equal(closed, 1);
});

// Execute production hooks with controlled platform boundaries, without a browser.
function loadHook(file: string, mocks: Record<string, unknown>, globals = {}) {
  const source = readFileSync(
    new URL(`../src/hooks/${file}.ts`, import.meta.url),
    'utf8'
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require: (name: string) => mocks[name] ?? require(name),
    ...globals,
  });
  return exports as any;
}

test('feed configuration is reused until the rate changes; masks and rates stay intact', () => {
  let config = { debug: false, devSettings: { fastDataFeed: false } };
  let previousDeps: unknown[] = [];
  let memo: any;
  const hooks = loadHook('datafeed-config', {
    react: {
      useMemo: (factory: () => unknown, deps: unknown[]) => {
        if (deps.some((dep, i) => dep !== previousDeps[i])) {
          memo = factory();
          previousDeps = deps;
        }
        return memo;
      },
    },
    './config': { useConfig: () => ({ config }) },
  });
  const regular = hooks.useDataFeedConfig();
  assert.equal(regular.feedMaxTps, 10);
  assert.equal(regular.dataFeedConfig.minimumTimeSinceLast, 100);
  assert.equal(regular.dataFeedConfig.dataMask.trackerData.rotation, true);
  assert.equal(regular.dataFeedConfig.dataMask.trackerData.rawMagneticVector, true);
  assert.equal(hooks.useDataFeedConfig(), regular);
  config = { debug: true, devSettings: { fastDataFeed: true } };
  assert.equal(hooks.useDataFeedConfig().feedMaxTps, 90);
  assert.notEqual(hooks.useDataFeedConfig(), regular);
  previousDeps = [];
  config.debug = false;
  const bones = hooks.useBonesDataFeedConfig();
  assert.equal(bones.minimumTimeSinceLast, 25);
  assert.equal(bones.boneMask, true);
  assert.equal(hooks.useBonesDataFeedConfig(), bones);
  config.debug = true;
  assert.equal(hooks.useBonesDataFeedConfig().minimumTimeSinceLast, 1000 / 90);
});

test('WebSocket decodes real binary data-feed packets synchronously and cleans up', () => {
  const cleanups: (() => void)[] = [];
  const sockets: FakeSocket[] = [];
  class FakeSocket extends EventTarget {
    binaryType = 'blob';
    closed = false;
    constructor() {
      super();
      sockets.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  const hooks = loadHook(
    'websocket-api',
    {
      react: {
        createContext: () => ({}),
        useRef: (current: unknown) => ({ current }),
        useState: (value: unknown) => [value, () => {}],
        useEffect: (effect: () => (() => void) | undefined) => {
          const cleanup = effect();
          if (cleanup) cleanups.push(cleanup);
        },
      },
      './timeout': { useInterval: () => {}, useTimeout: () => {} },
      '@/utils/logging': { log: () => {} },
    },
    {
      WebSocket: FakeSocket,
      EventTarget,
      CustomEvent,
      ArrayBuffer,
      Uint8Array,
      URLSearchParams,
      window: { location: { search: '' } },
    }
  );
  const api = hooks.useProvideWebsocketApi();
  const received: number[] = [];
  api.useDataFeedPacket(protocol.DataFeedMessage.DataFeedUpdate, (packet: any) =>
    received.push(packet.index)
  );
  assert.equal(sockets[0].binaryType, 'arraybuffer');
  for (const index of [0, 1, 0]) {
    const update = new protocol.DataFeedUpdateT();
    update.index = index;
    const header = new protocol.DataFeedMessageHeaderT();
    header.messageType = protocol.DataFeedMessage.DataFeedUpdate;
    header.message = update;
    const bundle = new protocol.MessageBundleT();
    bundle.dataFeedMsgs = [header];
    const builder = new (require('flatbuffers').Builder)(256);
    builder.finish(bundle.pack(builder));
    sockets[0].dispatchEvent(
      new MessageEvent('message', { data: builder.asUint8Array().slice().buffer })
    );
  }
  assert.deepEqual(received, [0, 1, 0]);
  sockets[0].dispatchEvent(new MessageEvent('message', { data: 'ignore text frames' }));
  assert.equal(received.length, 3);
  cleanups.reverse().forEach((cleanup) => cleanup());
  assert.equal(sockets[0].closed, true);
});
