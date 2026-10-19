import {
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue,
} from 'electron';

export type ServerStatusEvent = {
  type: 'stdout' | 'stderr' | 'error' | 'terminated' | 'other';
  message: string;
};

export type OSStats = {
  type: 'linux' | 'windows' | 'macos' | 'unknown';
};

export interface CrossStorage {
  set(key: string, value: unknown): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  delete(key: string): Promise<boolean>;
  save(): Promise<boolean>;
}

export type GHGet = { type: 'fw-releases' } | { type: 'asset'; url: string };
export type GHReturn = {
  asset: [number, string][] | null;
  ['fw-releases']:
    | {
        assets: { browser_download_url: string; name: string; digest: string }[];
        prerelease: boolean;
        tag_name: string;
        body: string;
      }[]
    | null;
};

export type DiscordPresence =
  | { enable: false }
  | { enable: true; activity: string; iconText: string | undefined };

export type QuestAudioDevice = {
  id: string;
  model: string;
  connection: 'usb' | 'wifi';
  state: string;
};

export type QuestAudioStartOptions = {
  serial?: string;
  source: 'output' | 'mic';
  codec?: 'opus' | 'aac' | 'raw';
  bitrate?: number;
  bufferMs?: number;
};

export type QuestAudioStatus = {
  isStreamingOutput: boolean;
  isStreamingMic: boolean;
  outputBitrate?: number;
  micBitrate?: number;
  outputBufferMs?: number;
  micBufferMs?: number;
  outputCodec?: 'opus' | 'aac' | 'raw';
  micCodec?: 'opus' | 'aac' | 'raw';
  activeSerial?: string;
  scrcpyAvailable: boolean;
  adbAvailable: boolean;
  adbPath?: string;
  scrcpyPath?: string;
  error?: string;
};

export type QuestCaptureProfile = 'low-latency' | 'balanced' | 'quality' | 'custom';
export type QuestCaptureEye = 'left' | 'right' | 'both' | 'manual';
export type QuestCaptureAspect = 'source' | '16:9' | '16:10' | '4:3' | '1:1';
export type QuestVideoCodec = 'h264' | 'h265';

export type QuestCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type QuestVideoStartOptions = {
  serial?: string;
  profile: QuestCaptureProfile;
  eye: QuestCaptureEye;
  aspect: QuestCaptureAspect;
  manualCrop?: QuestCropRect;
  codec: QuestVideoCodec;
  bitrateMbps: number;
  maxSize: number;
  maxFps: number;
  bufferMs: number;
  rotation: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  alwaysOnTop: boolean;
  borderless: boolean;
  windowWidth: number;
  windowHeight: number;
  renderer: 'auto' | 'metal' | 'opengl' | 'software';
  adaptiveQuality: boolean;
  autoReconnect: boolean;
  maxReconnectAttempts: number;
};

export type QuestStudioStartOptions = {
  video: QuestVideoStartOptions;
  gameAudio?: Omit<QuestAudioStartOptions, 'serial' | 'source'>;
  microphone?: Omit<QuestAudioStartOptions, 'serial' | 'source'>;
};

export type QuestCaptureCapabilities = {
  platformSupported: boolean;
  scrcpyVersion?: string;
  displaySize?: { width: number; height: number };
  videoEncoders: string[];
  error?: string;
};

export type QuestCaptureStatus = QuestAudioStatus & {
  isStreamingVideo: boolean;
  videoPid?: number;
  videoStartedAt?: number;
  videoCodec?: QuestVideoCodec;
  videoBitrateMbps?: number;
  videoMaxSize?: number;
  videoMaxFps?: number;
  videoBufferMs?: number;
  videoEye?: QuestCaptureEye;
  videoAspect?: QuestCaptureAspect;
  videoCrop?: { width: number; height: number; x: number; y: number };
  observedFps?: number;
  adbRoundTripMs?: number;
  connectionType?: 'usb' | 'wifi';
  qualityAdjustments: number;
  reconnectAttempts: number;
  mirrorWindowTitle: string;
  videoError?: string;
};

export type TestToneChannel = 'left' | 'right' | 'mono';

export interface IElectronAPI {
  onServerStatus: (cb: (data: ServerStatusEvent) => void) => () => void;
  openUrl: (url: string) => Promise<void>;
  osStats: () => Promise<OSStats>;
  openLogsFolder: () => Promise<void>;
  openConfigFolder: () => Promise<void>;
  close: () => void;
  hide: () => void;
  minimize: () => void;
  toggleMaximize: () => void;
  showDecorations: (decorations: boolean) => void;
  setTranslations: (translations: Record<string, string>) => void;
  i18nOverride: () => Promise<string | false>;
  getStorage: (type: 'settings' | 'cache') => Promise<CrossStorage>;
  openDialog: (options: OpenDialogOptions) => Promise<OpenDialogReturnValue>;
  saveDialog: (options: SaveDialogOptions) => Promise<SaveDialogReturnValue>;
  log: (type: 'info' | 'error' | 'warn', ...args: unknown[]) => void;
  openFile: (path: string) => void;
  ghGet: <T extends GHGet>(options: T) => Promise<GHReturn[T['type']]>;
  setPresence: (options: DiscordPresence) => void;
  getInstallDir: () => Promise<string>;
  isSteam: () => Promise<boolean>;
  /** Spike only: stops the server and starts it again. */
  restartServer?: () => Promise<void>;
  getAppleMusic?: () => Promise<{
    running: boolean;
    playing: boolean;
    track?: string;
    artist?: string;
    album?: string;
    pos?: number;
    dur?: number;
    formatted?: string;
  }>;
  onTrayReset?: (cb: (type: string) => void) => () => void;
  onTrayElevationStep?: (cb: (delta: number) => void) => () => void;
  onTrayElevationReset?: (cb: () => void) => () => void;
  questAudio?: {
    getDevices: () => Promise<QuestAudioDevice[]>;
    connectWifi: (ip: string) => Promise<{ success: boolean; message: string }>;
    enableWirelessFromUsb: (
      serial: string
    ) => Promise<{ success: boolean; message: string; address?: string }>;
    startStream: (
      options: QuestAudioStartOptions
    ) => Promise<{ success: boolean; message?: string }>;
    stopStream: (source: 'output' | 'mic' | 'all') => Promise<{ success: boolean }>;
    getStatus: () => Promise<QuestAudioStatus>;
    installScrcpy: () => Promise<{ success: boolean; message: string }>;
    playTestTone: (channel: TestToneChannel, volume: number) => Promise<boolean>;
  };
  questCapture?: {
    getCapabilities: (serial?: string) => Promise<QuestCaptureCapabilities>;
    startVideo: (
      options: QuestVideoStartOptions
    ) => Promise<{ success: boolean; message?: string }>;
    stopVideo: () => Promise<{ success: boolean }>;
    startStudio: (
      options: QuestStudioStartOptions
    ) => Promise<{ success: boolean; errors: string[] }>;
    stopAll: () => Promise<{ success: boolean }>;
    getStatus: () => Promise<QuestCaptureStatus>;
  };
  requestMicrophoneAccess?: () => Promise<boolean>;
  transcribeNativeSpeech?: (data: {
    audioBase64: string;
    language?: string;
  }) => Promise<{ success: boolean; text?: string; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
