import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IElectronAPI, ServerStatusEvent } from './interface';
import { IPC_CHANNELS } from '../shared';

contextBridge.exposeInMainWorld('electronAPI', {
  onServerStatus: (callback) => {
    const subscription = (_event: IpcRendererEvent, value: ServerStatusEvent) =>
      callback(value);
    ipcRenderer.on(IPC_CHANNELS.SERVER_STATUS, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SERVER_STATUS, subscription);
  },
  openUrl: (url) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_URL, url),
  osStats: () => ipcRenderer.invoke(IPC_CHANNELS.OS_STATS),
  close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_ACTIONS, 'close'),
  hide: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_ACTIONS, 'hide'),
  minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_ACTIONS, 'minimize'),
  toggleMaximize: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_ACTIONS, 'toggle-maximize'),
  getStorage: async (type) => {
    return {
      get: (key) =>
        ipcRenderer.invoke(IPC_CHANNELS.STORAGE, { type, method: 'get', key }),
      set: (key, value) =>
        ipcRenderer.invoke(IPC_CHANNELS.STORAGE, { type, method: 'set', key, value }),
      delete: (key) =>
        ipcRenderer.invoke(IPC_CHANNELS.STORAGE, { type, method: 'delete', key }),
      save: () => ipcRenderer.invoke(IPC_CHANNELS.STORAGE, { type, method: 'save' }),
    };
  },
  log: (type, ...args) => ipcRenderer.invoke(IPC_CHANNELS.LOG, type, ...args),
  i18nOverride: async () => ipcRenderer.invoke(IPC_CHANNELS.I18N_OVERRIDE),
  showDecorations: () => {},
  setTranslations: () => {},
  openDialog: (options) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_DIALOG, options),
  saveDialog: (options) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_DIALOG, options),
  openConfigFolder: async () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.OPEN_FILE,
      await ipcRenderer.invoke(IPC_CHANNELS.GET_FOLDER, 'config')
    ),
  openLogsFolder: async () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.OPEN_FILE,
      await ipcRenderer.invoke(IPC_CHANNELS.GET_FOLDER, 'logs')
    ),
  openFile: (path) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_FILE, path),
  ghGet: (req) => ipcRenderer.invoke(IPC_CHANNELS.GH_FETCH, req),
  setPresence: (options) => ipcRenderer.invoke(IPC_CHANNELS.DISCORD_PRESENCE, options),
  getInstallDir: () => ipcRenderer.invoke(IPC_CHANNELS.GET_FOLDER, 'exe'),
  isSteam: () => ipcRenderer.invoke(IPC_CHANNELS.IS_STEAM),
  getAppleMusic: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APPLE_MUSIC),
  onTrayReset: (cb) => {
    const sub = (_: IpcRendererEvent, type: string) => cb(type);
    ipcRenderer.on('tray-reset', sub);
    return () => ipcRenderer.removeListener('tray-reset', sub);
  },
  onTrayElevationStep: (cb) => {
    const sub = (_: IpcRendererEvent, delta: number) => cb(delta);
    ipcRenderer.on('tray-elevation-step', sub);
    return () => ipcRenderer.removeListener('tray-elevation-step', sub);
  },
  onTrayElevationReset: (cb) => {
    const sub = () => cb();
    ipcRenderer.on('tray-elevation-reset', sub);
    return () => ipcRenderer.removeListener('tray-elevation-reset', sub);
  },
  questAudio: {
    getDevices: () => ipcRenderer.invoke(IPC_CHANNELS.QUEST_AUDIO_DEVICES),
    connectWifi: (ip) => ipcRenderer.invoke(IPC_CHANNELS.QUEST_AUDIO_CONNECT, ip),
    enableWirelessFromUsb: (serial) =>
      ipcRenderer.invoke(IPC_CHANNELS.QUEST_AUDIO_ENABLE_WIFI, serial),
    startStream: (options) =>
      ipcRenderer.invoke(IPC_CHANNELS.QUEST_AUDIO_START, options),
    stopStream: (source) => ipcRenderer.invoke(IPC_CHANNELS.QUEST_AUDIO_STOP, source),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.QUEST_AUDIO_STATUS),
    installScrcpy: () => ipcRenderer.invoke(IPC_CHANNELS.QUEST_AUDIO_INSTALL),
    playTestTone: (channel, volume) =>
      ipcRenderer.invoke(IPC_CHANNELS.QUEST_AUDIO_TEST_TONE, channel, volume),
  },
  questCapture: {
    getCapabilities: (serial) =>
      ipcRenderer.invoke(IPC_CHANNELS.QUEST_CAPTURE_CAPABILITIES, serial),
    startVideo: (options) =>
      ipcRenderer.invoke(IPC_CHANNELS.QUEST_CAPTURE_VIDEO_START, options),
    stopVideo: () => ipcRenderer.invoke(IPC_CHANNELS.QUEST_CAPTURE_VIDEO_STOP),
    startStudio: (options) =>
      ipcRenderer.invoke(IPC_CHANNELS.QUEST_CAPTURE_STUDIO_START, options),
    stopAll: () => ipcRenderer.invoke(IPC_CHANNELS.QUEST_CAPTURE_STOP_ALL),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.QUEST_CAPTURE_STATUS),
  },
  requestMicrophoneAccess: () =>
    ipcRenderer.invoke(IPC_CHANNELS.REQUEST_MICROPHONE_ACCESS),
  transcribeNativeSpeech: (data) =>
    ipcRenderer.invoke(IPC_CHANNELS.NATIVE_SPEECH_TRANSCRIBE, data),
} satisfies IElectronAPI);
