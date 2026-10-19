import {
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue,
} from 'electron';
import {
  DiscordPresence,
  GHGet,
  GHReturn,
  OSStats,
  QuestAudioDevice,
  QuestAudioStartOptions,
  QuestAudioStatus,
  QuestCaptureCapabilities,
  QuestCaptureStatus,
  QuestStudioStartOptions,
  QuestVideoStartOptions,
  TestToneChannel,
} from './preload/interface';

export const IPC_CHANNELS = {
  SERVER_STATUS: 'server-status',
  OPEN_URL: 'open-url',
  OS_STATS: 'os-stats',
  WINDOW_ACTIONS: 'window-actions',
  LOG: 'log',
  STORAGE: 'storage',
  OPEN_DIALOG: 'open-dialog',
  SAVE_DIALOG: 'save-dialog',
  I18N_OVERRIDE: 'i18n-override',
  OPEN_FILE: 'open-file',
  GET_FOLDER: 'get-folder',
  GH_FETCH: 'gh-fetch',
  DISCORD_PRESENCE: 'discord-presence',
  IS_STEAM: 'is-steam',
  GET_APPLE_MUSIC: 'get-apple-music',
  QUEST_AUDIO_DEVICES: 'quest-audio-devices',
  QUEST_AUDIO_CONNECT: 'quest-audio-connect',
  QUEST_AUDIO_ENABLE_WIFI: 'quest-audio-enable-wifi',
  QUEST_AUDIO_START: 'quest-audio-start',
  QUEST_AUDIO_STOP: 'quest-audio-stop',
  QUEST_AUDIO_STATUS: 'quest-audio-status',
  QUEST_AUDIO_INSTALL: 'quest-audio-install',
  QUEST_AUDIO_TEST_TONE: 'quest-audio-test-tone',
  QUEST_CAPTURE_CAPABILITIES: 'quest-capture-capabilities',
  QUEST_CAPTURE_VIDEO_START: 'quest-capture-video-start',
  QUEST_CAPTURE_VIDEO_STOP: 'quest-capture-video-stop',
  QUEST_CAPTURE_STUDIO_START: 'quest-capture-studio-start',
  QUEST_CAPTURE_STOP_ALL: 'quest-capture-stop-all',
  QUEST_CAPTURE_STATUS: 'quest-capture-status',
  REQUEST_MICROPHONE_ACCESS: 'request-microphone-access',
  NATIVE_SPEECH_TRANSCRIBE: 'native-speech-transcribe',
} as const;

export interface IpcInvokeMap {
  [IPC_CHANNELS.OPEN_URL]: (url: string) => void;
  [IPC_CHANNELS.OS_STATS]: () => Promise<OSStats>;
  [IPC_CHANNELS.WINDOW_ACTIONS]: (
    action: 'close' | 'minimize' | 'toggle-maximize' | 'hide'
  ) => void;
  [IPC_CHANNELS.LOG]: (type: 'info' | 'error' | 'warn', ...args: unknown[]) => void;
  [IPC_CHANNELS.OPEN_DIALOG]: (
    options: OpenDialogOptions
  ) => Promise<OpenDialogReturnValue>;
  [IPC_CHANNELS.SAVE_DIALOG]: (
    options: SaveDialogOptions
  ) => Promise<SaveDialogReturnValue>;
  [IPC_CHANNELS.I18N_OVERRIDE]: () => Promise<string | false>;
  [IPC_CHANNELS.STORAGE]: (args: {
    type: 'settings' | 'cache';
    method: 'get' | 'set' | 'delete' | 'save';
    key?: string;
    value?: unknown;
  }) => Promise<unknown>;
  [IPC_CHANNELS.OPEN_FILE]: (path: string) => void;
  [IPC_CHANNELS.GET_FOLDER]: (folder: 'config' | 'logs' | 'exe') => string;
  [IPC_CHANNELS.GH_FETCH]: <T extends GHGet>(
    options: T
  ) => Promise<GHReturn[T['type']]>;
  [IPC_CHANNELS.DISCORD_PRESENCE]: (options: DiscordPresence) => void;
  [IPC_CHANNELS.IS_STEAM]: () => boolean;
  [IPC_CHANNELS.GET_APPLE_MUSIC]: () => Promise<{
    running: boolean;
    playing: boolean;
    track?: string;
    artist?: string;
    album?: string;
    pos?: number;
    dur?: number;
    formatted?: string;
  }>;
  [IPC_CHANNELS.QUEST_AUDIO_DEVICES]: () => Promise<QuestAudioDevice[]>;
  [IPC_CHANNELS.QUEST_AUDIO_CONNECT]: (
    ip: string
  ) => Promise<{ success: boolean; message: string }>;
  [IPC_CHANNELS.QUEST_AUDIO_ENABLE_WIFI]: (
    serial: string
  ) => Promise<{ success: boolean; message: string; address?: string }>;
  [IPC_CHANNELS.QUEST_AUDIO_START]: (
    options: QuestAudioStartOptions
  ) => Promise<{ success: boolean; message?: string }>;
  [IPC_CHANNELS.QUEST_AUDIO_STOP]: (
    source: 'output' | 'mic' | 'all'
  ) => Promise<{ success: boolean }>;
  [IPC_CHANNELS.QUEST_AUDIO_STATUS]: () => Promise<QuestAudioStatus>;
  [IPC_CHANNELS.QUEST_AUDIO_INSTALL]: () => Promise<{
    success: boolean;
    message: string;
  }>;
  [IPC_CHANNELS.QUEST_AUDIO_TEST_TONE]: (
    channel: TestToneChannel,
    volume: number
  ) => Promise<boolean>;
  [IPC_CHANNELS.QUEST_CAPTURE_CAPABILITIES]: (
    serial?: string
  ) => Promise<QuestCaptureCapabilities>;
  [IPC_CHANNELS.QUEST_CAPTURE_VIDEO_START]: (
    options: QuestVideoStartOptions
  ) => Promise<{ success: boolean; message?: string }>;
  [IPC_CHANNELS.QUEST_CAPTURE_VIDEO_STOP]: () => Promise<{ success: boolean }>;
  [IPC_CHANNELS.QUEST_CAPTURE_STUDIO_START]: (
    options: QuestStudioStartOptions
  ) => Promise<{ success: boolean; errors: string[] }>;
  [IPC_CHANNELS.QUEST_CAPTURE_STOP_ALL]: () => Promise<{ success: boolean }>;
  [IPC_CHANNELS.QUEST_CAPTURE_STATUS]: () => Promise<QuestCaptureStatus>;
  [IPC_CHANNELS.REQUEST_MICROPHONE_ACCESS]: () => Promise<boolean>;
  [IPC_CHANNELS.NATIVE_SPEECH_TRANSCRIBE]: (data: {
    audioBase64: string;
    language?: string;
  }) => Promise<{ success: boolean; text?: string; error?: string }>;
}
