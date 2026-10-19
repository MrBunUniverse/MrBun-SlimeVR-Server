import { spawn, exec, execFile, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { chmod, copyFile, mkdir } from 'fs/promises';
import { join } from 'path';
import os from 'os';
import { getGuiDataFolder } from './paths';
import {
  QuestAudioDevice,
  QuestAudioStartOptions,
  QuestAudioStatus,
} from '../preload/interface';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

let outputProcess: ChildProcess | null = null;
let micProcess: ChildProcess | null = null;

let currentOutputBitrate = 96;
let currentMicBitrate = 96;
let currentOutputBufferMs = 80;
let currentMicBufferMs = 80;
let currentOutputCodec: 'opus' | 'aac' | 'raw' = 'opus';
let currentMicCodec: 'opus' | 'aac' | 'raw' = 'opus';
let activeSerial: string | undefined;
let lastError: string | undefined;

// Cache resolved tool paths
let cachedAdbPath: string | null = null;
let cachedScrcpyPath: string | null = null;
const audioStarts = new Map<
  'output' | 'mic',
  Promise<{ success: boolean; message?: string }>
>();

function isValidSerial(serial: string): boolean {
  return serial.length > 0 && serial.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(serial);
}

function normalizeAdbTarget(ip: string): string | undefined {
  const value = ip.trim();
  const match = value.match(/^\[?([0-9a-fA-F:.]+)\]?(:\d{1,5})?$/);
  if (!match) return undefined;
  const port = match[2] || ':5555';
  const portNumber = Number(port.slice(1));
  if (portNumber < 1 || portNumber > 65535) return undefined;
  return `${match[1]}${port}`;
}

async function terminateProcess(process: ChildProcess | null): Promise<void> {
  if (!process || process.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      if (process.exitCode === null) {
        try {
          process.kill('SIGKILL');
        } catch {
          // The child may have exited between the check and kill.
        }
      }
      finish();
    }, 1500);
    process.once('close', finish);
    process.once('error', finish);
    try {
      process.kill('SIGTERM');
    } catch {
      finish();
    }
  });
}

async function getNamedScrcpyExecutable(
  scrcpyPath: string,
  source: QuestAudioStartOptions['source']
): Promise<string> {
  if (os.platform() !== 'darwin') return scrcpyPath;

  const displayName = source === 'output' ? 'Quest Game Audio' : 'Quest Mic';
  const directory = join(getGuiDataFolder(), 'audio-sources');
  const executable = join(directory, displayName);

  // Loopback uses the executable filename, not argv[0], for command-line
  // applications. A named copy gives the two scrcpy decoders separate,
  // persistent identities without modifying the user's scrcpy installation.
  await mkdir(directory, { recursive: true });
  await copyFile(scrcpyPath, executable);
  await chmod(executable, 0o755);
  return executable;
}

export async function findAdb(): Promise<string | null> {
  if (cachedAdbPath && existsSync(cachedAdbPath)) return cachedAdbPath;

  // 1. Check system PATH
  try {
    const cmd = os.platform() === 'win32' ? 'where adb' : 'which adb';
    const { stdout } = await execAsync(cmd);
    const resolved = stdout.trim().split('\n')[0].trim();
    if (resolved && existsSync(resolved)) {
      cachedAdbPath = resolved;
      return resolved;
    }
  } catch {
    // Ignore and fallback to common locations
  }

  // 2. Platform-specific known paths
  const homedir = os.homedir();
  const candidatePaths: string[] = [];

  if (os.platform() === 'darwin') {
    candidatePaths.push(
      '/opt/homebrew/bin/adb',
      '/usr/local/bin/adb',
      join(homedir, 'Library/Android/sdk/platform-tools/adb'),
      '/Applications/SideQuest.app/Contents/Resources/app.asar.unpacked/build/platform-tools/adb'
    );
  } else if (os.platform() === 'win32') {
    candidatePaths.push(
      'C:\\platform-tools\\adb.exe',
      'C:\\scrcpy\\adb.exe',
      join(homedir, 'AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe'),
      join(
        homedir,
        'AppData\\Local\\Programs\\SideQuest\\resources\\app.asar.unpacked\\build\\platform-tools\\adb.exe'
      )
    );
  } else {
    candidatePaths.push(
      '/usr/bin/adb',
      '/usr/local/bin/adb',
      join(homedir, 'Android/Sdk/platform-tools/adb')
    );
  }

  for (const p of candidatePaths) {
    if (existsSync(p)) {
      cachedAdbPath = p;
      return p;
    }
  }

  return null;
}

export async function findScrcpy(): Promise<string | null> {
  if (cachedScrcpyPath && existsSync(cachedScrcpyPath)) return cachedScrcpyPath;

  // 1. Check system PATH
  try {
    const cmd = os.platform() === 'win32' ? 'where scrcpy' : 'which scrcpy';
    const { stdout } = await execAsync(cmd);
    const resolved = stdout.trim().split('\n')[0].trim();
    if (resolved && existsSync(resolved)) {
      cachedScrcpyPath = resolved;
      return resolved;
    }
  } catch {
    // Ignore and check common paths
  }

  // 2. Common paths
  const candidatePaths: string[] = [];
  if (os.platform() === 'darwin') {
    candidatePaths.push('/opt/homebrew/bin/scrcpy', '/usr/local/bin/scrcpy');
  } else if (os.platform() === 'win32') {
    candidatePaths.push(
      'C:\\scrcpy\\scrcpy.exe',
      'C:\\Program Files\\scrcpy\\scrcpy.exe'
    );
  } else {
    candidatePaths.push('/usr/bin/scrcpy', '/usr/local/bin/scrcpy', '/snap/bin/scrcpy');
  }

  for (const p of candidatePaths) {
    if (existsSync(p)) {
      cachedScrcpyPath = p;
      return p;
    }
  }

  return null;
}

export async function getAdbDevices(): Promise<QuestAudioDevice[]> {
  const adb = await findAdb();
  if (!adb) return [];

  try {
    const { stdout } = await execAsync(`"${adb}" devices -l`);
    const lines = stdout.split('\n');
    const devices: QuestAudioDevice[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const id = parts[0];
        const state = parts[1];

        // Parse model if available
        let model = 'Android Device';
        for (const part of parts) {
          if (part.startsWith('model:')) {
            model = part.replace('model:', '').replace(/_/g, ' ');
          }
        }

        const isWifi = id.includes(':');
        devices.push({
          id,
          model,
          connection: isWifi ? 'wifi' : 'usb',
          state,
        });
      }
    }

    return devices;
  } catch (err: any) {
    lastError = `Failed to query ADB devices: ${err.message}`;
    return [];
  }
}

export async function connectAdbWifi(
  ip: string
): Promise<{ success: boolean; message: string }> {
  const adb = await findAdb();
  if (!adb) {
    return {
      success: false,
      message: 'ADB binary not found. Please install adb or SideQuest.',
    };
  }

  const target = normalizeAdbTarget(ip);
  if (!target) return { success: false, message: 'Invalid Quest IP address or port.' };
  try {
    const { stdout } = await execFileAsync(adb, ['connect', target]);
    const success =
      stdout.toLowerCase().includes('connected') &&
      !stdout.toLowerCase().includes('failed');
    return { success, message: stdout.trim() };
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection failed' };
  }
}

export async function enableWirelessAdb(
  serial: string
): Promise<{ success: boolean; message: string; address?: string }> {
  const adb = await findAdb();
  if (!adb) {
    return { success: false, message: 'ADB binary not found.' };
  }
  if (!isValidSerial(serial))
    return { success: false, message: 'Invalid ADB device serial.' };

  try {
    const { stdout: route } = await execFileAsync(adb, [
      '-s',
      serial,
      'shell',
      'ip',
      'route',
    ]);
    const ip = route.match(/\bsrc\s+(\d{1,3}(?:\.\d{1,3}){3})\b/)?.[1];
    if (!ip) {
      return {
        success: false,
        message: 'Could not determine the Quest Wi-Fi address from USB ADB.',
      };
    }

    await execFileAsync(adb, ['-s', serial, 'tcpip', '5555']);

    // Quest briefly drops the USB transport while adbd switches to TCP mode.
    // Restarting the host daemon is required on some macOS/ADB combinations;
    // without it, adb can keep returning a stale "No route to host" result.
    await execFileAsync(adb, ['kill-server']).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 750));
    await execFileAsync(adb, ['start-server']);

    const target = `${ip}:5555`;
    let lastMessage = `Could not connect to ${target}.`;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { stdout, stderr } = await execFileAsync(adb, ['connect', target]);
        const message = `${stdout}${stderr}`.trim();
        lastMessage = message || lastMessage;
        if (
          message.toLowerCase().includes('connected') &&
          !message.toLowerCase().includes('failed')
        ) {
          return {
            success: true,
            message: `Wireless ADB enabled at ${target}. You can unplug USB now.`,
            address: ip,
          };
        }
      } catch (err: any) {
        lastMessage = err.message || lastMessage;
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }

    return { success: false, message: lastMessage, address: ip };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Could not enable wireless ADB from USB.',
    };
  }
}

export async function startAudioStream(
  options: QuestAudioStartOptions
): Promise<{ success: boolean; message?: string }> {
  if (options.serial && !isValidSerial(options.serial)) {
    return { success: false, message: 'Invalid ADB device serial.' };
  }
  if (
    options.bitrate !== undefined &&
    (!Number.isFinite(options.bitrate) || options.bitrate < 8 || options.bitrate > 1024)
  ) {
    return { success: false, message: 'Invalid audio bitrate.' };
  }
  if (
    options.bufferMs !== undefined &&
    (!Number.isFinite(options.bufferMs) ||
      options.bufferMs < 0 ||
      options.bufferMs > 2000)
  ) {
    return { success: false, message: 'Invalid audio buffer.' };
  }
  const existingStart = audioStarts.get(options.source);
  if (existingStart) return existingStart;
  const start = startAudioStreamInternal(options);
  audioStarts.set(options.source, start);
  try {
    return await start;
  } finally {
    audioStarts.delete(options.source);
  }
}

async function startAudioStreamInternal(
  options: QuestAudioStartOptions
): Promise<{ success: boolean; message?: string }> {
  const scrcpy = await findScrcpy();
  if (!scrcpy) {
    const installHint =
      os.platform() === 'darwin'
        ? 'scrcpy not found. Install via: brew install scrcpy'
        : 'scrcpy not found. Download from: https://github.com/Genymobile/scrcpy/releases';
    lastError = installHint;
    return { success: false, message: installHint };
  }

  const adb = await findAdb();

  const isOutput = options.source === 'output';
  const currentProc = isOutput ? outputProcess : micProcess;

  if (currentProc && !currentProc.killed) {
    return {
      success: true,
      message: `${isOutput ? 'Game Audio' : 'Microphone'} stream is already active`,
    };
  }

  const bitrate = options.bitrate || 96;
  const bufferMs = options.bufferMs || 80;
  const codec = options.codec || 'opus';

  const args: string[] = [
    '--no-video',
    '--no-window',
    `--audio-source=${options.source}`,
    `--audio-codec=${codec}`,
    `--audio-buffer=${bufferMs}`,
    '--stay-awake',
  ];

  if (codec !== 'raw') {
    args.push(`--audio-bit-rate=${bitrate}K`);
  }

  if (options.serial) {
    args.push('-s', options.serial);
  }

  const env = { ...process.env };
  if (adb) {
    // Ensure scrcpy uses the resolved adb binary
    env.ADB = adb;
  }

  try {
    const streamExecutable = await getNamedScrcpyExecutable(scrcpy, options.source);
    const proc = spawn(streamExecutable, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (isOutput) {
      outputProcess = proc;
      currentOutputBitrate = bitrate;
      currentOutputBufferMs = bufferMs;
      currentOutputCodec = codec;
    } else {
      micProcess = proc;
      currentMicBitrate = bitrate;
      currentMicBufferMs = bufferMs;
      currentMicCodec = codec;
    }

    if (options.serial) {
      activeSerial = options.serial;
    }

    proc.stderr?.on('data', (data) => {
      const msg = data.toString();
      if (msg.toLowerCase().includes('error')) {
        lastError = msg.trim();
      }
    });

    proc.on('error', (error) => {
      if (isOutput) outputProcess = null;
      else micProcess = null;
      lastError = `Failed to start scrcpy (${options.source}): ${error.message}`;
    });

    proc.on('exit', (code) => {
      if (isOutput) {
        outputProcess = null;
      } else {
        micProcess = null;
      }
      if (code !== 0 && code !== null) {
        lastError = `scrcpy (${options.source}) exited with code ${code}`;
      }
    });

    return { success: true };
  } catch (err: any) {
    lastError = `Failed to spawn scrcpy: ${err.message}`;
    return { success: false, message: err.message };
  }
}

export async function stopAudioStream(
  source: 'output' | 'mic' | 'all'
): Promise<{ success: boolean }> {
  if (source === 'output' || source === 'all') {
    if (outputProcess && !outputProcess.killed) {
      const process = outputProcess;
      outputProcess = null;
      await terminateProcess(process);
    }
  }

  if (source === 'mic' || source === 'all') {
    if (micProcess && !micProcess.killed) {
      const process = micProcess;
      micProcess = null;
      await terminateProcess(process);
    }
  }

  return { success: true };
}

export async function getQuestAudioStatus(): Promise<QuestAudioStatus> {
  const adbPath = await findAdb();
  const scrcpyPath = await findScrcpy();

  return {
    isStreamingOutput: outputProcess !== null && !outputProcess.killed,
    isStreamingMic: micProcess !== null && !micProcess.killed,
    outputBitrate: currentOutputBitrate,
    micBitrate: currentMicBitrate,
    outputBufferMs: currentOutputBufferMs,
    micBufferMs: currentMicBufferMs,
    outputCodec: currentOutputCodec,
    micCodec: currentMicCodec,
    activeSerial,
    scrcpyAvailable: scrcpyPath !== null,
    adbAvailable: adbPath !== null,
    adbPath: adbPath || undefined,
    scrcpyPath: scrcpyPath || undefined,
    error: lastError,
  };
}

export async function installScrcpy(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const platform = os.platform();

    if (platform === 'darwin') {
      // Find brew
      let brewPath = '/opt/homebrew/bin/brew';
      if (!existsSync(brewPath)) {
        brewPath = '/usr/local/bin/brew';
      }
      if (!existsSync(brewPath)) {
        try {
          const { stdout } = await execAsync('which brew');
          brewPath = stdout.trim();
        } catch {
          brewPath = '';
        }
      }

      if (!brewPath || !existsSync(brewPath)) {
        return {
          success: false,
          message:
            'Homebrew is not installed. Please install Homebrew from brew.sh first, or install scrcpy manually.',
        };
      }

      // Execute brew install scrcpy
      // Ensure PATH includes /opt/homebrew/bin and /usr/local/bin
      const env = {
        ...process.env,
        PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:${process.env.PATH || ''}`,
      };

      await execAsync(`"${brewPath}" install scrcpy`, { env, timeout: 300000 });

      // Invalidate cache and re-check
      cachedScrcpyPath = null;
      const found = await findScrcpy();
      if (found) {
        return {
          success: true,
          message: 'scrcpy successfully installed via Homebrew!',
        };
      }
      return {
        success: false,
        message: 'Homebrew completed but scrcpy binary was not found.',
      };
    } else if (platform === 'win32') {
      // Check winget
      try {
        await execAsync(
          'winget install Genymobile.scrcpy --silent --accept-package-agreements --accept-source-agreements',
          {
            timeout: 300000,
          }
        );
        cachedScrcpyPath = null;
        const found = await findScrcpy();
        if (found) {
          return {
            success: true,
            message: 'scrcpy installed successfully via Windows Package Manager!',
          };
        }
      } catch {
        // Fallback or suggest manual
      }
      return {
        success: false,
        message:
          'Could not auto-install scrcpy via winget. Please download scrcpy from GitHub.',
      };
    } else {
      // Linux
      try {
        await execAsync('pkexec apt-get update && pkexec apt-get install -y scrcpy', {
          timeout: 300000,
        });
        cachedScrcpyPath = null;
        const found = await findScrcpy();
        if (found) {
          return { success: true, message: 'scrcpy installed successfully via APT!' };
        }
      } catch {
        // Fallback
      }
      return {
        success: false,
        message: 'Could not auto-install scrcpy. Please run: sudo apt install scrcpy',
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Installation failed: ${err.message}`,
    };
  }
}

export async function cleanupQuestAudio(): Promise<void> {
  await stopAudioStream('all');
}
