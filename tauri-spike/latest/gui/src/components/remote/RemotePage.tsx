import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import { useElectron } from '@/hooks/electron';
import { Button } from '@/components/commons/Button';
import { PixelIcon } from '@/components/commons/PixelIcon';
import { RemoteIcon } from '@/components/commons/icon/RemoteIcon';
import { TipBox } from '@/components/commons/TipBox';
import { CheckIcon } from '@/components/commons/icon/CheckIcon';
import {
  QuestAudioDevice,
  QuestCaptureStatus,
  QuestVideoStartOptions,
} from 'electron/preload/interface';
import { useQuestCaptureSettings } from '@/hooks/quest-capture';
import { isPawTheme, useConfig } from '@/hooks/config';

// Short labels so the selects never truncate; the detail shows as a hint under the select.
const CODEC_OPTIONS = [
  { value: 'opus', label: 'Opus', hint: 'Low latency · standard' },
  { value: 'aac', label: 'AAC', hint: 'Hardware DSP · anti-glitch' },
  { value: 'raw', label: 'Raw PCM', hint: 'Uncompressed · lossless' },
];

const BITRATE_OPTIONS = [
  { value: 64, label: '64 kbps', hint: 'Fast · low Wi-Fi load' },
  { value: 96, label: '96 kbps', hint: 'Balanced · recommended' },
  { value: 128, label: '128 kbps', hint: 'High quality' },
  { value: 192, label: '192 kbps', hint: 'Studio fidelity' },
];

const BUFFER_OPTIONS = [
  { value: 40, label: '40 ms', hint: 'Ultra-low latency · clean 5 GHz' },
  { value: 60, label: '60 ms', hint: 'Fast · low latency' },
  { value: 80, label: '80 ms', hint: 'Balanced · recommended' },
  { value: 120, label: '120 ms', hint: 'Smooth · jitter-resistant' },
  { value: 160, label: '160 ms', hint: 'Ultra-stable · congested Wi-Fi' },
];

function OptionHint({
  options,
  value,
}: {
  options: { value: string | number; hint: string }[];
  value: string | number;
}) {
  const hint = options.find((opt) => opt.value === value)?.hint;
  if (!hint) return null;
  return (
    <span className="text-ui-2xs leading-snug text-background-30">{hint}</span>
  );
}

/**
 * Web Audio Synthesizer: Plays clear acoustic pings with exponential decay
 * to test channel routing and balance in Loopback, Audio Hijack, and OBS.
 */
function playPingTone(
  audioCtx: AudioContext,
  channel: 'left' | 'right' | 'mono',
  volume: number,
  playNativeTone?: (
    channel: 'left' | 'right' | 'mono',
    volume: number
  ) => Promise<boolean>
) {
  if (playNativeTone) {
    void playNativeTone(channel, volume);
    return;
  }

  const now = audioCtx.currentTime;
  const vol = Math.max(0.01, Math.min(1, volume * 0.45));
  const duration = channel === 'mono' ? 0.35 : 0.25;
  const frameCount = Math.ceil(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(2, frameCount, audioCtx.sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Generate the two PCM channels directly. This keeps the right test tone
  // discrete all the way to Electron's output device, avoiding channel
  // mixing differences in virtual devices and Web Audio panner nodes.
  for (let frame = 0; frame < frameCount; frame++) {
    const time = frame / audioCtx.sampleRate;
    const envelope =
      Math.min(1, time / 0.006) * Math.exp((-7 * time) / duration);
    const baseTone = Math.sin(
      2 * Math.PI * (channel === 'mono' ? 440 : 880) * time
    );
    const monoHarmonic =
      channel === 'mono'
        ? 0.3 * Math.asin(Math.sin(2 * Math.PI * 659.25 * time))
        : 0;
    const sample = (baseTone + monoHarmonic) * envelope * vol;

    if (channel === 'left' || channel === 'mono') left[frame] = sample;
    if (channel === 'right' || channel === 'mono') right[frame] = sample;
  }

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  source.start(now);
}

export function RemotePage() {
  const electron = useElectron();
  const navigate = useNavigate();
  const { settings: captureSettings, isLoaded: captureSettingsLoaded } =
    useQuestCaptureSettings();
  const playNativeTestTone = electron.isElectron
    ? electron.api.questAudio?.playTestTone
    : undefined;

  // Connected ADB devices
  const [devices, setDevices] = useState<QuestAudioDevice[]>([]);
  const [selectedSerial, setSelectedSerial] = useState<string>('');
  const [wifiIp, setWifiIp] = useState<string>('192.168.1.');
  const [isConnectingWifi, setIsConnectingWifi] = useState(false);
  const [isEnablingWifi, setIsEnablingWifi] = useState(false);
  const [wifiMessage, setWifiMessage] = useState<string | null>(null);

  // Bun: the game audio and the headset mic share one tab, so only one of them shows at a time.
  const { config } = useConfig();
  const bun = isPawTheme(config?.theme);
  const [audioTab, setAudioTab] = useState<'game' | 'mic'>('game');

  // Audio Stream Config (persisted to localStorage)
  const [gameCodec, setGameCodec] = useState<'opus' | 'aac' | 'raw'>(() => {
    const saved = localStorage.getItem('slimevr-quest-game-codec');
    return (saved as 'opus' | 'aac' | 'raw') || 'opus';
  });
  const [gameBitrate, setGameBitrate] = useState<number>(() => {
    const saved = localStorage.getItem('slimevr-quest-game-bitrate');
    return saved !== null ? Number(saved) : 96;
  });
  const [gameBufferMs, setGameBufferMs] = useState<number>(() => {
    const saved = localStorage.getItem('slimevr-quest-game-buffer');
    const val = saved !== null ? Number(saved) : 80;
    return val < 40 ? 80 : val;
  });
  const [gameVolume, setGameVolume] = useState<number>(() => {
    const saved = localStorage.getItem('slimevr-quest-game-volume');
    return saved !== null ? Number(saved) : 80;
  });
  const [isStartingGame, setIsStartingGame] = useState(false);

  // Mic Stream Config (persisted to localStorage)
  const [micCodec, setMicCodec] = useState<'opus' | 'aac' | 'raw'>(() => {
    const saved = localStorage.getItem('slimevr-quest-mic-codec');
    return (saved as 'opus' | 'aac' | 'raw') || 'opus';
  });
  const [micBitrate, setMicBitrate] = useState<number>(() => {
    const saved = localStorage.getItem('slimevr-quest-mic-bitrate');
    return saved !== null ? Number(saved) : 96;
  });
  const [micBufferMs, setMicBufferMs] = useState<number>(() => {
    const saved = localStorage.getItem('slimevr-quest-mic-buffer');
    const val = saved !== null ? Number(saved) : 80;
    return val < 40 ? 80 : val;
  });
  const [micVolume, setMicVolume] = useState<number>(() => {
    const saved = localStorage.getItem('slimevr-quest-mic-volume');
    return saved !== null ? Number(saved) : 90;
  });
  const [isStartingMic, setIsStartingMic] = useState(false);

  const handleGameCodecChange = (val: 'opus' | 'aac' | 'raw') => {
    setGameCodec(val);
    localStorage.setItem('slimevr-quest-game-codec', val);
  };

  const handleGameBitrateChange = (val: number) => {
    setGameBitrate(val);
    localStorage.setItem('slimevr-quest-game-bitrate', String(val));
  };

  const handleGameBufferChange = (val: number) => {
    setGameBufferMs(val);
    localStorage.setItem('slimevr-quest-game-buffer', String(val));
  };

  const handleGameVolumeChange = (val: number) => {
    setGameVolume(val);
    localStorage.setItem('slimevr-quest-game-volume', String(val));
  };

  const handleMicCodecChange = (val: 'opus' | 'aac' | 'raw') => {
    setMicCodec(val);
    localStorage.setItem('slimevr-quest-mic-codec', val);
  };

  const handleMicBitrateChange = (val: number) => {
    setMicBitrate(val);
    localStorage.setItem('slimevr-quest-mic-bitrate', String(val));
  };

  const handleMicBufferChange = (val: number) => {
    setMicBufferMs(val);
    localStorage.setItem('slimevr-quest-mic-buffer', String(val));
  };

  const handleMicVolumeChange = (val: number) => {
    setMicVolume(val);
    localStorage.setItem('slimevr-quest-mic-volume', String(val));
  };

  // Stream status from Electron backend
  const [status, setStatus] = useState<QuestCaptureStatus>({
    isStreamingOutput: false,
    isStreamingMic: false,
    isStreamingVideo: false,
    scrcpyAvailable: false,
    adbAvailable: false,
    qualityAdjustments: 0,
    reconnectAttempts: 0,
    mirrorWindowTitle: 'SlimeVR Quest Mirror',
  });
  const [isStartingVideo, setIsStartingVideo] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);

  // Simulated Demo Mode & L/R/Mono Ping Synthesizer State
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [isDemoGameActive, setIsDemoGameActive] = useState<boolean>(false);
  const [isDemoMicActive, setIsDemoMicActive] = useState<boolean>(false);
  const [demoPattern, setDemoPattern] = useState<'all' | 'stereo' | 'mono'>(
    () => {
      const saved = localStorage.getItem('slimevr-quest-demo-pattern');
      return (saved as 'all' | 'stereo' | 'mono') || 'all';
    }
  );
  const [demoVolume, setDemoVolume] = useState<number>(() => {
    const saved = localStorage.getItem('slimevr-quest-demo-volume');
    return saved !== null ? Number(saved) : 45;
  });
  const [isPingLoopRunning, setIsPingLoopRunning] = useState<boolean>(true);
  const [currentPingChannel, setCurrentPingChannel] = useState<
    'left' | 'right' | 'mono' | null
  >(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const handleDemoPatternChange = (pat: 'all' | 'stereo' | 'mono') => {
    setDemoPattern(pat);
    localStorage.setItem('slimevr-quest-demo-pattern', pat);
  };

  const handleDemoVolumeChange = (val: number) => {
    setDemoVolume(val);
    localStorage.setItem('slimevr-quest-demo-volume', String(val));
  };

  const [isInstallingScrcpy, setIsInstallingScrcpy] = useState(false);
  const [installStatusMessage, setInstallStatusMessage] = useState<
    string | null
  >(null);

  const refreshStatus = useCallback(async () => {
    if (!electron.isElectron || !electron.api?.questAudio) return;
    try {
      const [currentStatus, currentDevices] = await Promise.all([
        electron.api.questCapture?.getStatus() ??
          electron.api.questAudio.getStatus().then((audioStatus) => ({
            ...audioStatus,
            isStreamingVideo: false,
            qualityAdjustments: 0,
            reconnectAttempts: 0,
            mirrorWindowTitle: 'SlimeVR Quest Mirror',
          })),
        electron.api.questAudio.getDevices(),
      ]);
      setStatus(currentStatus);
      setDevices(currentDevices);

      if (currentDevices.length > 0 && !selectedSerial) {
        setSelectedSerial(currentDevices[0].id);
      }
    } catch (err) {
      console.error('Failed to query Quest audio status:', err);
    }
  }, [electron, selectedSerial]);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 3000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  // Try to pre-fill wifi IP from standalone config in localStorage
  useEffect(() => {
    const savedIp = localStorage.getItem('slimevr-quest-standalone-ip');
    if (savedIp && savedIp.startsWith('192.168.')) {
      setWifiIp(savedIp);
    }
  }, []);

  const handleConnectWifi = async () => {
    if (!electron.isElectron || !electron.api?.questAudio) return;
    setIsConnectingWifi(true);
    setWifiMessage(null);
    try {
      const res = await electron.api.questAudio.connectWifi(wifiIp.trim());
      setWifiMessage(res.message);
      if (res.success) {
        localStorage.setItem('slimevr-quest-standalone-ip', wifiIp.trim());
      }
      await refreshStatus();
    } catch (err: any) {
      setWifiMessage(err.message || 'Connection failed');
    } finally {
      setIsConnectingWifi(false);
    }
  };

  const handleEnableWirelessFromUsb = async () => {
    const usbDevice = devices.find(
      (device) => device.connection === 'usb' && device.state === 'device'
    );
    if (!electron.isElectron || !electron.api.questAudio || !usbDevice) return;

    setIsEnablingWifi(true);
    setWifiMessage(null);
    try {
      const result = await electron.api.questAudio.enableWirelessFromUsb(
        usbDevice.id
      );
      setWifiMessage(result.message);
      if (result.success && result.address) {
        setWifiIp(result.address);
      }
      await refreshStatus();
    } catch (err: any) {
      setWifiMessage(err.message || 'Could not enable wireless ADB.');
    } finally {
      setIsEnablingWifi(false);
    }
  };

  const handleInstallScrcpy = async () => {
    if (!electron.isElectron || !electron.api?.questAudio) return;
    setIsInstallingScrcpy(true);
    setInstallStatusMessage(
      'Installing scrcpy in background, this may take a moment...'
    );
    try {
      const res = await electron.api.questAudio.installScrcpy();
      if (res.success) {
        setInstallStatusMessage('scrcpy installed successfully!');
      } else {
        setInstallStatusMessage(res.message || 'Installation failed.');
      }
      await refreshStatus();
    } catch (err: any) {
      setInstallStatusMessage(err?.message || 'Installation error occurred.');
    } finally {
      setIsInstallingScrcpy(false);
    }
  };

  // Web Audio Ping Synthesizer Loop: plays Left -> Right -> Mono pings
  useEffect(() => {
    if (
      !isDemoMode ||
      !isPingLoopRunning ||
      (!isDemoGameActive && !isDemoMicActive)
    ) {
      setCurrentPingChannel(null);
      return;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    let stepIndex = 0;

    const runStep = () => {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      let channel: 'left' | 'right' | 'mono';
      if (demoPattern === 'stereo' || (isDemoGameActive && !isDemoMicActive)) {
        channel = stepIndex % 2 === 0 ? 'left' : 'right';
      } else if (
        demoPattern === 'mono' ||
        (!isDemoGameActive && isDemoMicActive)
      ) {
        channel = 'mono';
      } else {
        // 'all': Left -> Right -> Mono cycle
        const seq: Array<'left' | 'right' | 'mono'> = ['left', 'right', 'mono'];
        channel = seq[stepIndex % 3];
      }

      // Fine-tuning volume: Game Volume for Left/Right pings, Mic Gain for Mono chime
      const channelVol =
        channel === 'mono' ? micVolume / 100 : gameVolume / 100;
      const finalVol = channelVol * (demoVolume / 100);

      playPingTone(ctx, channel, finalVol, playNativeTestTone);
      setCurrentPingChannel(channel);

      setTimeout(() => {
        setCurrentPingChannel((prev) => (prev === channel ? null : prev));
      }, 380);

      stepIndex++;
    };

    runStep();
    const interval = setInterval(runStep, 950);

    return () => {
      clearInterval(interval);
      setCurrentPingChannel(null);
    };
  }, [
    isDemoMode,
    isPingLoopRunning,
    isDemoGameActive,
    isDemoMicActive,
    demoPattern,
    demoVolume,
    gameVolume,
    micVolume,
    playNativeTestTone,
  ]);

  // Clean up Web Audio Context on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  const toggleDemoMode = () => {
    setIsDemoMode((prev) => {
      const next = !prev;
      if (next) {
        setIsDemoGameActive(true);
        setIsDemoMicActive(true);
        setIsPingLoopRunning(true);
      } else {
        setIsDemoGameActive(false);
        setIsDemoMicActive(false);
      }
      return next;
    });
  };

  const isGameStreaming =
    status.isStreamingOutput || (isDemoMode && isDemoGameActive);
  const isMicStreaming =
    status.isStreamingMic || (isDemoMode && isDemoMicActive);

  const getVideoOptions = (): QuestVideoStartOptions => {
    return {
      serial: selectedSerial || undefined,
      profile: captureSettings.profile,
      eye: captureSettings.eye,
      aspect: captureSettings.aspect,
      manualCrop: captureSettings.manualCrop,
      codec: captureSettings.codec,
      bitrateMbps: captureSettings.bitrateMbps,
      maxSize: captureSettings.maxSize,
      maxFps: captureSettings.maxFps,
      bufferMs: captureSettings.bufferMs,
      rotation: captureSettings.rotation,
      flipHorizontal: captureSettings.flipHorizontal,
      alwaysOnTop: captureSettings.alwaysOnTop,
      borderless: captureSettings.borderless,
      windowWidth: captureSettings.windowWidth,
      windowHeight: captureSettings.windowHeight,
      renderer: captureSettings.renderer,
      adaptiveQuality: captureSettings.adaptiveQuality,
      autoReconnect: captureSettings.autoReconnect,
      maxReconnectAttempts: captureSettings.maxReconnectAttempts,
    };
  };

  const handleToggleVideo = async () => {
    if (!electron.isElectron || !electron.api.questCapture) return;
    setIsStartingVideo(true);
    setCaptureMessage(null);
    try {
      if (status.isStreamingVideo) {
        await electron.api.questCapture.stopVideo();
      } else {
        const result =
          await electron.api.questCapture.startVideo(getVideoOptions());
        if (!result.success) {
          setCaptureMessage(result.message || 'Quest mirror could not start.');
        }
      }
      await refreshStatus();
    } catch (error) {
      setCaptureMessage(
        error instanceof Error ? error.message : 'Quest mirror could not start.'
      );
    } finally {
      setIsStartingVideo(false);
    }
  };

  const handleStudioSession = async () => {
    if (!electron.isElectron || !electron.api.questCapture) return;
    setIsStartingVideo(true);
    setCaptureMessage(null);
    try {
      if (
        status.isStreamingVideo ||
        status.isStreamingOutput ||
        status.isStreamingMic
      ) {
        await electron.api.questCapture.stopAll();
      } else {
        const result = await electron.api.questCapture.startStudio({
          video: getVideoOptions(),
          gameAudio: captureSettings.gameAudioEnabled
            ? {
                codec: captureSettings.gameAudioCodec,
                bitrate: captureSettings.gameAudioBitrate,
                bufferMs: captureSettings.gameAudioBufferMs,
              }
            : undefined,
          microphone: captureSettings.microphoneEnabled
            ? {
                codec: captureSettings.microphoneCodec,
                bitrate: captureSettings.microphoneBitrate,
                bufferMs: captureSettings.microphoneBufferMs,
              }
            : undefined,
        });
        if (result.errors.length) setCaptureMessage(result.errors.join(' '));
      }
      await refreshStatus();
    } catch (error) {
      setCaptureMessage(
        error instanceof Error ? error.message : 'Studio session failed.'
      );
    } finally {
      setIsStartingVideo(false);
    }
  };

  const handleToggleGameAudio = async () => {
    if (isDemoMode) {
      setIsDemoGameActive((prev) => !prev);
      return;
    }
    if (!electron.isElectron || !electron.api?.questAudio) return;
    setIsStartingGame(true);
    try {
      if (status.isStreamingOutput) {
        await electron.api.questAudio.stopStream('output');
      } else {
        const res = await electron.api.questAudio.startStream({
          serial: selectedSerial || undefined,
          source: 'output',
          codec: gameCodec,
          bitrate: gameBitrate,
          bufferMs: gameBufferMs,
        });
        if (!res.success && res.message) {
          alert(res.message);
        }
      }
      await refreshStatus();
    } catch (err) {
      console.error('Error toggling game audio:', err);
    } finally {
      setIsStartingGame(false);
    }
  };

  const handleToggleMic = async () => {
    if (isDemoMode) {
      setIsDemoMicActive((prev) => !prev);
      return;
    }
    if (!electron.isElectron || !electron.api?.questAudio) return;
    setIsStartingMic(true);
    try {
      if (status.isStreamingMic) {
        await electron.api.questAudio.stopStream('mic');
      } else {
        const res = await electron.api.questAudio.startStream({
          serial: selectedSerial || undefined,
          source: 'mic',
          codec: micCodec,
          bitrate: micBitrate,
          bufferMs: micBufferMs,
        });
        if (!res.success && res.message) {
          alert(res.message);
        }
      }
      await refreshStatus();
    } catch (err) {
      console.error('Error toggling mic:', err);
    } finally {
      setIsStartingMic(false);
    }
  };

  // Why a start button is disabled, shown under it (demo mode needs neither).
  const startBlocker = !status.scrcpyAvailable
    ? 'Install scrcpy first'
    : devices.length === 0
      ? 'Connect a Quest first'
      : null;

  // The page scrolls inside a box sized from the window itself (the top bar, the title strip and the margins are taken off),
  // so the bottom can always be reached, at any window size or zoom.
  return (
    <div className="remote-page relative w-full min-h-0" style={{ height: 'calc(100vh - 100px)' }}>
    <div className="absolute inset-0 flex flex-col gap-3 overflow-y-auto overscroll-contain p-3 pb-28 sm:gap-4 sm:p-5 max-w-5xl mx-auto">
      {/* Top Header Card */}
      <div className="remote-card remote-header flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-background-60 p-3 sm:p-4 rounded-[12px] border border-background-10/[0.08] shadow-xs shrink-0 w-full">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-accent-background-20/10 border border-accent-background-20/20 flex items-center justify-center text-accent-background-10 shrink-0">
            <PixelIcon size={22}>
              <RemoteIcon width={22} height={22} />
            </PixelIcon>
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="font-serif text-ui-md sm:text-ui-lg font-normal tracking-tight text-background-10">
                Quest Remote
              </h1>
              <span className="text-ui-2xs uppercase font-mono px-1.5 py-0.5 rounded-full bg-accent-background-20/15 border border-accent-background-20/30 text-accent-background-10 font-semibold tracking-wide">
                Video + Audio
              </span>
            </div>
            <p className="text-ui-2xs sm:text-ui-2xs text-background-30 font-sans leading-snug mt-0.5">
              Mirror a single Quest eye and route game audio and microphone into
              OBS Studio as separate sources.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0 self-end sm:self-center">
          <div className="inline-flex items-center bg-background-10/[0.04] border border-background-10/[0.08] rounded-full px-0.5 py-0.5 text-ui-2xs font-semibold tracking-wide whitespace-nowrap shadow-xs">
            {status.scrcpyAvailable && (
              <>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-status-success">
                  <CheckIcon
                    size={10}
                    className="fill-status-success shrink-0"
                  />
                  <span>scrcpy Ready</span>
                </span>
                <span className="w-px h-3 bg-background-10/[0.1]" />
              </>
            )}
            <span
              className={classNames(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full',
                status.isStreamingVideo || isGameStreaming || isMicStreaming
                  ? isDemoMode
                    ? 'text-accent-background-10'
                    : 'text-status-success'
                  : devices.length > 0
                    ? 'text-background-10'
                    : 'text-background-30'
              )}
            >
              <span
                className={classNames(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  status.isStreamingVideo || isGameStreaming || isMicStreaming
                    ? isDemoMode
                      ? 'bg-accent-background-20 animate-pulse'
                      : 'bg-status-success animate-pulse'
                    : devices.length > 0
                      ? 'bg-status-success'
                      : 'bg-status-warning'
                )}
              />
              <span>
                {status.isStreamingVideo || isGameStreaming || isMicStreaming
                  ? isDemoMode
                    ? 'Demo Stream Active'
                    : 'Streaming Active'
                  : devices.length > 0
                    ? `${devices.length} Device Connected`
                    : 'Standby'}
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={toggleDemoMode}
            className={classNames(
              'text-ui-2xs px-2 py-0.5 rounded-full border transition-all cursor-pointer select-none font-medium flex items-center gap-1',
              isDemoMode
                ? 'bg-accent-background-20/15 border-accent-background-20/40 text-accent-background-10 shadow-xs'
                : 'bg-background-10/[0.04] border-background-10/[0.08] text-background-30 hover:text-background-10'
            )}
            title="Toggle simulated Quest audio stream with looping L/R/Mono pings for monitoring"
          >
            <span
              className={classNames(
                'w-1.5 h-1.5 rounded-full',
                isDemoMode
                  ? 'bg-accent-background-20 animate-pulse'
                  : 'bg-background-40'
              )}
            />
            <span>{isDemoMode ? 'Demo Active' : 'Audio Demo Mode'}</span>
          </button>
        </div>
      </div>

      {/* Binary Availability Warning if missing */}
      {(!status.scrcpyAvailable || !status.adbAvailable) && (
        <TipBox>
          <span className="flex w-full flex-col items-start justify-between gap-3 text-xs sm:flex-row sm:items-center sm:text-sm">
            <span className="flex flex-col gap-1">
              <span className="font-semibold text-background-10">
                Prerequisite Tools Missing
              </span>
              <span className="flex flex-col gap-1 text-background-20">
                {!status.adbAvailable && (
                  <span>
                    • <b>ADB</b> was not detected. Launch <b>SideQuest</b>, or
                    install it in Terminal with{' '}
                    <code className="font-mono [hyphens:manual]">
                      brew install --cask android-platform-tools
                    </code>
                    . The button below doesn't install it.
                  </span>
                )}
                {!status.scrcpyAvailable && (
                  <span>
                    • <b>scrcpy</b> was not detected. Required for streaming
                    Quest audio and screen.
                  </span>
                )}
              </span>
              {installStatusMessage && (
                <span className="text-xs text-accent-background-10 font-medium mt-0.5">
                  {installStatusMessage}
                </span>
              )}
            </span>

            {!status.scrcpyAvailable && (
              <span className="shrink-0 self-start sm:self-center">
                <Button
                  variant="primary"
                  loading={isInstallingScrcpy}
                  disabled={isInstallingScrcpy}
                  onClick={handleInstallScrcpy}
                  className="text-xs !py-1 whitespace-nowrap !rounded-lg"
                >
                  {isInstallingScrcpy
                    ? 'Installing scrcpy...'
                    : 'Install scrcpy'}
                </Button>
              </span>
            )}
          </span>
        </TipBox>
      )}

      {/* Device Discovery & Wireless Connection Card (Mock-Window Shell) */}
      <div className="remote-card group flex flex-col rounded-[12px] overflow-hidden bg-background-60 border border-background-10/[0.08] shadow-xs hover:border-background-10/[0.18] transition-all duration-200 shrink-0 w-full">
        {/* Mock Window Top Bar */}
        <div className="remote-card__banner relative h-9 w-full bg-background-70 border-b border-background-10/[0.06] overflow-hidden flex items-center justify-between px-3 select-none">
          <svg
            className="absolute inset-0 w-full h-full opacity-15 pointer-events-none stroke-accent-background-20"
            viewBox="0 0 500 44"
            fill="none"
          >
            <path
              d="M-20 15 C 80 40, 160 -10, 240 25 C 300 45, 380 5, 480 30"
              strokeWidth="1.2"
            />
          </svg>

          <div className="relative z-10 flex items-center gap-2">
            <span className="font-serif text-ui-xs font-normal tracking-tight text-background-10 ml-1">
              Connected Headsets
            </span>
          </div>

          <div className="relative z-10 flex items-center gap-1.5">
            <span className="text-ui-2xs font-mono font-medium text-background-30 tracking-wide">
              adb.devices
            </span>
            <button
              type="button"
              onClick={refreshStatus}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] text-ui-2xs font-mono font-medium text-background-20 hover:text-background-10 bg-background-10/[0.06] hover:bg-background-10/[0.1] border border-background-10/[0.08] transition-all cursor-pointer select-none active:scale-95"
              title="Refresh connected ADB devices"
            >
              <svg
                className="w-3 h-3 stroke-current"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-3 sm:p-4 flex flex-col gap-3">
          {devices.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {devices.map((dev) => {
                const isSelected = selectedSerial === dev.id;
                return (
                  <div
                    key={dev.id}
                    onClick={() => setSelectedSerial(dev.id)}
                    className={classNames(
                      'flex items-center justify-between p-2.5 rounded-[10px] border cursor-pointer transition-all',
                      isSelected
                        ? 'bg-accent-background-20/10 border-accent-background-20/40 shadow-xs'
                        : 'bg-background-10/[0.02] border-background-10/[0.06] hover:bg-background-10/[0.04]'
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-ui-2xs font-medium text-background-10">
                        {dev.model}
                      </span>
                      <span className="text-ui-2xs text-background-30 font-mono">
                        {dev.id}
                      </span>
                    </div>
                    <span className="text-ui-2xs px-2 py-0.5 rounded-full bg-background-10/[0.06] border border-background-10/[0.06] font-mono font-semibold text-background-20 uppercase tracking-wide">
                      {dev.connection}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-3 px-3 rounded-[10px] bg-background-10/[0.015] border border-dashed border-background-10/[0.08] text-center">
              <p className="text-ui-2xs text-background-30 font-sans">
                No active Quest detected over USB or Wi-Fi yet. Connect your
                Quest with a cable or pair via wireless IP below.
              </p>
            </div>
          )}

          {/* Wireless IP Quick-Connect Bar */}
          {devices.some(
            (device) => device.connection === 'usb' && device.state === 'device'
          ) && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="text-xs text-background-30 flex-grow">
                USB Quest detected. Enable Wi-Fi ADB automatically, then unplug
                the cable when the connection succeeds.
              </div>
              <Button
                variant="primary"
                className="text-xs !py-1.5 whitespace-nowrap !rounded-[10px]"
                disabled={isEnablingWifi}
                onClick={handleEnableWirelessFromUsb}
              >
                {isEnablingWifi
                  ? 'Enabling Wi-Fi ADB...'
                  : 'Enable Wi-Fi ADB (USB)'}
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-background-10/[0.06]">
            <div className="flex min-w-0 flex-grow basis-[16rem] items-center gap-2">
              <span className="text-xs text-background-30 whitespace-nowrap font-medium">
                Wi-Fi ADB:
              </span>
              <input
                type="text"
                value={wifiIp}
                onChange={(e) => setWifiIp(e.target.value)}
                placeholder="192.168.1.100:5555"
                className="min-w-[20ch] px-2.5 py-1 text-xs bg-background-10/[0.03] border border-background-10/[0.08] rounded-[8px] text-background-10 w-full focus:outline-none focus:border-accent-background-20/60 font-mono transition-colors"
              />
            </div>
            <Button
              variant="secondary"
              className="text-xs !py-1 whitespace-nowrap !rounded-[8px]"
              disabled={isConnectingWifi}
              onClick={handleConnectWifi}
            >
              {isConnectingWifi ? 'Connecting...' : 'Connect Wireless ADB'}
            </Button>
          </div>
          {wifiMessage && (
            <span className="text-xs text-background-30 italic">
              {wifiMessage}
            </span>
          )}
        </div>
      </div>

      {/* Audio Demo & Channel Ping Monitor (Active in Demo Mode) */}
      {isDemoMode && (
        <div className="remote-card flex flex-col rounded-[14px] overflow-hidden bg-background-60 border border-accent-background-20/30 shadow-md transition-all shrink-0 w-full">
          {/* Mock Window Banner */}
          <div className="remote-card__banner relative h-11 w-full bg-background-70 border-b border-background-10/[0.06] overflow-hidden flex items-center justify-between px-3.5 select-none">
            <svg
              className="absolute inset-0 w-full h-full opacity-15 pointer-events-none stroke-accent-background-20"
              viewBox="0 0 500 44"
              fill="none"
            >
              <path
                d="M-20 22 C 80 5, 160 38, 240 18 C 300 3, 380 32, 480 15"
                strokeWidth="1.2"
              />
            </svg>

            <div className="relative z-10 flex items-center gap-2">
              <span className="font-serif text-ui-xs font-normal tracking-tight text-background-10 ml-1.5">
                Looping Channel Monitor & Test Tone Synthesizer
              </span>
            </div>

            <div className="relative z-10 flex items-center gap-2">
              <span className="text-ui-2xs font-mono px-2 py-0.5 rounded-full bg-accent-background-20/15 text-accent-background-10 font-semibold tracking-wide animate-pulse">
                PING GENERATOR ACTIVE
              </span>
              <span className="text-ui-2xs font-mono font-medium text-background-30 tracking-wide">
                audio.monitor.loop
              </span>
            </div>
          </div>

          {/* Monitor Body */}
          <div className="p-4 sm:p-5 flex flex-col gap-4">
            {/* Real-time Visual Channel Ping Indicators */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
              {/* LEFT CHANNEL */}
              <div
                className={classNames(
                  'flex flex-col items-center justify-center p-3 rounded-[12px] border transition-all duration-150 text-center select-none',
                  currentPingChannel === 'left'
                    ? 'bg-accent-background-20/20 border-accent-background-20 shadow-[0_0_15px_rgba(217,119,87,0.35)] scale-[1.02]'
                    : 'bg-background-10/[0.02] border-background-10/[0.08] opacity-70'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={classNames(
                      'w-2 h-2 rounded-full transition-all',
                      currentPingChannel === 'left'
                        ? 'bg-accent-background-20 scale-125 animate-ping'
                        : 'bg-background-40'
                    )}
                  />
                  <span
                    className={classNames(
                      'text-xs font-mono font-bold tracking-wider',
                      currentPingChannel === 'left'
                        ? 'text-accent-background-10'
                        : 'text-background-30'
                    )}
                  >
                    ◄ LEFT
                  </span>
                </div>
                <span className="text-ui-2xs font-mono mt-1 text-background-30">
                  880 Hz • Pan -1.0
                </span>
              </div>

              {/* CENTER / MONO CHIME */}
              <div
                className={classNames(
                  'flex flex-col items-center justify-center p-3 rounded-[12px] border transition-all duration-150 text-center select-none',
                  currentPingChannel === 'mono'
                    ? 'bg-status-success/20 border-status-success shadow-[0_0_15px_rgba(39,201,63,0.35)] scale-[1.02]'
                    : 'bg-background-10/[0.02] border-background-10/[0.08] opacity-70'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={classNames(
                      'w-2 h-2 rounded-full transition-all',
                      currentPingChannel === 'mono'
                        ? 'bg-status-success scale-125 animate-ping'
                        : 'bg-background-40'
                    )}
                  />
                  <span
                    className={classNames(
                      'text-xs font-mono font-bold tracking-wider',
                      currentPingChannel === 'mono'
                        ? 'text-status-success'
                        : 'text-background-30'
                    )}
                  >
                    ● MONO / VOICE
                  </span>
                </div>
                <span className="text-ui-2xs font-mono mt-1 text-background-30">
                  440 Hz • Pan 0.0
                </span>
              </div>

              {/* RIGHT CHANNEL */}
              <div
                className={classNames(
                  'flex flex-col items-center justify-center p-3 rounded-[12px] border transition-all duration-150 text-center select-none',
                  currentPingChannel === 'right'
                    ? 'bg-accent-background-20/20 border-accent-background-20 shadow-[0_0_15px_rgba(217,119,87,0.35)] scale-[1.02]'
                    : 'bg-background-10/[0.02] border-background-10/[0.08] opacity-70'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={classNames(
                      'w-2 h-2 rounded-full transition-all',
                      currentPingChannel === 'right'
                        ? 'bg-accent-background-20 scale-125 animate-ping'
                        : 'bg-background-40'
                    )}
                  />
                  <span
                    className={classNames(
                      'text-xs font-mono font-bold tracking-wider',
                      currentPingChannel === 'right'
                        ? 'text-accent-background-10'
                        : 'text-background-30'
                    )}
                  >
                    RIGHT ►
                  </span>
                </div>
                <span className="text-ui-2xs font-mono mt-1 text-background-30">
                  880 Hz • Pan +1.0
                </span>
              </div>
            </div>

            {/* Pattern & Volume Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-background-10/[0.06]">
              {/* Pattern Mode Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-ui-2xs font-medium text-background-30 mr-1">
                  Pattern:
                </span>
                <button
                  type="button"
                  onClick={() => handleDemoPatternChange('all')}
                  className={classNames(
                    'text-ui-2xs px-2.5 py-1 rounded-[8px] border transition-all font-medium cursor-pointer select-none',
                    demoPattern === 'all'
                      ? 'bg-accent-background-20/15 border-accent-background-20/40 text-accent-background-10'
                      : 'bg-background-10/[0.03] border-background-10/[0.08] text-background-30 hover:text-background-10'
                  )}
                >
                  L → R → Mono
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoPatternChange('stereo')}
                  className={classNames(
                    'text-ui-2xs px-2.5 py-1 rounded-[8px] border transition-all font-medium cursor-pointer select-none',
                    demoPattern === 'stereo'
                      ? 'bg-accent-background-20/15 border-accent-background-20/40 text-accent-background-10'
                      : 'bg-background-10/[0.03] border-background-10/[0.08] text-background-30 hover:text-background-10'
                  )}
                >
                  Stereo (L/R)
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoPatternChange('mono')}
                  className={classNames(
                    'text-ui-2xs px-2.5 py-1 rounded-[8px] border transition-all font-medium cursor-pointer select-none',
                    demoPattern === 'mono'
                      ? 'bg-accent-background-20/15 border-accent-background-20/40 text-accent-background-10'
                      : 'bg-background-10/[0.03] border-background-10/[0.08] text-background-30 hover:text-background-10'
                  )}
                >
                  Mono (Mic Voice)
                </button>
              </div>

              {/* Volume & Loop Toggle */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-ui-2xs font-medium text-background-30 whitespace-nowrap">
                    Volume: {demoVolume}%
                  </span>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={demoVolume}
                    onChange={(e) =>
                      handleDemoVolumeChange(Number(e.target.value))
                    }
                    className="w-20 sm:w-24 accent-accent-background-20 cursor-pointer"
                  />
                </div>

                <Button
                  variant="secondary"
                  className="text-xs !py-1 !px-3 whitespace-nowrap !rounded-[8px]"
                  onClick={() => setIsPingLoopRunning((prev) => !prev)}
                >
                  {isPingLoopRunning ? 'Pause Loop' : 'Resume Loop'}
                </Button>
              </div>
            </div>

            {/* Loopback App Routing Tip */}
            <div className="p-3 rounded-[10px] bg-background-10/[0.02] border border-background-10/[0.06] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-background-20 shrink-0" />
                <span className="text-ui-2xs text-background-20">
                  <b>Loopback / Audio Hijack Tip:</b> In Loopback, click{' '}
                  <b>(+) Add Source</b> → select <b>Electron</b> under{' '}
                  <i>Running Applications</i>. Check{' '}
                  <b>"Mute when capturing"</b> to route cleanly into your
                  virtual mic without headphone feedback.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="remote-audio flex w-full flex-col">
      {/* Bun: one tab switches between the game audio card and the headset mic card. */}
      {bun && (
        <div
          role="tablist"
          aria-label="Audio source"
          className="remote-audio__tabs flex gap-1 p-1 rounded-t-[12px] border border-b-0 border-background-10/[0.1] bg-background-70 shrink-0"
        >
          {(
            [
              ['game', 'Game audio'],
              ['mic', 'Headset mic'],
            ] as const
          ).map(([key, label]) => {
            const live = key === 'game' ? isGameStreaming : isMicStreaming;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={audioTab === key}
                onClick={() => setAudioTab(key)}
                className={classNames(
                  'flex items-center gap-2 rounded-[2px] px-3 py-1 font-mono text-[13px] tracking-wide select-none cursor-pointer transition-colors',
                  audioTab === key
                    ? 'bg-accent-background-30 text-background-90'
                    : 'text-background-30 hover:text-background-10'
                )}
              >
                {label}
                {/* Live dot: filled green while that stream runs, hollow while it is stopped. */}
                <span
                  aria-label={live ? 'Streaming' : 'Stopped'}
                  className={classNames(
                    'inline-block w-[7px] h-[7px] rounded-full',
                    live ? 'bg-status-success' : 'border border-current'
                  )}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Main Streaming Grid: Game Audio & Microphone Cards */}
      <div
        data-audio-tab={audioTab}
        className="grid grid-cols-2 gap-3 sm:gap-4 shrink-0 w-full"
      >
        {/* Card 1: Quest Game Audio */}
        <div className="remote-card remote-stream group flex flex-col rounded-[12px] overflow-hidden bg-background-60 border border-background-10/[0.08] hover:border-background-10/[0.18] shadow-xs hover:shadow-lg transition-all duration-200">
          {/* Banner with Centered Audio Icon */}
          <div className="remote-card__banner relative h-20 sm:h-24 w-full bg-background-70 border-b border-background-10/[0.06] overflow-hidden flex flex-col justify-between p-2.5 select-none">
            <div className="relative z-10 flex items-center justify-end">
              <span className="text-ui-2xs font-mono font-medium text-background-30 tracking-wide">
                audio.output.{gameCodec}
              </span>
            </div>

            <div className="relative z-10 flex items-center justify-center flex-grow group-hover:scale-110 transition-transform duration-200">
              <svg
                className="w-9 h-9 stroke-accent-background-20"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            </div>
          </div>

          {/* Card Body */}
          <div className="p-3 sm:p-4 flex flex-col flex-grow justify-between gap-3">
            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-serif text-ui-sm sm:text-ui-md font-normal tracking-tight text-background-10">
                    Quest Game Audio
                  </h3>
                  <p className="mt-1 text-ui-2xs leading-snug text-background-30 font-sans">
                    Captures internal game sounds, avatar voices, and music
                    (source: output).
                  </p>
                  {bun && isGameStreaming && (
                    <p className="mt-1 text-ui-2xs font-mono text-status-success">
                      Streaming at {gameBitrate} kbps, {gameBufferMs} ms buffer
                    </p>
                  )}
                </div>
                <span
                  className={classNames(
                    'text-ui-2xs font-mono uppercase px-2 py-0.5 rounded-full font-semibold shrink-0 ml-2',
                    isGameStreaming
                      ? isDemoMode && isDemoGameActive
                        ? 'bg-accent-background-20/15 border border-accent-background-20/30 text-accent-background-10 animate-pulse'
                        : 'bg-status-success/15 border border-status-success/30 text-status-success'
                      : 'bg-background-10/[0.06] border border-background-10/[0.06] text-background-30'
                  )}
                >
                  {isGameStreaming
                    ? isDemoMode && isDemoGameActive
                      ? 'Demo Active'
                      : 'Active'
                    : 'Stopped'}
                </span>
              </div>

              {/* Codec Selection Tile */}
              <div className="p-3 rounded-[10px] bg-background-10/[0.02] border border-background-10/[0.06] flex flex-col gap-1.5">
                <span className="text-ui-2xs uppercase font-semibold text-background-30 tracking-wide">
                  Audio Codec
                </span>
                <select
                  value={gameCodec}
                  disabled={isGameStreaming}
                  onChange={(e) =>
                    handleGameCodecChange(
                      e.target.value as 'opus' | 'aac' | 'raw'
                    )
                  }
                  className="bg-background-10/[0.04] border border-background-10/[0.08] rounded-[8px] px-2.5 py-1.5 text-xs text-background-10 focus:outline-none focus:border-accent-background-20/60 transition-colors"
                >
                  {CODEC_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <OptionHint options={CODEC_OPTIONS} value={gameCodec} />
              </div>

              {/* Quality & Bitrate Tuning Metric Tile */}
              <div className="p-3 rounded-[10px] bg-background-10/[0.02] border border-background-10/[0.06] flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-ui-2xs uppercase font-semibold text-background-30 tracking-wide">
                    Bitrate ({gameCodec.toUpperCase()})
                  </span>
                  {gameCodec === 'raw' && (
                    <span className="text-ui-2xs font-mono text-background-30">
                      1.5 Mbps Uncompressed
                    </span>
                  )}
                </div>
                <select
                  value={gameBitrate}
                  disabled={isGameStreaming || gameCodec === 'raw'}
                  onChange={(e) =>
                    handleGameBitrateChange(Number(e.target.value))
                  }
                  className="bg-background-10/[0.04] border border-background-10/[0.08] rounded-[8px] px-2.5 py-1.5 text-xs text-background-10 focus:outline-none focus:border-accent-background-20/60 transition-colors disabled:opacity-40"
                >
                  {BITRATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <OptionHint options={BITRATE_OPTIONS} value={gameBitrate} />
              </div>

              {/* Latency Buffer Tuning Metric Tile */}
              <div className="p-3 rounded-[10px] bg-background-10/[0.02] border border-background-10/[0.06] flex flex-col gap-1.5">
                <span className="text-ui-2xs uppercase font-semibold text-background-30 tracking-wide">
                  Latency Buffer
                </span>
                <select
                  value={gameBufferMs}
                  disabled={isGameStreaming}
                  onChange={(e) =>
                    handleGameBufferChange(Number(e.target.value))
                  }
                  className="bg-background-10/[0.04] border border-background-10/[0.08] rounded-[8px] px-2.5 py-1.5 text-xs text-background-10 focus:outline-none focus:border-accent-background-20/60 transition-colors"
                >
                  {BUFFER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <OptionHint options={BUFFER_OPTIONS} value={gameBufferMs} />
              </div>

              {/* Demo tone level; production gain belongs to the OBS audio graph. */}
              <div className="remote-level p-3 rounded-[10px] bg-background-10/[0.02] border border-background-10/[0.06] flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-ui-2xs uppercase font-semibold text-background-30 tracking-wide">
                    {isDemoMode ? 'Demo Game Volume' : 'Live Level'}
                  </span>
                  <span className="text-ui-2xs font-mono font-medium text-background-30">
                    {isDemoMode ? `${gameVolume}%` : 'Set in OBS mixer'}
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <svg
                    className="w-3.5 h-3.5 stroke-background-30 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={gameVolume}
                    disabled={!isDemoMode}
                    onChange={(e) =>
                      handleGameVolumeChange(Number(e.target.value))
                    }
                    className="w-full accent-accent-background-20 cursor-pointer h-1.5 rounded-lg bg-background-10/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  <svg
                    className="w-3.5 h-3.5 stroke-background-30 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                </div>
              </div>
            </div>

            <Button
              variant={isGameStreaming ? 'secondary' : 'primary'}
              className={classNames(
                'w-full !py-2.5 font-semibold text-xs !rounded-[10px] shadow-sm',
                isGameStreaming && '!bg-status-critical/85 text-white'
              )}
              disabled={
                !isDemoMode && (isStartingGame || !status.scrcpyAvailable)
              }
              onClick={handleToggleGameAudio}
            >
              {isStartingGame
                ? 'Starting...'
                : isGameStreaming
                  ? isDemoMode
                    ? 'Stop Game Audio Demo'
                    : 'Stop Game Audio Stream'
                  : isDemoMode
                    ? 'Start Game Audio Demo'
                    : 'Start Game Audio Stream'}
            </Button>
            {!isDemoMode && !isGameStreaming && !status.scrcpyAvailable && (
              <span className="-mt-1.5 text-center text-ui-2xs text-background-30">
                {startBlocker}
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Quest Headset Microphone */}
        <div className="remote-card remote-stream group flex flex-col rounded-[12px] overflow-hidden bg-background-60 border border-background-10/[0.08] hover:border-background-10/[0.18] shadow-xs hover:shadow-lg transition-all duration-200">
          {/* Banner with Centered Mic Icon */}
          <div className="remote-card__banner relative h-20 sm:h-24 w-full bg-background-70 border-b border-background-10/[0.06] overflow-hidden flex flex-col justify-between p-2.5 select-none">
            <div className="relative z-10 flex items-center justify-end">
              <span className="text-ui-2xs font-mono font-medium text-background-30 tracking-wide">
                audio.mic.{micCodec}
              </span>
            </div>

            <div className="relative z-10 flex items-center justify-center flex-grow group-hover:scale-110 transition-transform duration-200">
              <svg
                className="w-9 h-9 stroke-accent-background-20"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="8" y1="22" x2="16" y2="22" />
              </svg>
            </div>
          </div>

          {/* Card Body */}
          <div className="p-3 sm:p-4 flex flex-col flex-grow justify-between gap-3">
            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-serif text-ui-sm sm:text-ui-md font-normal tracking-tight text-background-10">
                    Quest Headset Mic
                  </h3>
                  <p className="mt-1 text-ui-2xs leading-snug text-background-30 font-sans">
                    Streams your headset voice input separately without feedback
                    (source: mic).
                  </p>
                  {bun && isMicStreaming && (
                    <p className="mt-1 text-ui-2xs font-mono text-status-success">
                      Streaming at {micBitrate} kbps, {micBufferMs} ms buffer
                    </p>
                  )}
                </div>
                <span
                  className={classNames(
                    'text-ui-2xs font-mono uppercase px-2 py-0.5 rounded-full font-semibold shrink-0 ml-2',
                    isMicStreaming
                      ? isDemoMode && isDemoMicActive
                        ? 'bg-accent-background-20/15 border border-accent-background-20/30 text-accent-background-10 animate-pulse'
                        : 'bg-status-success/15 border border-status-success/30 text-status-success'
                      : 'bg-background-10/[0.06] border border-background-10/[0.06] text-background-30'
                  )}
                >
                  {isMicStreaming
                    ? isDemoMode && isDemoMicActive
                      ? 'Demo Active'
                      : 'Active'
                    : 'Stopped'}
                </span>
              </div>

              {/* Codec Selection Tile */}
              <div className="p-3 rounded-[10px] bg-background-10/[0.02] border border-background-10/[0.06] flex flex-col gap-1.5">
                <span className="text-ui-2xs uppercase font-semibold text-background-30 tracking-wide">
                  Audio Codec
                </span>
                <select
                  value={micCodec}
                  disabled={isMicStreaming}
                  onChange={(e) =>
                    handleMicCodecChange(
                      e.target.value as 'opus' | 'aac' | 'raw'
                    )
                  }
                  className="bg-background-10/[0.04] border border-background-10/[0.08] rounded-[8px] px-2.5 py-1.5 text-xs text-background-10 focus:outline-none focus:border-accent-background-20/60 transition-colors"
                >
                  {CODEC_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <OptionHint options={CODEC_OPTIONS} value={micCodec} />
              </div>

              {/* Quality & Bitrate Tuning Metric Tile */}
              <div className="p-3 rounded-[10px] bg-background-10/[0.02] border border-background-10/[0.06] flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-ui-2xs uppercase font-semibold text-background-30 tracking-wide">
                    Bitrate ({micCodec.toUpperCase()} Voice)
                  </span>
                  {micCodec === 'raw' && (
                    <span className="text-ui-2xs font-mono text-background-30">
                      1.5 Mbps Uncompressed
                    </span>
                  )}
                </div>
                <select
                  value={micBitrate}
                  disabled={isMicStreaming || micCodec === 'raw'}
                  onChange={(e) =>
                    handleMicBitrateChange(Number(e.target.value))
                  }
                  className="bg-background-10/[0.04] border border-background-10/[0.08] rounded-[8px] px-2.5 py-1.5 text-xs text-background-10 focus:outline-none focus:border-accent-background-20/60 transition-colors disabled:opacity-40"
                >
                  {BITRATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <OptionHint options={BITRATE_OPTIONS} value={micBitrate} />
              </div>

              {/* Latency Buffer Tuning Metric Tile */}
              <div className="p-3 rounded-[10px] bg-background-10/[0.02] border border-background-10/[0.06] flex flex-col gap-1.5">
                <span className="text-ui-2xs uppercase font-semibold text-background-30 tracking-wide">
                  Latency Buffer
                </span>
                <select
                  value={micBufferMs}
                  disabled={isMicStreaming}
                  onChange={(e) =>
                    handleMicBufferChange(Number(e.target.value))
                  }
                  className="bg-background-10/[0.04] border border-background-10/[0.08] rounded-[8px] px-2.5 py-1.5 text-xs text-background-10 focus:outline-none focus:border-accent-background-20/60 transition-colors"
                >
                  {BUFFER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <OptionHint options={BUFFER_OPTIONS} value={micBufferMs} />
              </div>

              {/* Demo tone level; production gain belongs to the OBS audio graph. */}
              <div className="remote-level p-3 rounded-[10px] bg-background-10/[0.02] border border-background-10/[0.06] flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-ui-2xs uppercase font-semibold text-background-30 tracking-wide">
                    {isDemoMode ? 'Demo Microphone Gain' : 'Live Level'}
                  </span>
                  <span className="text-ui-2xs font-mono font-medium text-background-30">
                    {isDemoMode ? `${micVolume}%` : 'Set in OBS mixer'}
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <svg
                    className="w-3.5 h-3.5 stroke-background-30 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </svg>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={micVolume}
                    disabled={!isDemoMode}
                    onChange={(e) =>
                      handleMicVolumeChange(Number(e.target.value))
                    }
                    className="w-full accent-accent-background-20 cursor-pointer h-1.5 rounded-lg bg-background-10/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  <svg
                    className="w-3.5 h-3.5 stroke-background-30 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                    <line x1="8" y1="22" x2="16" y2="22" />
                  </svg>
                </div>
              </div>
            </div>

            <Button
              variant={isMicStreaming ? 'secondary' : 'primary'}
              className={classNames(
                'w-full !py-2.5 font-semibold text-xs !rounded-[10px] shadow-sm',
                isMicStreaming && '!bg-status-critical/85 text-white'
              )}
              disabled={
                !isDemoMode && (isStartingMic || !status.scrcpyAvailable)
              }
              onClick={handleToggleMic}
            >
              {isStartingMic
                ? 'Starting...'
                : isMicStreaming
                  ? isDemoMode
                    ? 'Stop Microphone Demo'
                    : 'Stop Microphone Stream'
                  : isDemoMode
                    ? 'Start Microphone Demo'
                    : 'Start Microphone Stream'}
            </Button>
            {!isDemoMode && !isMicStreaming && !status.scrcpyAvailable && (
              <span className="-mt-1.5 text-center text-ui-2xs text-background-30">
                {startBlocker}
              </span>
            )}
          </div>
        </div>
      </div>
      </div>

      {/* Quest Mirror Studio */}
      <section className="remote-card w-full overflow-hidden rounded-[14px] border bg-white shadow-xs border-background-10/[0.08] dark:bg-[#1B1915]">
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-serif text-ui-md font-normal tracking-tight text-background-10">
                  Quest Mirror Studio
                </h2>
                <span
                  className={classNames(
                    'rounded-[6px] border px-2 py-0.5 text-ui-2xs font-semibold',
                    status.isStreamingVideo
                      ? 'border-status-success/30 bg-status-success/10 text-[#166534] dark:text-status-success'
                      : 'text-background-30 border-background-10/[0.08] bg-background-10/[0.04]'
                  )}
                >
                  {status.isStreamingVideo ? 'Mirror active' : 'Mirror stopped'}
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-ui-2xs leading-relaxed text-background-30">
                OBS Window Capture source:{' '}
                <span className="font-mono text-background-20">
                  {status.mirrorWindowTitle}
                </span>
                . The mirror is read-only and contains no scrcpy controls.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/settings/quest-capture')}
              className="min-h-10 shrink-0 rounded-[9px] border px-3 text-ui-2xs font-medium text-background-20 hover:text-background-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-40 border-background-10/[0.08] bg-background-10/[0.035] dark:focus-visible:ring-accent-background-20"
            >
              Capture settings
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-[9px] p-3 bg-background-10/[0.03]">
              <span className="block text-ui-2xs font-semibold uppercase tracking-wide text-background-30">
                Eye
              </span>
              <span className="mt-1 block text-ui-xs font-medium capitalize text-background-10">
                {captureSettings.eye}
              </span>
            </div>
            <div className="rounded-[9px] p-3 bg-background-10/[0.03]">
              <span className="block text-ui-2xs font-semibold uppercase tracking-wide text-background-30">
                Output
              </span>
              <span className="mt-1 block text-ui-xs font-medium text-background-10">
                {status.videoAspect || captureSettings.aspect} ·{' '}
                {status.videoMaxFps || captureSettings.maxFps} FPS
              </span>
            </div>
            <div className="rounded-[9px] p-3 bg-background-10/[0.03]">
              <span className="block text-ui-2xs font-semibold uppercase tracking-wide text-background-30">
                Video
              </span>
              <span className="mt-1 block text-ui-xs font-medium uppercase text-background-10">
                {status.videoCodec || captureSettings.codec} ·{' '}
                {status.videoBitrateMbps || captureSettings.bitrateMbps} Mbps
              </span>
            </div>
            <div className="rounded-[9px] p-3 bg-background-10/[0.03]">
              <span className="block text-ui-2xs font-semibold uppercase tracking-wide text-background-30">
                Buffer
              </span>
              <span className="mt-1 block text-ui-xs font-medium text-background-10">
                {status.videoBufferMs ?? captureSettings.bufferMs} ms
              </span>
            </div>
          </div>

          {status.isStreamingVideo && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-[9px] border px-3 py-2 text-ui-2xs text-background-30 border-background-10/[0.07]">
              <span>
                Transport:{' '}
                <strong className="font-medium uppercase text-background-10">
                  {status.connectionType || 'unknown'}
                </strong>
              </span>
              <span>
                ADB round trip:{' '}
                <strong className="font-medium text-background-10">
                  {status.adbRoundTripMs === undefined
                    ? 'measuring'
                    : `${status.adbRoundTripMs} ms`}
                </strong>
              </span>
              <span>
                Observed FPS:{' '}
                <strong className="font-medium text-background-10">
                  {status.observedFps ?? 'waiting'}
                </strong>
              </span>
              {status.qualityAdjustments > 0 && (
                <span>
                  Quality downshifts:{' '}
                  <strong className="font-medium text-background-10">
                    {status.qualityAdjustments}
                  </strong>
                </span>
              )}
              {status.reconnectAttempts > 0 && (
                <span>
                  Reconnect attempts:{' '}
                  <strong className="font-medium text-background-10">
                    {status.reconnectAttempts}
                  </strong>
                </span>
              )}
            </div>
          )}

          {(captureMessage || status.videoError) && (
            <div
              role="alert"
              className="rounded-[9px] border border-status-critical/30 bg-status-critical/10 px-3 py-2 text-ui-2xs leading-relaxed text-[#991B1B] dark:text-status-critical"
            >
              {captureMessage || status.videoError}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant={status.isStreamingVideo ? 'secondary' : 'primary'}
              className="min-h-11 flex-1"
              disabled={
                !captureSettingsLoaded ||
                isStartingVideo ||
                !status.scrcpyAvailable ||
                devices.length === 0
              }
              onClick={handleToggleVideo}
            >
              {isStartingVideo
                ? 'Starting capture...'
                : status.isStreamingVideo
                  ? 'Stop mirror'
                  : 'Start mirror'}
            </Button>
            <Button
              variant={
                status.isStreamingVideo ||
                status.isStreamingOutput ||
                status.isStreamingMic
                  ? 'secondary'
                  : 'primary'
              }
              className="min-h-11 flex-1"
              disabled={
                !captureSettingsLoaded ||
                isStartingVideo ||
                !status.scrcpyAvailable ||
                devices.length === 0
              }
              onClick={handleStudioSession}
            >
              {status.isStreamingVideo ||
              status.isStreamingOutput ||
              status.isStreamingMic
                ? 'Stop studio session'
                : 'Start video + audio + mic'}
            </Button>
          </div>
          {startBlocker && !status.isStreamingVideo && (
            <span className="-mt-1 text-center text-ui-2xs text-background-30">
              {startBlocker}
            </span>
          )}

          <p className="text-ui-2xs leading-relaxed text-background-30">
            Single-eye cropping removes the second eye, but Quest menus,
            notifications, and boundary graphics can still appear when the
            headset composites them into the game frame.
          </p>
        </div>
      </section>
    </div>
    </div>
  );
}
