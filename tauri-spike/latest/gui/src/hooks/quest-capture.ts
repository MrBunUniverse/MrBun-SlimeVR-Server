import { useCallback, useEffect, useState } from 'react';
import {
  QuestCaptureProfile,
  QuestVideoStartOptions,
} from 'electron/preload/interface';

export type QuestCaptureSettings = QuestVideoStartOptions & {
  gameAudioEnabled: boolean;
  microphoneEnabled: boolean;
  gameAudioCodec: 'opus' | 'aac' | 'raw';
  gameAudioBitrate: number;
  gameAudioBufferMs: number;
  microphoneCodec: 'opus' | 'aac' | 'raw';
  microphoneBitrate: number;
  microphoneBufferMs: number;
};

const STORAGE_KEY = 'quest-capture-settings-v1';

export const DEFAULT_QUEST_CAPTURE_SETTINGS: QuestCaptureSettings = {
  profile: 'low-latency',
  eye: 'left',
  aspect: '16:9',
  manualCrop: { x: 0, y: 0, width: 50, height: 100 },
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
  adaptiveQuality: true,
  autoReconnect: true,
  maxReconnectAttempts: 3,
  gameAudioEnabled: true,
  microphoneEnabled: true,
  gameAudioCodec: 'opus',
  gameAudioBitrate: 96,
  gameAudioBufferMs: 80,
  microphoneCodec: 'opus',
  microphoneBitrate: 64,
  microphoneBufferMs: 80,
};

const PROFILE_VALUES: Record<
  Exclude<QuestCaptureProfile, 'custom'>,
  Pick<
    QuestCaptureSettings,
    'codec' | 'bitrateMbps' | 'maxSize' | 'maxFps' | 'bufferMs'
  >
> = {
  'low-latency': {
    codec: 'h264',
    bitrateMbps: 8,
    maxSize: 1920,
    maxFps: 60,
    bufferMs: 0,
  },
  balanced: {
    codec: 'h264',
    bitrateMbps: 10,
    maxSize: 1920,
    maxFps: 60,
    bufferMs: 20,
  },
  quality: {
    codec: 'h265',
    bitrateMbps: 16,
    maxSize: 2560,
    maxFps: 72,
    bufferMs: 40,
  },
};

function mergeSettings(value: unknown): QuestCaptureSettings {
  if (!value || typeof value !== 'object') return DEFAULT_QUEST_CAPTURE_SETTINGS;
  return {
    ...DEFAULT_QUEST_CAPTURE_SETTINGS,
    ...(value as Partial<QuestCaptureSettings>),
    manualCrop: {
      ...DEFAULT_QUEST_CAPTURE_SETTINGS.manualCrop!,
      ...((value as Partial<QuestCaptureSettings>).manualCrop || {}),
    },
  };
}

async function readSettings(): Promise<QuestCaptureSettings> {
  if (window.electronAPI) {
    const store = await window.electronAPI.getStorage('settings');
    const saved = await store.get<string>(STORAGE_KEY);
    if (saved) {
      try {
        return mergeSettings(JSON.parse(saved));
      } catch {
        return DEFAULT_QUEST_CAPTURE_SETTINGS;
      }
    }
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return DEFAULT_QUEST_CAPTURE_SETTINGS;
  try {
    return mergeSettings(JSON.parse(saved));
  } catch {
    return DEFAULT_QUEST_CAPTURE_SETTINGS;
  }
}

async function writeSettings(settings: QuestCaptureSettings): Promise<void> {
  const serialized = JSON.stringify(settings);
  if (window.electronAPI) {
    const store = await window.electronAPI.getStorage('settings');
    await store.set(STORAGE_KEY, serialized);
    return;
  }
  localStorage.setItem(STORAGE_KEY, serialized);
}

export function useQuestCaptureSettings() {
  const [settings, setSettings] = useState(DEFAULT_QUEST_CAPTURE_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void readSettings().then((value) => {
      if (!active) return;
      setSettings(value);
      setIsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const replace = useCallback((next: QuestCaptureSettings) => {
    setSettings(next);
    void writeSettings(next);
    window.dispatchEvent(new CustomEvent('quest-capture-settings-changed'));
  }, []);

  const update = useCallback(
    (values: Partial<QuestCaptureSettings>) => {
      replace({ ...settings, ...values, profile: values.profile ?? 'custom' });
    },
    [replace, settings]
  );

  const applyProfile = useCallback(
    (profile: Exclude<QuestCaptureProfile, 'custom'>) => {
      replace({ ...settings, ...PROFILE_VALUES[profile], profile });
    },
    [replace, settings]
  );

  const reset = useCallback(() => replace(DEFAULT_QUEST_CAPTURE_SETTINGS), [replace]);

  return { settings, isLoaded, update, applyProfile, reset };
}
