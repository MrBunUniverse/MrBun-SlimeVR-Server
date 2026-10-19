import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  Menu,
  nativeImage,
  net,
  powerSaveBlocker,
  protocol,
  screen,
  shell,
  session,
  Tray,
  systemPreferences,
} from 'electron';
import { IPC_CHANNELS } from '../shared';
import path, { dirname, join } from 'path';
import open from 'open';
import trayIcon from '../resources/icons/icon.png?asset';
import appleTrayIcon from '../resources/icons/Square30x30Logo.png?asset';
import { readFile, stat } from 'fs/promises';
import { pathToFileURL } from 'node:url';
import { getPlatform, handleIpc, isPortAvailable } from './utils';
import {
  findServerJar,
  findSystemJRE,
  getExeFolder,
  getGuiDataFolder,
  getLogsFolder,
  getServerDataFolder,
  getWindowStateFile,
} from './paths';
import { initStores } from './store';
import { closeLogger, logger } from './logger';

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
import { discordPresence } from './presence';
import { options } from './cli';
import { ServerStatusEvent } from 'electron/preload/interface';
import { mkdir, writeFile } from 'node:fs/promises';
import { MenuItem } from 'electron/main';
import {
  cleanupQuestAudio,
  connectAdbWifi,
  enableWirelessAdb,
  getAdbDevices,
  getQuestAudioStatus,
  installScrcpy,
  startAudioStream,
  stopAudioStream,
} from './quest-audio';
import { cleanupNativeTestTones, playNativeTestTone } from './channel-test-tone';
import {
  cleanupQuestCapture,
  getQuestCaptureCapabilities,
  getQuestCaptureStatus,
  startQuestStudio,
  startQuestVideo,
  stopQuestCapture,
  stopQuestVideo,
} from './quest-capture';
import { transcribeWithMacSpeech } from './mac-speech';

type Stores = Awaited<ReturnType<typeof initStores>>;
let stores: Stores;

// Fixes colors looking washed on linux
// Might affect hdr
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-features', 'WaylandWpColorManagerV1');
  app.commandLine.appendSwitch('force-color-profile', 'srgb');
}

// Keep rendering on the integrated GPU (cooler, leaves the dGPU to games).
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('force_low_power_gpu');
}

app.setPath('userData', getGuiDataFolder());
app.setPath('sessionData', join(getGuiDataFolder(), 'electron'));

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;

handleIpc(IPC_CHANNELS.GH_FETCH, async (e, options) => {
  if (options.type === 'fw-releases') {
    return fetch(
      'https://api.github.com/repos/SlimeVR/SlimeVR-Tracker-ESP/releases'
    ).then((res) => res.json());
  }
  if (options.type === 'asset') {
    if (
      !options.url.startsWith(
        'https://github.com/SlimeVR/SlimeVR-Tracker-ESP/releases/download'
      )
    )
      return null;
    return fetch(options.url).then((res) => res.json());
  }
});

handleIpc(IPC_CHANNELS.OS_STATS, async () => {
  return {
    type: getPlatform(),
  };
});

handleIpc(IPC_CHANNELS.I18N_OVERRIDE, async () => {
  const overridefile = join(getServerDataFolder(), 'override.ftl');
  const exists = await stat(overridefile)
    .then(() => true)
    .catch(() => false);

  if (!exists) return false;
  return readFile(overridefile, { encoding: 'utf-8' });
});

handleIpc(IPC_CHANNELS.LOG, (e, type, ...args) => {
  let payload: Record<string, unknown> = {};
  const messageParts: unknown[] = [];

  args.forEach((arg) => {
    if (arg instanceof Error) {
      payload.err = arg;
    } else if (typeof arg === 'object' && arg !== null) {
      payload = { ...payload, ...arg };
    } else {
      messageParts.push(arg);
    }
  });

  const msg = messageParts.join(' ');

  switch (type) {
    case 'error':
      logger.error(payload, msg);
      break;
    case 'warn':
      logger.warn(payload, msg);
      break;
    default:
      logger.info(payload, msg);
  }
});

handleIpc(IPC_CHANNELS.OPEN_URL, (e, url) => {
  const allowedUrls = [
    /^steam:\/\//,
    /^ms-settings:network$/,
    /^https:\/\/(?:.+\.)?slimevr\.dev(?:\/.+)?$/,
    /^https:\/\/github\.com\/SlimeVR(?:\/.+)?$/,
    /^https:\/\/discord\.gg\/slimevr$/,
  ];
  if (allowedUrls.find((a) => url.match(a))) open(url);
  else logger.error({ url }, 'attempted to open non-whitelisted URL');
});

handleIpc(IPC_CHANNELS.STORAGE, async (e, { type, method, key, value }) => {
  const store = stores[type];
  if (!store) throw new Error(`Storage type ${type} not found`);

  switch (method) {
    case 'get':
      return store.get(key!);
    case 'set':
      return store.set(key!, value);
    case 'delete':
      return store.delete(key!);
    case 'save':
      return store.save();
  }
});

handleIpc(IPC_CHANNELS.DISCORD_PRESENCE, async (e, options) => {
  if (options.enable) {
    if (!discordPresence.state.ready) await discordPresence.connect();
    discordPresence.updateActivity(options.activity, options.iconText);
  } else if (discordPresence.state.ready) {
    discordPresence.destroy();
  }
});

handleIpc(IPC_CHANNELS.OPEN_FILE, (e, folder) => {
  const requestedPath = path.resolve(folder);

  const isAllowed = [getServerDataFolder(), getGuiDataFolder(), getLogsFolder()].some(
    (parent) => {
      const absoluteParent = path.resolve(parent);
      const relative = path.relative(absoluteParent, requestedPath);
      return !relative.includes('..') && !path.isAbsolute(relative);
    }
  );

  if (isAllowed) {
    shell.openPath(requestedPath);
  } else {
    logger.error({ path: requestedPath }, 'Blocked unauthorized path');
  }
});

handleIpc(IPC_CHANNELS.GET_FOLDER, (e, folder) => {
  switch (folder) {
    case 'config':
      return getGuiDataFolder();
    case 'logs':
      return getLogsFolder();
    case 'exe':
      return getExeFolder();
  }
});

handleIpc(IPC_CHANNELS.IS_STEAM, () => {
  return options.steam;
});

handleIpc(IPC_CHANNELS.GET_APPLE_MUSIC, async () => {
  if (process.platform !== 'darwin') {
    return { running: false, playing: false };
  }
  const script = `if application "Music" is running then
tell application "Music"
set pState to (player state as string)
if pState is not "stopped" then
set trk to name of current track
set art to artist of current track
set alb to album of current track
set pos to (player position as integer)
set dur to (duration of current track as integer)
return pState & "||" & trk & "||" & art & "||" & alb & "||" & pos & "||" & dur
else
return "STOPPED"
end if
end tell
else
return "NOT_RUNNING"
end if`;

  try {
    // Bound the call so a hung Music/osascript cannot pile up child processes.
    const { stdout } = await execFileAsync('osascript', ['-e', script], {
      timeout: 3000,
    });
    const trimmed = stdout.trim();

    if (trimmed === 'NOT_RUNNING') {
      return { running: false, playing: false };
    }
    if (trimmed === 'STOPPED') {
      return { running: true, playing: false };
    }

    if (trimmed.includes('||')) {
      const [pState, track, artist, album, posStr, durStr] = trimmed.split('||');
      const isPlaying = pState.toLowerCase() === 'playing';
      const pos = parseInt(posStr, 10) || 0;
      const dur = parseInt(durStr, 10) || 0;
      const posM = Math.floor(pos / 60);
      const posS = String(pos % 60).padStart(2, '0');
      const durM = Math.floor(dur / 60);
      const durS = String(dur % 60).padStart(2, '0');

      return {
        running: true,
        playing: isPlaying,
        track: track || 'Unknown Track',
        artist: artist || 'Unknown Artist',
        album: album || '',
        pos,
        dur,
        formatted: `${track} • ${artist} [${posM}:${posS} / ${durM}:${durS}]`,
      };
    }

    return { running: true, playing: false };
  } catch (err) {
    logger.warn({ err }, 'Failed to query Apple Music via osascript');
    return { running: false, playing: false };
  }
});

handleIpc(IPC_CHANNELS.NATIVE_SPEECH_TRANSCRIBE, async (e, data) => {
  return transcribeWithMacSpeech(data);
});

handleIpc(IPC_CHANNELS.REQUEST_MICROPHONE_ACCESS, async () => {
  if (process.platform !== 'darwin') return true;

  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') return true;
  if (status === 'denied' || status === 'restricted') return false;

  // In Electron development mode the temporary Electron bundle does not
  // contain the app's packaged usage-description keys. Let Chromium's
  // getUserMedia prompt handle the not-determined state there.
  if (!app.isPackaged) return true;

  return systemPreferences.askForMediaAccess('microphone');
});

handleIpc(IPC_CHANNELS.QUEST_AUDIO_DEVICES, async () => {
  return getAdbDevices();
});

handleIpc(IPC_CHANNELS.QUEST_AUDIO_CONNECT, async (e, ip) => {
  return connectAdbWifi(ip);
});

handleIpc(IPC_CHANNELS.QUEST_AUDIO_ENABLE_WIFI, async (e, serial) => {
  return enableWirelessAdb(serial);
});

handleIpc(IPC_CHANNELS.QUEST_AUDIO_START, async (e, options) => {
  return startAudioStream(options);
});

handleIpc(IPC_CHANNELS.QUEST_AUDIO_STOP, async (e, source) => {
  return stopAudioStream(source);
});

handleIpc(IPC_CHANNELS.QUEST_AUDIO_STATUS, async () => {
  return getQuestAudioStatus();
});

handleIpc(IPC_CHANNELS.QUEST_AUDIO_INSTALL, async () => {
  return installScrcpy();
});

handleIpc(IPC_CHANNELS.QUEST_AUDIO_TEST_TONE, async (e, channel, volume) => {
  return playNativeTestTone(channel, volume);
});

handleIpc(IPC_CHANNELS.QUEST_CAPTURE_CAPABILITIES, async (e, serial) => {
  return getQuestCaptureCapabilities(serial);
});

handleIpc(IPC_CHANNELS.QUEST_CAPTURE_VIDEO_START, async (e, options) => {
  return startQuestVideo(options);
});

handleIpc(IPC_CHANNELS.QUEST_CAPTURE_VIDEO_STOP, async () => {
  return stopQuestVideo();
});

handleIpc(IPC_CHANNELS.QUEST_CAPTURE_STUDIO_START, async (e, options) => {
  return startQuestStudio(options);
});

handleIpc(IPC_CHANNELS.QUEST_CAPTURE_STOP_ALL, async () => {
  return stopQuestCapture();
});

handleIpc(IPC_CHANNELS.QUEST_CAPTURE_STATUS, async () => {
  return getQuestCaptureStatus();
});

const defaultWindowState: {
  width: number;
  height: number;
  x?: number;
  y?: number;
} = {
  width: 960.0,
  height: 680.0,
  x: undefined,
  y: undefined,
};

const windowState = await readFile(getWindowStateFile(), {
  encoding: 'utf-8',
})
  .then((data) => JSON.parse(data))
  .catch(() => {
    logger.error('Failed to load window state, using defaults');
    return defaultWindowState;
  });

const MIN_WIDTH = 380;
const MIN_HEIGHT = 560;

function validateWindowState(state: typeof defaultWindowState) {
  if (state.x === undefined || state.y === undefined) {
    return state;
  }

  const displays = screen.getAllDisplays();

  const isVisible = displays.some((display) => {
    return (
      state.x! >= display.bounds.x &&
      state.y! >= display.bounds.y &&
      state.x! + state.width <= display.bounds.x + display.bounds.width &&
      state.y! + state.height <= display.bounds.y + display.bounds.height
    );
  });

  const minWidth = MIN_WIDTH;
  const minHeight = MIN_HEIGHT;

  if (!isVisible || state.width < minWidth || state.height < minHeight) {
    return defaultWindowState;
  }

  return state;
}

const saveWindowState = async () => {
  await mkdir(dirname(getWindowStateFile()), { recursive: true });
  await writeFile(getWindowStateFile(), JSON.stringify(windowState), {
    encoding: 'utf-8',
  });
};

// Light themes get an ivory window; everything else a dark one. This colour is
// what shows before the page paints, so it must match the saved theme or the
// window flashes the wrong colour on start.
const LIGHT_THEMES = ['claude', 'trans'];
function getStartupBackground(): string {
  try {
    const raw = stores?.settings.get<string>('config.json');
    const theme = raw ? JSON.parse(raw).theme : undefined;
    if (theme === undefined) return '#FAF9F5'; // default theme is light
    return LIGHT_THEMES.includes(theme) ? '#FAF9F5' : '#14120E';
  } catch {
    return '#14120E';
  }
}

function createWindow() {
  const validatedState = validateWindowState(windowState);
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    icon: trayIcon,
    width: validatedState.width,
    height: validatedState.height,
    x: validatedState.x,
    y: validatedState.y,
    minHeight: MIN_HEIGHT,
    minWidth: MIN_WIDTH,
    movable: true,
    frame: !isMac ? false : false,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 20, y: 7 } : undefined,
    // Keep the desktop surface opaque so macOS does not continuously composite
    // the whole window through vibrancy while the app is idle.
    vibrancy: undefined,
    visualEffectState: undefined,
    backgroundColor: getStartupBackground(),
    // Shown from ready-to-show so an unpainted (white) frame is never visible.
    show: false,
    roundedCorners: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: true,
      devTools: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    if (process.env.DEBUG || process.env.OPEN_DEVTOOLS) {
      mainWindow.webContents.openDevTools();
    }
    mainWindow.webContents.on('console-message', (_e, _level, message) => {
      console.log('[RENDERER LOG]', message);
    });
  } else {
    mainWindow.loadURL('app://./index.html');
  }

  let shown = false;
  const showWindow = () => {
    if (shown) return;
    shown = true;
    mainWindow?.show();
  };
  mainWindow.once('ready-to-show', showWindow);
  // Safety net so the window can never stay hidden if the event is missed.
  setTimeout(showWindow, 4000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  handleIpc('window-actions', (e, action) => {
    if (mainWindow === null) return;
    switch (action) {
      case 'close':
        mainWindow.close();
        break;
      case 'hide':
        mainWindow.hide();
        break;
      case 'minimize':
        mainWindow.minimize();
        break;
      case 'toggle-maximize':
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
        break;
    }
  });

  handleIpc('open-dialog', (e, options) => dialog.showOpenDialog(options));
  handleIpc('save-dialog', (e, options) => dialog.showSaveDialog(options));

  const icon = nativeImage.createFromPath(
    getPlatform() === 'macos' ? appleTrayIcon : trayIcon
  );
  const tray = new Tray(icon);
  tray.setToolTip('SlimeVR');
  tray.on('click', () => {
    mainWindow?.show();
  });
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'SlimeVR • macOS Tray',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show SlimeVR Window',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: 'Hide to Menu Bar',
      click: () => {
        mainWindow?.hide();
      },
    },
    { type: 'separator' },
    {
      label: 'Floor Elevation',
      submenu: [
        {
          label: 'Elevation Up (+1cm) [Ctrl+Alt+Up]',
          click: () => mainWindow?.webContents.send('tray-elevation-step', 1),
        },
        {
          label: 'Elevation Down (-1cm) [Ctrl+Alt+Down]',
          click: () => mainWindow?.webContents.send('tray-elevation-step', -1),
        },
        {
          label: 'Reset Floor (0cm) [Ctrl+Alt+0]',
          click: () => mainWindow?.webContents.send('tray-elevation-reset'),
        },
      ],
    },
    {
      label: 'Quick Calibration',
      submenu: [
        {
          label: 'Yaw Reset [Ctrl+Alt+R]',
          click: () => mainWindow?.webContents.send('tray-reset', 'yaw'),
        },
        {
          label: 'Full Reset (3s) [Ctrl+Alt+F]',
          click: () => mainWindow?.webContents.send('tray-reset', 'full'),
        },
        {
          label: 'Mounting Reset',
          click: () => mainWindow?.webContents.send('tray-reset', 'mounting'),
        },
      ],
    },
    { type: 'separator' },
    { role: 'quit', label: 'Quit SlimeVR' },
  ]);
  tray.setContextMenu(contextMenu);

  // Register global shortcuts for VR convenience
  try {
    globalShortcut.register('CommandOrControl+Alt+R', () => {
      mainWindow?.webContents.send('tray-reset', 'yaw');
    });
    globalShortcut.register('CommandOrControl+Alt+F', () => {
      mainWindow?.webContents.send('tray-reset', 'full');
    });
    globalShortcut.register('CommandOrControl+Alt+Up', () => {
      mainWindow?.webContents.send('tray-elevation-step', 1);
    });
    globalShortcut.register('CommandOrControl+Alt+Down', () => {
      mainWindow?.webContents.send('tray-elevation-step', -1);
    });
    globalShortcut.register('CommandOrControl+Alt+0', () => {
      mainWindow?.webContents.send('tray-elevation-reset');
    });
  } catch (err) {
    logger.warn(err, 'Failed to register global shortcuts');
  }

  const updateWindowState = () => {
    if (!mainWindow) return;

    windowState.minimized = mainWindow.isMinimized();
    if (!mainWindow.isMinimized() && !mainWindow.isMaximized()) {
      const bounds = mainWindow.getBounds();
      windowState.width = bounds.width;
      windowState.height = bounds.height;
      windowState.x = bounds.x;
      windowState.y = bounds.y;
    }
  };

  mainWindow.on('move', updateWindowState);
  mainWindow.on('resize', updateWindowState);
  mainWindow.on('minimize', updateWindowState);
  mainWindow.on('maximize', updateWindowState);

  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();

    menu.append(
      new MenuItem({
        label: 'Inspect Element',
        click: () => {
          mainWindow?.webContents.inspectElement(params.x, params.y);
        },
      })
    );

    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
    menu.append(new MenuItem({ label: 'Paste', role: 'paste' }));

    if (mainWindow) menu.popup({ window: mainWindow });
  });
}

const checkEnvironmentVariables = (): boolean => {
  const disallowedVars = ['_JAVA_OPTIONS', 'JAVA_TOOL_OPTIONS'];

  const set = disallowedVars.filter((env) => !!process.env[env]);
  if (set.length > 0) {
    dialog.showErrorBox(
      'SlimeVR',
      `You have environment variables ${set.join(', ')} set, which may cause the SlimeVR Server to fail to launch properly.`
    );
    app.quit();
    return false;
  }
  return true;
};

const isServerRunning = async () => !(await isPortAvailable(21110));

const spawnServer = async () => {
  if (await isServerRunning()) {
    logger.info(
      { port: 21110 },
      'Server port is already active; reusing the existing server'
    );
    return;
  }

  const serverJar = findServerJar();
  if (!serverJar) {
    logger.info('server jar not found, skipping');
    return;
  }
  const sharedDir = dirname(serverJar);
  const javaBin = await findSystemJRE(sharedDir);
  if (!javaBin) {
    dialog.showErrorBox(
      'SlimeVR',
      'Unable to find a compatible Java version, please download Java 17 or higher'
    );
    app.quit();
    return;
  }

  logger.info({ javaBin, serverJar }, 'Found Java and server jar');
  const platform = getPlatform();

  const serverArgs = ['-Xmx128M', '-jar', serverJar];
  if (options.steam) serverArgs.push('--steam');
  if (options.install) serverArgs.push('--install');
  if (options.noUdev) serverArgs.push('--no-udev');

  serverArgs.push('run');

  const serverProcess = spawn(javaBin, serverArgs, {
    cwd: sharedDir,
    shell: false,
    env:
      platform === 'windows'
        ? {
            ...process.env,
            APPDATA: app.getPath('appData'),
            LOCALAPPDATA: process.env['USERPROFILE']
              ? path.join(process.env['USERPROFILE'], 'AppData', 'Local')
              : undefined,
          }
        : undefined,
  });

  const sendToWindow = (event: ServerStatusEvent) => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed())
      return;
    try {
      mainWindow.webContents.send(IPC_CHANNELS.SERVER_STATUS, event);
    } catch (err) {
      logger.debug(
        { err },
        'Skipped server status update because the renderer is unavailable'
      );
    }
  };

  serverProcess.stdout?.on('data', (message) => {
    sendToWindow({ message: message.toString(), type: 'stdout' });
  });

  serverProcess.stderr?.on('data', (message) => {
    sendToWindow({ message: message.toString(), type: 'stderr' });
  });

  serverProcess.on('error', (err) => {
    if (!isQuitting) logger.info({ err }, 'Error launching the java server');
    if (!isQuitting) app.quit();
  });

  serverProcess.on('exit', (code, signal) => {
    if (!isQuitting) {
      logger.warn({ code, signal }, 'Server process exited unexpectedly');
    }
  });

  const exited = new Promise<void>((resolve) => serverProcess.once('exit', resolve));

  return {
    process: serverProcess,
    close: () => serverProcess.kill(),
    waitForExit: () => exited,
  };
};

const createFolders = async () => {
  await mkdir(getServerDataFolder(), { recursive: true });
  await mkdir(getGuiDataFolder(), { recursive: true });
};

let isQuitting = false;
let powerSaveBlockerId: number | null = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback) => {
        const url = webContents.getURL();
        const isAppContent =
          url.startsWith('app://') ||
          url.startsWith('http://localhost:') ||
          url.startsWith('http://127.0.0.1:');
        callback(permission === 'media' && isAppContent);
      }
    );

    if (process.platform === 'darwin' && app.dock) {
      const dockIcon = nativeImage.createFromPath(trayIcon);
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
      }
    }

    try {
      powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
      logger.info(`Power save blocker started (id: ${powerSaveBlockerId})`);
    } catch (err) {
      logger.warn({ err }, 'Failed to start power save blocker');
    }

    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url);
      const filePath = path.normalize(join(__dirname, '../renderer', pathname));
      return net.fetch(pathToFileURL(filePath).toString(), {
        headers: request.headers,
      });
    });

    try {
      await createFolders();
    } catch (err) {
      logger.error(err, 'Failed to initialize stores');
      dialog.showErrorBox(
        'SlimeVR',
        'Failed to initialize application storage. Please make sure the application has write permissions to its data folder.'
      );
      app.quit();
      return;
    }

    stores = await initStores();
    if (!checkEnvironmentVariables()) return;
    const server = await spawnServer();

    createWindow();

    logger.info('SlimeVR started!');

    app.on('window-all-closed', () => {
      app.quit();
    });

    app.on('before-quit', async (event) => {
      if (isQuitting) return;
      isQuitting = true;
      event.preventDefault();
      logger.info('App quitting, saving...');
      globalShortcut.unregisterAll();
      await cleanupQuestAudio();
      await cleanupQuestCapture();
      await cleanupNativeTestTones();
      if (
        powerSaveBlockerId !== null &&
        powerSaveBlocker.isStarted(powerSaveBlockerId)
      ) {
        powerSaveBlocker.stop(powerSaveBlockerId);
        powerSaveBlockerId = null;
        logger.info('Power save blocker stopped');
      }
      server?.close();
      await server?.waitForExit();
      await stores.settings.save();
      await stores.cache.save();
      discordPresence.destroy();
      await saveWindowState();
      await closeLogger();
      app.exit(0);
    });
  });
}
