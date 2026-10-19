// Provides the same `window.electronAPI` surface that the Electron preload script exposes,
// backed by Tauri commands. The React GUI checks for this object, so it runs unchanged.
// Methods that Tauri doesn't implement yet are no-ops and are listed in tauri-spike/README.md.
(function () {
  if (window.electronAPI) return;

  const invoke = (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args);

  // Same allowlist as the Electron main process (gui/electron/main/index.ts, OPEN_URL).
  const GH_RELEASES_PREFIX = 'https://github.com/SlimeVR/SlimeVR-Tracker-ESP/releases/download';
  const GH_API_RELEASES = 'https://api.github.com/repos/SlimeVR/SlimeVR-Tracker-ESP/releases';

  const toStorageValue = (value) => (value === null ? undefined : value);

  const makeStorage = (kind) => ({
    set: (key, value) => invoke('storage_set', { kind, key, value }),
    get: async (key) => toStorageValue(await invoke('storage_get', { kind, key })),
    delete: (key) => invoke('storage_delete', { kind, key }),
    save: async () => true,
  });

  const windowAction = (action) => invoke('window_action', { action });

  window.electronAPI = {
    // The spike launches the server separately, so there is no status stream yet.
    onServerStatus: () => () => {},
    openUrl: (url) => invoke('open_url', { url }),
    osStats: async () => ({ type: await invoke('os_type') }),
    openLogsFolder: () => invoke('open_folder', { kind: 'logs' }),
    openConfigFolder: () => invoke('open_folder', { kind: 'config' }),
    close: () => windowAction('close'),
    hide: () => windowAction('hide'),
    minimize: () => windowAction('minimize'),
    toggleMaximize: () => windowAction('toggle-maximize'),
    showDecorations: () => {},
    setTranslations: () => {},
    i18nOverride: () => invoke('i18n_override'),
    getStorage: async (type) => makeStorage(type),
    openDialog: (options) => invoke('open_dialog', { options }),
    saveDialog: (options) => invoke('save_dialog', { options }),
    log: (type, ...args) => {
      const fn = type === 'error' ? console.error : type === 'warn' ? console.warn : console.log;
      fn(...args);
    },
    openFile: (path) => invoke('open_path', { path }),
    ghGet: async (options) => {
      if (options.type === 'fw-releases') {
        const res = await fetch(GH_API_RELEASES);
        return res.json();
      }
      if (options.type === 'asset') {
        if (!options.url.startsWith(GH_RELEASES_PREFIX)) return null;
        const res = await fetch(options.url);
        return res.json();
      }
      return null;
    },
    // Discord Rich Presence is not ported yet.
    setPresence: async () => {},
    getInstallDir: () => invoke('get_folder', { kind: 'exe' }),
    isSteam: async () => false,
    restartServer: () => invoke('restart_server'),
    // Same result shape as Electron's GET_APPLE_MUSIC (gui/electron/main/index.ts).
    getAppleMusic: async () => {
      const out = await invoke('apple_music');
      if (out === 'STOPPED') return { running: true, playing: false };
      if (!out.includes('||')) return { running: false, playing: false };
      const [pState, track, artist, album, posStr, durStr] = out.split('||');
      const pos = parseInt(posStr, 10) || 0;
      const dur = parseInt(durStr, 10) || 0;
      const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      return {
        running: true,
        playing: pState.toLowerCase() === 'playing',
        track: track || 'Unknown Track',
        artist: artist || 'Unknown Artist',
        album: album || '',
        pos,
        dur,
        formatted: `${track} • ${artist} [${clock(pos)} / ${clock(dur)}]`,
      };
    },
  };

  // WKWebView ignores `-webkit-app-region: drag`, so the title bar is made draggable here.
  // Clicks on buttons and links inside a drag region still go to those controls.
  document.addEventListener(
    'mousedown',
    (event) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const region = target.closest('[data-electron-drag-region="true"]');
      if (!region) return;
      if (target.closest('button, a, input, select, textarea, [role="button"], .no-user-drag')) return;
      invoke('start_dragging');
    },
    true
  );
})();
