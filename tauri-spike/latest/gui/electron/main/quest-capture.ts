import { ChildProcess, execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  QuestCaptureAspect,
  QuestCaptureCapabilities,
  QuestCaptureEye,
  QuestCaptureStatus,
  QuestCropRect,
  QuestStudioStartOptions,
  QuestVideoStartOptions,
} from '../preload/interface';
import { getGuiDataFolder } from './paths';
import {
  findAdb,
  findScrcpy,
  getQuestAudioStatus,
  startAudioStream,
  stopAudioStream,
} from './quest-audio';

const execFileAsync = promisify(execFile);

export const QUEST_MIRROR_WINDOW_TITLE = 'SlimeVR Quest Mirror';
const STARTUP_GRACE_MS = 700;
const CROP_ALIGNMENT = 8;

let videoProcess: ChildProcess | null = null;
let videoStartedAt: number | undefined;
let currentOptions: QuestVideoStartOptions | undefined;
let currentCrop: { width: number; height: number; x: number; y: number } | undefined;
let observedFps: number | undefined;
let videoError: string | undefined;
let adbRoundTripMs: number | undefined;
let qualityAdjustments = 0;
let reconnectAttempts = 0;
let healthTimer: NodeJS.Timeout | undefined;
let reconnectTimer: NodeJS.Timeout | undefined;
let degradedSamples = 0;
let qualityRestartInProgress = false;
const intentionalStops = new WeakSet<ChildProcess>();
let videoStart: Promise<{ success: boolean; message?: string }> | undefined;

function isValidSerial(serial: string): boolean {
  return serial.length > 0 && serial.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(serial);
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

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function alignDown(value: number, alignment = CROP_ALIGNMENT): number {
  return Math.max(alignment, Math.floor(value / alignment) * alignment);
}

export function normalizeVideoOptions(
  input: QuestVideoStartOptions
): QuestVideoStartOptions {
  const allowedProfiles = ['low-latency', 'balanced', 'quality', 'custom'];
  const allowedEyes = ['left', 'right', 'both', 'manual'];
  const allowedAspects = ['source', '16:9', '16:10', '4:3', '1:1'];
  const allowedCodecs = ['h264', 'h265'];
  const allowedRenderers = ['auto', 'metal', 'opengl', 'software'];
  const allowedRotations = [0, 90, 180, 270];

  if (!input || typeof input !== 'object') {
    throw new Error('Capture settings are missing.');
  }

  const profile = allowedProfiles.includes(input.profile)
    ? input.profile
    : 'low-latency';
  const eye = allowedEyes.includes(input.eye) ? input.eye : 'left';
  const aspect = allowedAspects.includes(input.aspect) ? input.aspect : '16:9';
  const codec = allowedCodecs.includes(input.codec) ? input.codec : 'h264';
  const renderer = allowedRenderers.includes(input.renderer) ? input.renderer : 'auto';
  const rotation = allowedRotations.includes(input.rotation) ? input.rotation : 0;

  if (eye === 'manual' && !input.manualCrop) {
    throw new Error('Manual eye mode requires a crop rectangle.');
  }

  let manualCrop: QuestCropRect | undefined;
  if (input.manualCrop) {
    const { x, y, width, height } = input.manualCrop;
    if (![x, y, width, height].every(Number.isFinite)) {
      throw new Error('Manual crop values must be numbers.');
    }
    if (
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > 100 ||
      y + height > 100
    ) {
      throw new Error('Manual crop must stay within the source frame.');
    }
    manualCrop = { x, y, width, height };
  }

  return {
    serial:
      typeof input.serial === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(input.serial)
        ? input.serial
        : undefined,
    profile,
    eye,
    aspect,
    manualCrop,
    codec,
    bitrateMbps: clampInteger(input.bitrateMbps, 2, 30),
    maxSize: clampInteger(input.maxSize, 720, 4096),
    maxFps: clampInteger(input.maxFps, 24, 120),
    bufferMs: clampInteger(input.bufferMs, 0, 250),
    rotation: rotation as 0 | 90 | 180 | 270,
    flipHorizontal: Boolean(input.flipHorizontal),
    alwaysOnTop: Boolean(input.alwaysOnTop),
    borderless: input.borderless !== false,
    windowWidth: clampInteger(input.windowWidth, 480, 3840),
    windowHeight: clampInteger(input.windowHeight, 270, 2160),
    renderer: renderer as QuestVideoStartOptions['renderer'],
    adaptiveQuality: input.adaptiveQuality !== false,
    autoReconnect: input.autoReconnect !== false,
    maxReconnectAttempts: clampInteger(input.maxReconnectAttempts, 1, 5),
  };
}

function aspectRatio(aspect: QuestCaptureAspect): number | undefined {
  switch (aspect) {
    case '16:9':
      return 16 / 9;
    case '16:10':
      return 16 / 10;
    case '4:3':
      return 4 / 3;
    case '1:1':
      return 1;
    default:
      return undefined;
  }
}

export function calculateVideoCrop(
  sourceWidth: number,
  sourceHeight: number,
  eye: QuestCaptureEye,
  aspect: QuestCaptureAspect,
  manualCrop?: QuestCropRect
): { width: number; height: number; x: number; y: number } | undefined {
  const width = alignDown(sourceWidth);
  const height = alignDown(sourceHeight);
  if (width <= 0 || height <= 0) return undefined;

  let crop = { width, height, x: 0, y: 0 };

  if (eye === 'left' || eye === 'right') {
    crop.width = alignDown(width / 2);
    crop.x = eye === 'right' ? alignDown(width - crop.width) : 0;
  } else if (eye === 'manual' && manualCrop) {
    crop = {
      width: alignDown((width * manualCrop.width) / 100),
      height: alignDown((height * manualCrop.height) / 100),
      x: alignDown((width * manualCrop.x) / 100),
      y: alignDown((height * manualCrop.y) / 100),
    };
  }

  const targetRatio = aspectRatio(aspect);
  if (targetRatio) {
    const currentRatio = crop.width / crop.height;
    if (currentRatio > targetRatio) {
      const nextWidth = alignDown(crop.height * targetRatio);
      crop.x += alignDown((crop.width - nextWidth) / 2);
      crop.width = nextWidth;
    } else if (currentRatio < targetRatio) {
      const nextHeight = alignDown(crop.width / targetRatio);
      crop.y += alignDown((crop.height - nextHeight) / 2);
      crop.height = nextHeight;
    }
  }

  if (
    crop.x < 0 ||
    crop.y < 0 ||
    crop.x + crop.width > width ||
    crop.y + crop.height > height
  ) {
    throw new Error('The selected crop falls outside the Quest display.');
  }

  return crop.width === width && crop.height === height && crop.x === 0 && crop.y === 0
    ? undefined
    : crop;
}

async function queryDisplaySize(
  serial?: string
): Promise<{ width: number; height: number } | undefined> {
  const adb = await findAdb();
  if (!adb) return undefined;
  const args = serial ? ['-s', serial, 'shell', 'wm', 'size'] : ['shell', 'wm', 'size'];
  try {
    const { stdout } = await execFileAsync(adb, args, { timeout: 5000 });
    const matches = [...stdout.matchAll(/(\d+)x(\d+)/g)];
    const match = matches.at(-1);
    if (!match) return undefined;
    return { width: Number(match[1]), height: Number(match[2]) };
  } catch {
    return undefined;
  }
}

async function measureAdbRoundTrip(serial?: string): Promise<number | undefined> {
  const adb = await findAdb();
  if (!adb) return undefined;
  const args = serial
    ? ['-s', serial, 'shell', 'echo', 'slimevr-capture-health']
    : ['shell', 'echo', 'slimevr-capture-health'];
  const started = performance.now();
  try {
    await execFileAsync(adb, args, { timeout: 2500 });
    return Math.round(performance.now() - started);
  } catch {
    return undefined;
  }
}

export function downshiftVideoOptions(
  options: QuestVideoStartOptions
): QuestVideoStartOptions | undefined {
  if (options.bitrateMbps > 4) {
    return {
      ...options,
      profile: 'custom',
      bitrateMbps: Math.max(4, options.bitrateMbps - 2),
    };
  }

  const sizes = [720, 1080, 1440, 1920, 2560, 4096];
  const currentSizeIndex = sizes.findLastIndex((size) => size < options.maxSize);
  if (currentSizeIndex >= 0) {
    return { ...options, profile: 'custom', maxSize: sizes[currentSizeIndex] };
  }

  const frameRates = [30, 45, 60, 72, 90];
  const currentFpsIndex = frameRates.findLastIndex((fps) => fps < options.maxFps);
  if (currentFpsIndex >= 0) {
    return { ...options, profile: 'custom', maxFps: frameRates[currentFpsIndex] };
  }
  return undefined;
}

async function restartVideoForQuality(next: QuestVideoStartOptions): Promise<void> {
  if (qualityRestartInProgress) return;
  qualityRestartInProgress = true;
  try {
    qualityAdjustments += 1;
    const previous = videoProcess;
    if (previous && !previous.killed) {
      intentionalStops.add(previous);
      previous.kill('SIGTERM');
    }
    videoProcess = null;
    if (healthTimer) clearInterval(healthTimer);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await startQuestVideo(next, true);
  } finally {
    qualityRestartInProgress = false;
  }
}

function startHealthMonitor(options: QuestVideoStartOptions): void {
  if (healthTimer) clearInterval(healthTimer);
  degradedSamples = 0;
  if (!options.serial?.includes(':')) return;
  healthTimer = setInterval(() => {
    void measureAdbRoundTrip(options.serial).then((roundTrip) => {
      adbRoundTripMs = roundTrip;
      if (!options.adaptiveQuality || roundTrip === undefined) return;
      degradedSamples = roundTrip >= 90 ? degradedSamples + 1 : 0;
      if (degradedSamples < 3 || qualityRestartInProgress) return;
      degradedSamples = 0;
      const next = currentOptions ? downshiftVideoOptions(currentOptions) : undefined;
      if (next) void restartVideoForQuality(next);
    });
  }, 5000);
}

async function getMirrorExecutable(scrcpyPath: string): Promise<string> {
  if (os.platform() !== 'darwin') return scrcpyPath;
  const directory = join(getGuiDataFolder(), 'capture-sources');
  const executable = join(directory, 'Quest Mirror');
  await mkdir(directory, { recursive: true });
  await copyFile(scrcpyPath, executable);
  await chmod(executable, 0o755);
  return executable;
}

export function buildVideoArgs(
  options: QuestVideoStartOptions,
  crop?: { width: number; height: number; x: number; y: number }
): string[] {
  const orientation = `${options.flipHorizontal ? 'flip' : ''}${options.rotation}`;
  const args = [
    '--no-audio',
    '--no-control',
    '--no-clipboard-autosync',
    '--video-source=display',
    `--video-codec=${options.codec}`,
    `--video-bit-rate=${options.bitrateMbps}M`,
    `--max-size=${options.maxSize}`,
    `--max-fps=${options.maxFps}`,
    `--video-buffer=${options.bufferMs}`,
    `--capture-orientation=@${orientation}`,
    '--render-fit=letterbox',
    '--print-fps',
    '--stay-awake',
    `--window-title=${QUEST_MIRROR_WINDOW_TITLE}`,
    `--window-width=${options.windowWidth}`,
    `--window-height=${options.windowHeight}`,
  ];

  if (options.borderless) args.push('--window-borderless');
  if (options.alwaysOnTop) args.push('--always-on-top');
  if (options.renderer !== 'auto') args.push(`--render-driver=${options.renderer}`);
  if (crop) args.push(`--crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
  if (options.serial) args.push('-s', options.serial);
  return args;
}

export async function getQuestCaptureCapabilities(
  serial?: string
): Promise<QuestCaptureCapabilities> {
  const scrcpy = await findScrcpy();
  if (!scrcpy) {
    return {
      platformSupported: os.platform() === 'darwin',
      videoEncoders: [],
      error: 'scrcpy is not installed.',
    };
  }

  let scrcpyVersion: string | undefined;
  let videoEncoders: string[] = [];
  try {
    const { stdout } = await execFileAsync(scrcpy, ['--version'], { timeout: 5000 });
    scrcpyVersion = stdout.match(/scrcpy\s+([^\s]+)/)?.[1];
  } catch {
    // The executable was found, so a missing version is diagnostic only.
  }

  try {
    const args = serial ? ['-s', serial, '--list-encoders'] : ['--list-encoders'];
    const { stdout, stderr } = await execFileAsync(scrcpy, args, { timeout: 12000 });
    videoEncoders = `${stdout}\n${stderr}`
      .split('\n')
      .filter((line) => /video\/avc|video\/hevc/i.test(line))
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    // Encoder discovery requires an authorized device. Defaults still work.
  }

  return {
    platformSupported: os.platform() === 'darwin',
    scrcpyVersion,
    displaySize: await queryDisplaySize(serial),
    videoEncoders,
  };
}

export async function startQuestVideo(
  input: QuestVideoStartOptions,
  internalRestart = false
): Promise<{ success: boolean; message?: string }> {
  if (input.serial && !isValidSerial(input.serial)) {
    return { success: false, message: 'Invalid ADB device serial.' };
  }
  if (videoStart && !internalRestart) return videoStart;
  if (!internalRestart) {
    videoStart = startQuestVideoInternal(input, internalRestart);
    try {
      return await videoStart;
    } finally {
      videoStart = undefined;
    }
  }
  return startQuestVideoInternal(input, internalRestart);
}

async function startQuestVideoInternal(
  input: QuestVideoStartOptions,
  internalRestart: boolean
): Promise<{ success: boolean; message?: string }> {
  if (os.platform() !== 'darwin') {
    return {
      success: false,
      message: 'Quest video capture currently supports macOS only.',
    };
  }
  if (videoProcess && !videoProcess.killed) {
    return { success: true, message: 'Quest mirror is already running.' };
  }

  let options: QuestVideoStartOptions;
  try {
    options = normalizeVideoOptions(input);
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Invalid capture settings.',
    };
  }

  const scrcpy = await findScrcpy();
  if (!scrcpy || !existsSync(scrcpy)) {
    return {
      success: false,
      message: 'scrcpy is not installed or could not be found.',
    };
  }

  const displaySize = await queryDisplaySize(options.serial);
  if (!displaySize && options.eye !== 'both') {
    return {
      success: false,
      message:
        'Could not read the Quest display size required for single-eye cropping.',
    };
  }

  try {
    const crop = displaySize
      ? calculateVideoCrop(
          displaySize.width,
          displaySize.height,
          options.eye,
          options.aspect,
          options.manualCrop
        )
      : undefined;
    const executable = await getMirrorExecutable(scrcpy);
    const adb = await findAdb();
    const env = adb ? { ...process.env, ADB: adb } : process.env;
    const proc = spawn(executable, buildVideoArgs(options, crop), {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    videoProcess = proc;
    videoStartedAt = Date.now();
    currentOptions = options;
    currentCrop = crop;
    observedFps = undefined;
    videoError = undefined;
    if (!internalRestart) {
      qualityAdjustments = 0;
      reconnectAttempts = 0;
    }

    let startupError: string | undefined;
    proc.stderr?.on('data', (data) => {
      const message = String(data).trim();
      const fpsMatch = message.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*fps/i);
      if (fpsMatch) observedFps = Number(fpsMatch[1]);
      if (/error|failed|exception/i.test(message)) {
        videoError = message.slice(-800);
        startupError = videoError;
      }
    });
    proc.on('error', (error) => {
      videoError = error.message;
      startupError = error.message;
    });
    proc.on('exit', (code, signal) => {
      const isCurrentProcess = videoProcess === proc;
      const wasIntentional = intentionalStops.has(proc);
      if (isCurrentProcess) {
        videoProcess = null;
        if (healthTimer) clearInterval(healthTimer);
      }
      if (!wasIntentional && code && code !== 0) {
        videoError =
          videoError ||
          `Quest mirror exited with code ${code}${signal ? ` (${signal})` : ''}.`;
      }
      if (
        !wasIntentional &&
        options.autoReconnect &&
        reconnectAttempts < options.maxReconnectAttempts
      ) {
        reconnectAttempts += 1;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          void startQuestVideo(options, true);
        }, 1200);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, STARTUP_GRACE_MS));
    if (startupError || proc.exitCode !== null || proc.killed) {
      if (videoProcess === proc) videoProcess = null;
      return {
        success: false,
        message: startupError || videoError || 'Quest mirror stopped during startup.',
      };
    }
    startHealthMonitor(options);
    return { success: true };
  } catch (error) {
    videoProcess = null;
    videoError =
      error instanceof Error ? error.message : 'Failed to start Quest mirror.';
    return { success: false, message: videoError };
  }
}

export async function stopQuestVideo(): Promise<{ success: boolean }> {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (healthTimer) clearInterval(healthTimer);
  if (videoProcess && !videoProcess.killed) {
    const process = videoProcess;
    intentionalStops.add(process);
    videoProcess = null;
    await terminateProcess(process);
  }
  videoProcess = null;
  videoStartedAt = undefined;
  adbRoundTripMs = undefined;
  reconnectAttempts = 0;
  return { success: true };
}

export async function startQuestStudio(
  options: QuestStudioStartOptions
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  const video = await startQuestVideo(options.video);
  if (!video.success) errors.push(`Video: ${video.message || 'failed to start'}`);

  if (options.gameAudio) {
    const output = await startAudioStream({
      ...options.gameAudio,
      serial: options.video.serial,
      source: 'output',
    });
    if (!output.success)
      errors.push(`Game audio: ${output.message || 'failed to start'}`);
  }

  if (options.microphone) {
    const mic = await startAudioStream({
      ...options.microphone,
      serial: options.video.serial,
      source: 'mic',
    });
    if (!mic.success) errors.push(`Microphone: ${mic.message || 'failed to start'}`);
  }

  return { success: errors.length === 0, errors };
}

export async function stopQuestCapture(): Promise<{ success: boolean }> {
  await Promise.all([stopQuestVideo(), stopAudioStream('all')]);
  return { success: true };
}

export async function getQuestCaptureStatus(): Promise<QuestCaptureStatus> {
  const audio = await getQuestAudioStatus();
  return {
    ...audio,
    isStreamingVideo: videoProcess !== null && !videoProcess.killed,
    videoPid: videoProcess?.pid,
    videoStartedAt,
    videoCodec: currentOptions?.codec,
    videoBitrateMbps: currentOptions?.bitrateMbps,
    videoMaxSize: currentOptions?.maxSize,
    videoMaxFps: currentOptions?.maxFps,
    videoBufferMs: currentOptions?.bufferMs,
    videoEye: currentOptions?.eye,
    videoAspect: currentOptions?.aspect,
    videoCrop: currentCrop,
    observedFps,
    adbRoundTripMs,
    connectionType: currentOptions
      ? currentOptions.serial?.includes(':')
        ? 'wifi'
        : 'usb'
      : undefined,
    qualityAdjustments,
    reconnectAttempts,
    mirrorWindowTitle: QUEST_MIRROR_WINDOW_TITLE,
    videoError,
  };
}

export async function cleanupQuestCapture(): Promise<void> {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (healthTimer) clearInterval(healthTimer);
  if (videoProcess && !videoProcess.killed) {
    const process = videoProcess;
    intentionalStops.add(videoProcess);
    videoProcess = null;
    await terminateProcess(process);
  }
  videoProcess = null;
}
