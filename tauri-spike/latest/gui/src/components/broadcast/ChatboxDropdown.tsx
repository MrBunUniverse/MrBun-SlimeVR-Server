import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  FormEvent,
} from 'react';
import {
  RpcMessage,
  ChangeSettingsRequestT,
  SettingsRequestT,
  SettingsResponseT,
  VRCOSCSettingsT,
  OSCSettingsT,
  TrackerStatus as TrackerStatusEnum,
  BodyPart,
} from 'solarxr-protocol';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import classNames from 'classnames';
import { useAtomValue } from 'jotai';
import { flatTrackersAtom } from '@/store/app-store';
import { demoModeAtom, DEMO_TRACKERS_SET } from '@/store/demo-trackers';
import { useElectron } from '@/hooks/electron';
import { openUrl } from '@/hooks/crossplatform';
import { useOperatingMode } from '@/hooks/operating-mode';
import { useFakeBpm } from '@/hooks/fake-bpm';
import {
  useSpeechDictation,
  SUPPORTED_LANGUAGES,
  DictationFormat,
  DictationActivation,
} from '@/hooks/use-speech-dictation';
import { IconButton } from '@/components/commons/IconButton';
import { SegmentedControl } from '@/components/commons/SegmentedControl';
import { SettingGroup, SettingRow } from '@/components/commons/SettingRow';
import { StatusDot } from '@/components/commons/StatusDot';
import { Toggle } from '@/components/commons/Toggle';
import './ChatboxDropdown.scss';
import {
  HEART_STYLES,
  MUSIC_STYLES,
  useHeartStyle,
  useMusicStyle,
} from './chatbox-styles';

const textInput =
  'h-8 min-w-0 rounded-[8px] border border-[var(--material-border-subtle)] bg-background-10/[0.06] px-2.5 text-ui-xs text-background-10 placeholder-background-30 focus:border-accent-background-20 focus:outline-none';
// The 8px padding and 24px line height selects get elsewhere left 14px for the text in a 32px box and cut it in half.
const selectClass = `${textInput} w-[13rem] max-w-full !py-0 !leading-[1.3] cursor-pointer truncate`;
const primaryButton =
  'inline-flex h-8 cursor-pointer select-none items-center justify-center rounded-[8px] bg-accent-background-20 px-3.5 text-ui-xs font-medium text-white transition-colors hover:bg-accent-background-40 active:scale-[0.98]';
const ghostButton =
  'inline-flex h-8 cursor-pointer select-none items-center justify-center rounded-[8px] px-2.5 text-ui-xs font-medium text-background-20 transition-colors hover:bg-background-10/[0.08] hover:text-background-10';
const dictateButton =
  'flex h-10 w-full cursor-pointer select-none items-center justify-center gap-2 rounded-[10px] text-ui-xs font-medium transition-colors active:scale-[0.99]';

function MicGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

const ZONE_STYLE = {
  resting: { label: 'Resting', className: 'text-status-success' },
  normal: { label: 'Normal', className: 'text-background-20' },
  elevated: { label: 'Elevated', className: 'text-status-warning' },
  cardio: { label: 'Cardio', className: 'text-status-critical' },
} as const;

/** The big number with a heart beating at that rate, and the last five minutes as a line. */
function HeartReadout({
  bpm,
  zone,
  label,
  history,
}: {
  bpm: number | null;
  zone: keyof typeof ZONE_STYLE;
  label: string;
  history: number[];
}) {
  const points = history.length > 1 ? history : null;
  const lo = points ? Math.min(...points) - 3 : 0;
  const hi = points ? Math.max(...points) + 3 : 1;
  return (
    <div className="chatbox-widget flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <svg
            viewBox="0 0 24 24"
            className={classNames(
              'h-6 w-6 shrink-0 fill-status-critical',
              bpm !== null ? 'animate-pulse' : 'opacity-30'
            )}
            style={bpm ? { animationDuration: `${60 / bpm}s` } : undefined}
            aria-hidden="true"
          >
            <path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.3 1.8-2.1 3.3-3.3 5.4-3.3 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z" />
          </svg>
          <span className="tnum text-3xl font-semibold leading-none text-background-10">
            {bpm ?? '—'}
          </span>
          <span className="text-ui-2xs text-background-30">BPM</span>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-ui-2xs">
          {bpm !== null && (
            <span className={classNames('font-medium', ZONE_STYLE[zone].className)}>
              {ZONE_STYLE[zone].label}
            </span>
          )}
          <span className="text-background-30">{label}</span>
        </div>
      </div>
      <svg
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        className="h-8 w-full"
        role="img"
        aria-label={points ? `Last ${points.length * 5} seconds, ${points[0]} to ${points[points.length - 1]} BPM` : 'No history yet'}
      >
        {points ? (
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            className="text-status-critical/70"
            points={points
              .map(
                (v, i) =>
                  `${(i / (points.length - 1)) * 100},${24 - ((v - lo) / (hi - lo)) * 24}`
              )
              .join(' ')}
          />
        ) : (
          <line
            x1="0"
            y1="12"
            x2="100"
            y2="12"
            stroke="currentColor"
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
            className="text-background-10/20"
          />
        )}
      </svg>
    </div>
  );
}

function GearGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function getShortTrackerName(
  name: string | Uint8Array,
  bodyPart?: BodyPart,
  compact = false
): string {
  if (bodyPart != null) {
    switch (bodyPart) {
      case BodyPart.HEAD:
        return 'HMD';
      case BodyPart.NECK:
        return compact ? 'N' : 'Neck';
      case BodyPart.CHEST:
        return compact ? 'Ch' : 'Chest';
      case BodyPart.WAIST:
      case BodyPart.HIP:
        return compact ? 'W' : 'Waist';
      case BodyPart.LEFT_UPPER_LEG:
        return compact ? 'LTh' : 'L-Thigh';
      case BodyPart.RIGHT_UPPER_LEG:
        return compact ? 'RTh' : 'R-Thigh';
      case BodyPart.LEFT_LOWER_LEG:
        return compact ? 'LK' : 'L-Knee';
      case BodyPart.RIGHT_LOWER_LEG:
        return compact ? 'RK' : 'R-Knee';
      case BodyPart.LEFT_FOOT:
        return compact ? 'LF' : 'L-Foot';
      case BodyPart.RIGHT_FOOT:
        return compact ? 'RF' : 'R-Foot';
      case BodyPart.LEFT_LOWER_ARM:
        return compact ? 'LA' : 'L-Arm';
      case BodyPart.RIGHT_LOWER_ARM:
        return compact ? 'RA' : 'R-Arm';
      case BodyPart.LEFT_UPPER_ARM:
        return compact ? 'LS' : 'L-Shldr';
      case BodyPart.RIGHT_UPPER_ARM:
        return compact ? 'RS' : 'R-Shldr';
      case BodyPart.LEFT_HAND:
        return compact ? 'LH' : 'L-Hand';
      case BodyPart.RIGHT_HAND:
        return compact ? 'RH' : 'R-Hand';
    }
  }
  const str = typeof name === 'string' ? name : name.toString();
  const clean = str
    .replace(/\s*Tracker\s*/gi, '')
    .replace(/\s*\/\s*Hip/gi, '')
    .replace(/\s*\(Dead\)/gi, '')
    .replace(/\s*\(Offline\)/gi, '')
    .trim();
  if (compact && clean.length > 5) {
    return clean.slice(0, 4);
  }
  return clean || 'Trk';
}

type BroadcastMode = 'pinned' | 'music' | 'bpm' | 'dictate';

const broadcastModes: BroadcastMode[] = ['dictate', 'pinned', 'music', 'bpm'];
const CHATBOX_PANEL_EXIT_MS = 240;

/**
 * Broadcast control. `side` is a sidebar row (`collapsed` shows the icon
 * only); `top` is a compact pill for the top bar, next to the status cluster.
 */
export function ChatboxDropdown({
  collapsed = false,
  variant = 'side',
}: {
  collapsed?: boolean;
  variant?: 'side' | 'top';
}) {
  const isTop = variant === 'top';
  const [isOpen, setIsOpen] = useState(false);
  const [isPanelMounted, setIsPanelMounted] = useState(false);
  const panelExitTimerRef = useRef<number | null>(null);
  const [view, setView] = useState<'main' | 'settings'>('main');
  const [activeMode, setActiveMode] = useState<BroadcastMode>('dictate');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [message, setMessage] = useState('');
  const [musicStyle, setMusicStyle] = useMusicStyle();
  const [heartStyle, setHeartStyle] = useHeartStyle();
  const [sentMessageFeedback, setSentMessageFeedback] = useState(false);
  const fakeBpm = useFakeBpm();
  const [appleMusicInfo, setAppleMusicInfo] = useState<{
    running: boolean;
    playing: boolean;
    track?: string;
    artist?: string;
    album?: string;
    pos?: number;
    dur?: number;
    formatted?: string;
  }>({ running: false, playing: false });

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const electron = useElectron();
  const { sendRPCPacket, useRPCPacket } = useWebsocketAPI();

  const [targetIp, setTargetIp] = useState<string>('192.168.0.106');
  const [isEditingIp, setIsEditingIp] = useState(false);
  const [inputIpValue, setInputIpValue] = useState('');

  useEffect(() => {
    sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
  }, []);

  useRPCPacket(RpcMessage.SettingsResponse, (settings: SettingsResponseT) => {
    if (settings.vrcOsc?.oscSettings?.address) {
      setTargetIp(settings.vrcOsc.oscSettings.address.toString());
    }
  });

  const saveTargetIp = (newIp: string) => {
    const trimmed = newIp.trim();
    if (trimmed && trimmed !== targetIp) {
      setTargetIp(trimmed);
      const settings = new ChangeSettingsRequestT();
      const vrcOsc = new VRCOSCSettingsT();
      const oscSettings = new OSCSettingsT();
      oscSettings.enabled = true;
      oscSettings.address = trimmed;
      oscSettings.portOut = 9000;
      oscSettings.portIn = 9001;
      vrcOsc.oscSettings = oscSettings;
      vrcOsc.oscqueryEnabled = true;
      settings.vrcOsc = vrcOsc;
      sendRPCPacket(RpcMessage.ChangeSettingsRequest, settings);
    }
    setIsEditingIp(false);
  };

  const {
    floorAnchor,
    setChatboxEnabled,
    setChatboxOnlyMode,
    setChatboxCustomPinnedEnabled,
    setChatboxCustomPinnedText,
    setChatboxAppleMusicEnabled,
    sendChatboxCustomMessage,
  } = useOperatingMode();

  const autoStickyTimerRef = useRef<number>(0);
  const autoStickyTextRef = useRef('');
  const floorAnchorTextRef = useRef<string | undefined>('');
  const dictationStickySecondsRef = useRef(8);

  const dictation = useSpeechDictation(
    (msg) => {
      sendChatboxCustomMessage(msg);
    },
    (text) => {
      setChatboxCustomPinnedText(text);
      setChatboxCustomPinnedEnabled(true);
      autoStickyTextRef.current = text;
      window.clearTimeout(autoStickyTimerRef.current);
      const secs = dictationStickySecondsRef.current;
      if (secs > 0) {
        autoStickyTimerRef.current = window.setTimeout(() => {
          // Only clear what auto-sticky wrote, not a note the user typed since.
          if (floorAnchorTextRef.current === autoStickyTextRef.current) {
            setChatboxCustomPinnedText('');
          }
        }, secs * 1000);
      }
    }
  );
  dictationStickySecondsRef.current = dictation.settings.stickySeconds;
  floorAnchorTextRef.current = floorAnchor.chatboxCustomPinnedText;

  const isDemoMode = useAtomValue(demoModeAtom);
  const flatTrackers = useAtomValue(flatTrackersAtom);

  // Connected active trackers count & list
  const trackerSummaries = useMemo(() => {
    return flatTrackers.map(({ tracker, device }) => {
      const isConnected =
        tracker.status === TrackerStatusEnum.OK ||
        tracker.status === TrackerStatusEnum.BUSY;
      const batteryPct = device?.hardwareStatus?.batteryPctEstimate;
      const batteryVoltage = device?.hardwareStatus?.batteryVoltage;

      let displayBattery = '—';
      if (!isConnected) {
        displayBattery = 'Offline';
      } else if (batteryPct != null) {
        displayBattery = `${Math.round(batteryPct)}%`;
      } else if (batteryVoltage != null && batteryVoltage > 0) {
        displayBattery = `${batteryVoltage.toFixed(1)}V`;
      } else {
        displayBattery = 'Active';
      }

      return {
        id: tracker.trackerId?.trackerNum ?? 0,
        name:
          tracker.info?.customName?.toString() ||
          tracker.info?.displayName?.toString() ||
          'Tracker',
        bodyPart: tracker.info?.bodyPart,
        isConnected,
        batteryPct,
        displayBattery,
      };
    });
  }, [flatTrackers]);

  const connectedCount = trackerSummaries.filter((t) => t.isConnected).length;
  const avgBattery = useMemo(() => {
    const activeWithBattery = trackerSummaries.filter(
      (t) => t.isConnected && t.batteryPct != null
    );
    if (activeWithBattery.length === 0) return null;
    const sum = activeWithBattery.reduce(
      (acc, t) => acc + (t.batteryPct || 0),
      0
    );
    return Math.round(sum / activeWithBattery.length);
  }, [trackerSummaries]);
  // The home screen shows sample trackers in demo mode when none are
  // connected. Those are for looking at the interface only and must never be
  // announced to other players.
  const showingDemoTrackers = flatTrackers === DEMO_TRACKERS_SET;
  const getBatterySummaryText = useCallback(
    (compact = false) => {
      if (showingDemoTrackers) return '';
      const activeTrackers = trackerSummaries.filter((t) => t.isConnected);
      if (activeTrackers.length === 0) return '';
      const parts = activeTrackers.map((t) => {
        const shortName = getShortTrackerName(t.name, t.bodyPart, compact);
        return `${shortName}:${t.displayBattery}`;
      });
      return `🔋 ${parts.join(' ')}`;
    },
    [trackerSummaries, showingDemoTrackers]
  );

  // Poll Apple Music only while its info is actually used: the chatbox music
  // line is enabled or the broadcast panel is open. Each poll spawns osascript,
  // so it is also skipped while the window is hidden.
  const needsMusicPoll = floorAnchor.chatboxAppleMusicEnabled || isOpen;
  useEffect(() => {
    if (!needsMusicPoll) return;
    let isSubscribed = true;
    const pollMusic = async () => {
      if (document.hidden) return;
      if (electron.isElectron && electron.api.getAppleMusic) {
        try {
          const res = await electron.api.getAppleMusic();
          if (isSubscribed) setAppleMusicInfo(res);
        } catch {
          // ignore
        }
      }
    };

    pollMusic();
    const interval = setInterval(pollMusic, 5000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [electron, needsMusicPoll]);

  // Combined chatbox broadcast message generator
  const getCombinedBroadcastMessage = useCallback(
    (forceIncludeBattery = false) => {
      const stickyEnabled = floorAnchor.chatboxCustomPinnedEnabled;
      const musicEnabled = floorAnchor.chatboxAppleMusicEnabled;
      const batteryEnabled =
        !floorAnchor.chatboxOnlyMode &&
        (floorAnchor.chatboxEnabled || forceIncludeBattery);

      const stickyText = floorAnchor.chatboxCustomPinnedText?.trim();
      const musicText =
        appleMusicInfo.playing && appleMusicInfo.formatted
          ? MUSIC_STYLES[musicStyle].format({
              track: appleMusicInfo.track,
              artist: appleMusicInfo.artist,
              pos: appleMusicInfo.pos,
              dur: appleMusicInfo.dur,
            })
          : '';
      const bpmText =
        fakeBpm.enabled && fakeBpm.formattedBpmText
          ? HEART_STYLES[heartStyle].format(fakeBpm.currentBpm)
          : '';

      const lines: string[] = [];
      if (stickyEnabled && stickyText) {
        lines.push(stickyText);
      }
      if (musicEnabled && musicText) {
        lines.push(musicText);
      }
      if (bpmText) {
        lines.push(bpmText);
      }
      if (batteryEnabled) {
        let battLine = getBatterySummaryText(false);
        const testCombined = [...lines, battLine].filter(Boolean).join('\n');
        if (testCombined.length > 140) {
          battLine = getBatterySummaryText(true);
        }
        if (battLine) {
          lines.push(battLine);
        }
      }

      let result = lines.join('\n');
      if (result.length > 144) {
        result = result.slice(0, 144);
      }
      return result;
    },
    [
      floorAnchor.chatboxCustomPinnedEnabled,
      floorAnchor.chatboxAppleMusicEnabled,
      floorAnchor.chatboxEnabled,
      floorAnchor.chatboxOnlyMode,
      floorAnchor.chatboxCustomPinnedText,
      appleMusicInfo.playing,
      appleMusicInfo.formatted,
      fakeBpm.enabled,
      fakeBpm.formattedBpmText,
      fakeBpm.currentBpm,
      musicStyle,
      heartStyle,
      appleMusicInfo.track,
      appleMusicInfo.artist,
      appleMusicInfo.pos,
      appleMusicInfo.dur,
      getBatterySummaryText,
    ]
  );

  const lastBroadcastMsgRef = useRef<string>('');
  const broadcastMsgGetterRef = useRef(getCombinedBroadcastMessage);
  broadcastMsgGetterRef.current = getCombinedBroadcastMessage;

  const isBroadcastingActive =
    floorAnchor.chatboxCustomPinnedEnabled ||
    floorAnchor.chatboxAppleMusicEnabled ||
    (!floorAnchor.chatboxOnlyMode && floorAnchor.chatboxEnabled) ||
    fakeBpm.enabled;

  const openPanel = useCallback(() => {
    if (panelExitTimerRef.current !== null) {
      window.clearTimeout(panelExitTimerRef.current);
      panelExitTimerRef.current = null;
    }
    setIsPanelMounted(true);
    setIsOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setView('main');
    if (panelExitTimerRef.current !== null) {
      window.clearTimeout(panelExitTimerRef.current);
    }
    panelExitTimerRef.current = window.setTimeout(() => {
      setIsPanelMounted(false);
      panelExitTimerRef.current = null;
    }, CHATBOX_PANEL_EXIT_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (panelExitTimerRef.current !== null) {
        window.clearTimeout(panelExitTimerRef.current);
      }
    };
  }, []);

  // Single unified periodic broadcaster
  useEffect(() => {
    if (!isBroadcastingActive) {
      lastBroadcastMsgRef.current = '';
      return;
    }

    const broadcast = () => {
      const msg = broadcastMsgGetterRef.current();
      if (msg) {
        sendChatboxCustomMessage(msg);
        lastBroadcastMsgRef.current = msg;
      }
    };

    broadcast();
    // Like a watch: a steady update every 5 s. VRChat rate-limits faster chat updates.
    const timer = setInterval(broadcast, 5000);
    return () => clearInterval(timer);
  }, [isBroadcastingActive, sendChatboxCustomMessage]);

  // Send at once only for changes people notice (new song, pause, pinned text). Heart rate,
  // song progress and battery wait for the next 5 s update instead of spamming the chat.
  useEffect(() => {
    if (!isBroadcastingActive) return;
    const msg = broadcastMsgGetterRef.current();
    if (msg && msg !== lastBroadcastMsgRef.current) {
      sendChatboxCustomMessage(msg);
      lastBroadcastMsgRef.current = msg;
    }
  }, [
    isBroadcastingActive,
    floorAnchor.chatboxCustomPinnedText,
    appleMusicInfo.track,
    appleMusicInfo.playing,
    sendChatboxCustomMessage,
  ]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        closePanel();
      }
    };
    // Escape closes the panel from anywhere (not only while focus is inside).
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isEditingIp) {
        closePanel();
        dropdownRef.current?.querySelector('button')?.focus();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closePanel, isOpen, isEditingIp]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const handleSendMessage = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!message.trim()) return;

    sendChatboxCustomMessage(message.trim());
    setMessage('');
    setSentMessageFeedback(true);
    setTimeout(() => {
      setSentMessageFeedback(false);
    }, 1800);
  };

  const modeLabels: Record<BroadcastMode, string> = {
    dictate: 'Voice',
    pinned: 'Sticky',
    music: 'Music',
    bpm: 'BPM',
  };
  const modeIsLive = (mode: BroadcastMode) =>
    mode === 'dictate'
      ? dictation.isListening
      : mode === 'pinned'
        ? floorAnchor.chatboxCustomPinnedEnabled
        : mode === 'music'
          ? floorAnchor.chatboxAppleMusicEnabled
          : fakeBpm.enabled;

  return (
    <div
      ref={dropdownRef}
      style={{ WebkitAppRegion: 'no-drag' } as any}
      className={classNames(
        'chatbox-control relative flex items-center',
        isTop
          ? 'chatbox-control--top shrink-0'
          : 'chatbox-control--side w-full',
        isOpen && 'chatbox-control--open'
      )}
    >
      <button
        type="button"
        onClick={() => (isOpen ? closePanel() : openPanel())}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={collapsed && !isTop ? 'Broadcast' : undefined}
        title="VRChat Broadcast & Telemetry HUD"
        className={classNames(
          'relative flex items-center rounded-[10px] text-ui-xs font-medium tracking-tight cursor-pointer select-none',
          isTop
            ? 'h-8 gap-2 border border-[var(--material-border-subtle)] px-3'
            : classNames(
                'h-9 w-full gap-3',
                collapsed ? 'justify-center px-0' : 'px-3'
              ),
          isOpen
            ? 'bg-accent-background-20/[0.12] text-accent-background-10'
            : floorAnchor.chatboxEnabled
              ? 'text-accent-background-10 hover:bg-background-10/[0.06]'
              : 'text-background-20 hover:bg-background-10/[0.06] hover:text-background-10',
          isTop &&
            !isOpen &&
            !floorAnchor.chatboxEnabled &&
            'bg-background-10/[0.03]'
        )}
      >
        <svg
          className={classNames(
            'shrink-0 opacity-90 stroke-[2.2]',
            isTop ? 'h-4 w-4' : 'h-5 w-5'
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>

        {(!collapsed || isTop) && <span>Broadcast</span>}

        {/* Live broadcasting / chat-only indicator (always has a text name). */}
        {floorAnchor.chatboxOnlyMode ? (
          <span
            className={classNames(
              'shrink-0 rounded-full border border-accent-background-20/40 bg-accent-background-20/[0.12] px-1.5 py-0.5 text-ui-2xs font-semibold leading-none text-accent-background-10',
              collapsed && !isTop
                ? 'absolute right-1 top-0.5'
                : isTop
                  ? ''
                  : 'ml-auto'
            )}
            title="Chat-Only Mode Active (FBT Trackers Muted)"
          >
            {collapsed && !isTop ? (
              <span className="sr-only">Chat only</span>
            ) : (
              'Only'
            )}
            {collapsed && !isTop && <span aria-hidden="true">•</span>}
          </span>
        ) : floorAnchor.chatboxEnabled ||
          floorAnchor.chatboxCustomPinnedEnabled ||
          floorAnchor.chatboxAppleMusicEnabled ||
          fakeBpm.enabled ? (
          <span
            className={classNames(
              'h-2 w-2 rounded-full bg-status-success',
              collapsed && !isTop
                ? 'absolute right-2 top-1.5'
                : isTop
                  ? ''
                  : 'ml-auto'
            )}
            role="img"
            aria-label="Chatbox broadcasting active"
            title="Chatbox broadcasting active"
          />
        ) : null}
      </button>

      {isPanelMounted && (
        <div
          style={{ WebkitAppRegion: 'no-drag' } as any}
          className={classNames(
            'chatbox-panel',
            isOpen ? 'chatbox-panel--open' : 'chatbox-panel--closing'
          )}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !isEditingIp) {
              closePanel();
              dropdownRef.current?.querySelector('button')?.focus();
            }
          }}
        >
          {view === 'main' ? (
            <>
              {/* Header: title, live state, settings */}
              <div className="chatbox-header flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="chatbox-title text-background-10">
                    Broadcast
                  </span>
                  <StatusDot
                    tone={
                      floorAnchor.chatboxOnlyMode
                        ? 'warn'
                        : isBroadcastingActive
                          ? 'ok'
                          : 'idle'
                    }
                    label={
                      floorAnchor.chatboxOnlyMode
                        ? 'Chat only'
                        : isBroadcastingActive
                          ? 'Live'
                          : 'Standby'
                    }
                    className="text-ui-2xs text-background-30"
                  />
                </div>
                <IconButton
                  label="Broadcast settings"
                  onClick={() => setView('settings')}
                >
                  <GearGlyph />
                </IconButton>
              </div>

              <div className="chatbox-body flex min-h-0 flex-1 flex-col gap-4">
                {/* What VRChat will show right now */}
                <div className="chatbox-hero-bubble flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-ui-2xs text-background-30">
                    <span>Preview</span>
                    <span className="tnum">
                      {
                        (
                          getCombinedBroadcastMessage(
                            floorAnchor.chatboxEnabled
                          ) || ''
                        ).length
                      }
                      /144
                    </span>
                  </div>
                  <div className="flex min-h-[40px] items-center whitespace-pre-wrap break-words font-mono text-ui-xs text-background-10">
                    {getCombinedBroadcastMessage(
                      floorAnchor.chatboxEnabled
                    ) || (
                      <span className="font-sans text-ui-2xs italic text-background-30">
                        Nothing is being broadcast. Use Voice, or switch on
                        Sticky, Music or BPM.
                      </span>
                    )}
                  </div>
                </div>

                <SegmentedControl
                  ariaLabel="Broadcast modes"
                  className="w-full [&>button]:flex-1"
                  value={activeMode}
                  onChange={setActiveMode}
                  options={broadcastModes.map((mode) => ({
                    value: mode,
                    label: modeLabels[mode],
                    icon: modeIsLive(mode) ? (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-accent-background-10"
                      />
                    ) : undefined,
                  }))}
                />

                {/* Active mode: only the controls used while playing */}
                {activeMode === 'dictate' && (
                  <div className="flex flex-col gap-3">
                    {dictation.error && (
                      <div className="rounded-[8px] bg-status-critical/15 p-2.5 text-ui-2xs text-status-critical">
                        {dictation.error}
                        {/blocked|denied/i.test(dictation.error) && (
                          <button
                            type="button"
                            onClick={() =>
                              (window as any).__TAURI_INTERNALS__?.invoke(
                                'plugin:opener|open_url',
                                {
                                  url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition',
                                }
                              )
                            }
                            className="mt-2 block cursor-pointer font-medium underline"
                          >
                            Open System Settings
                          </button>
                        )}
                      </div>
                    )}

                    {dictation.settings.activationMode === 'ptt' ? (
                      <button
                        type="button"
                        onMouseDown={() => dictation.startListening()}
                        onMouseUp={() => dictation.stopListening()}
                        onTouchStart={() => dictation.startListening()}
                        onTouchEnd={() => dictation.stopListening()}
                        className={classNames(
                          dictateButton,
                          dictation.isListening
                            ? 'bg-status-critical text-white'
                            : 'bg-accent-background-20 text-white hover:bg-accent-background-40'
                        )}
                      >
                        <MicGlyph />
                        {dictation.isListening
                          ? 'Release to send'
                          : 'Hold to speak'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => dictation.toggleListening()}
                        className={classNames(
                          dictateButton,
                          dictation.isListening
                            ? 'bg-status-critical text-white'
                            : 'bg-accent-background-20 text-white hover:bg-accent-background-40'
                        )}
                      >
                        <MicGlyph />
                        {dictation.isListening
                          ? 'Stop listening'
                          : 'Start dictation'}
                      </button>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-ui-2xs text-background-30">
                        <span>
                          {dictation.isListening
                            ? 'Listening'
                            : dictation.isProcessing
                              ? 'Transcribing'
                              : 'Microphone standby'}
                        </span>
                        <span className="tnum">{dictation.audioLevel}%</span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-background-10/[0.1]">
                        <div
                          className="h-full rounded-full bg-accent-background-20 transition-all duration-75"
                          style={{ width: `${dictation.audioLevel}%` }}
                        />
                      </div>
                    </div>

                    {(dictation.finalTranscript ||
                      dictation.interimTranscript ||
                      dictation.translatedText) && (
                      <div className="chatbox-widget flex flex-col gap-2">
                        <div className="flex items-center justify-between text-ui-2xs text-background-30">
                          <span>Recognized speech</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (dictation.translatedText) {
                                setChatboxCustomPinnedText(
                                  dictation.translatedText
                                );
                                setChatboxCustomPinnedEnabled(true);
                              }
                            }}
                            className="cursor-pointer font-medium text-accent-background-10 hover:underline"
                          >
                            Pin as sticky
                          </button>
                        </div>
                        <div className="text-ui-xs text-background-10">
                          {dictation.finalTranscript ||
                            dictation.interimTranscript ||
                            '—'}
                        </div>
                        {dictation.translatedText &&
                          dictation.settings.targetLanguage !== 'none' && (
                            <div className="text-ui-xs text-accent-background-10">
                              {dictation.translatedText}
                            </div>
                          )}
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => dictation.sendCurrentPreview()}
                            className={primaryButton}
                          >
                            Send to chatbox
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeMode === 'pinned' && (
                  <div className="flex flex-col gap-2">
                    <SettingGroup title="Sticky status">
                      <SettingRow
                        label="Show sticky text"
                        description="Repeats above your avatar"
                      >
                        <Toggle
                          checked={floorAnchor.chatboxCustomPinnedEnabled}
                          onChange={setChatboxCustomPinnedEnabled}
                          label="Sticky status text"
                        />
                      </SettingRow>
                    </SettingGroup>
                    <input
                      type="text"
                      value={floorAnchor.chatboxCustomPinnedText}
                      onChange={(e) =>
                        setChatboxCustomPinnedText(e.target.value)
                      }
                      placeholder="Write your status..."
                      aria-label="Sticky status message"
                      maxLength={140}
                      className={textInput}
                    />
                  </div>
                )}

                {activeMode === 'music' && (
                  <div className="flex flex-col gap-2">
                    <SettingGroup title="Apple Music">
                      <SettingRow
                        label="Now playing"
                        description="Broadcast the current song and artist"
                      >
                        <Toggle
                          checked={floorAnchor.chatboxAppleMusicEnabled}
                          onChange={setChatboxAppleMusicEnabled}
                          label="Apple music broadcast"
                        />
                      </SettingRow>
                      <SettingRow label="Style">
                        <select
                          value={musicStyle}
                          onChange={(e) =>
                            setMusicStyle(e.target.value as typeof musicStyle)
                          }
                          aria-label="Music style"
                          className={selectClass}
                        >
                          {Object.entries(MUSIC_STYLES).map(([key, st]) => (
                            <option key={key} value={key}>
                              {st.label}
                            </option>
                          ))}
                        </select>
                      </SettingRow>
                    </SettingGroup>
                    <div className="chatbox-widget flex flex-col gap-0.5">
                      <span className="truncate text-ui-xs font-medium text-background-10">
                        {appleMusicInfo.track || 'No track playing'}
                      </span>
                      <span className="truncate text-ui-2xs text-background-30">
                        {appleMusicInfo.artist
                          ? `${appleMusicInfo.artist}${appleMusicInfo.album ? ` — ${appleMusicInfo.album}` : ''}`
                          : 'Open Apple Music on this Mac to broadcast'}
                      </span>
                    </div>
                  </div>
                )}

                {activeMode === 'bpm' && (
                  <div className="flex flex-col gap-3">
                    <SettingGroup title="Simulated heart rate">
                      <SettingRow
                        label="Show heart rate"
                        description="Follows how you move, sit, stand and lie down in game"
                      >
                        <Toggle
                          checked={fakeBpm.enabled}
                          onChange={fakeBpm.setEnabled}
                          label="Simulated heart rate"
                        />
                      </SettingRow>
                      <SettingRow label="Heart style">
                        <select
                          value={heartStyle}
                          onChange={(e) =>
                            setHeartStyle(e.target.value as typeof heartStyle)
                          }
                          aria-label="Heart style"
                          className={selectClass}
                        >
                          {Object.entries(HEART_STYLES).map(([key, st]) => (
                            <option key={key} value={key}>
                              {st.label}
                            </option>
                          ))}
                        </select>
                      </SettingRow>
                    </SettingGroup>

                    <HeartReadout
                      bpm={fakeBpm.enabled && fakeBpm.available ? fakeBpm.currentBpm : null}
                      zone={fakeBpm.zone}
                      label={
                        !fakeBpm.enabled
                          ? 'Off'
                          : fakeBpm.available
                            ? fakeBpm.activityLabel
                            : 'Waiting for trackers'
                      }
                      history={fakeBpm.history}
                    />

                    <SettingGroup title="Your heart">
                      <SettingRow
                        label="Resting heart rate"
                        description="Your BPM when relaxed and seated"
                      >
                        <input
                          type="number"
                          inputMode="numeric"
                          min={40}
                          max={100}
                          aria-label="Resting heart rate"
                          value={fakeBpm.profile.restingBpm}
                          onChange={(e) =>
                            Number.isFinite(e.target.valueAsNumber) &&
                            fakeBpm.setProfile({
                              ...fakeBpm.profile,
                              restingBpm: e.target.valueAsNumber,
                            })
                          }
                          className={classNames(textInput, 'tnum w-16 text-right')}
                        />
                      </SettingRow>
                      <SettingRow label="Age" description="Sets how high it can go">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={10}
                          max={90}
                          aria-label="Age"
                          value={fakeBpm.profile.age}
                          onChange={(e) =>
                            Number.isFinite(e.target.valueAsNumber) &&
                            fakeBpm.setProfile({
                              ...fakeBpm.profile,
                              age: e.target.valueAsNumber,
                            })
                          }
                          className={classNames(textInput, 'tnum w-16 text-right')}
                        />
                      </SettingRow>
                    </SettingGroup>
                  </div>
                )}
              </div>

              {/* Quick message: always reachable */}
              <form
                onSubmit={handleSendMessage}
                className="chatbox-composer flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  aria-label="One-off message"
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Send a message in VRChat..."
                  maxLength={140}
                  className={classNames(textInput, 'flex-grow')}
                />
                <button
                  type="submit"
                  disabled={!message.trim()}
                  className={classNames(
                    primaryButton,
                    'shrink-0 disabled:cursor-not-allowed disabled:bg-background-10/[0.1] disabled:text-background-10/40',
                    sentMessageFeedback && '!bg-status-success'
                  )}
                >
                  {sentMessageFeedback ? 'Sent' : 'Send'}
                </button>
              </form>
            </>
          ) : (
            <>
              {/* Settings view: everything that is configured once */}
              <div className="chatbox-header flex items-center gap-2">
                <IconButton label="Back" onClick={() => setView('main')}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </IconButton>
                <span className="chatbox-title text-background-10">
                  Broadcast settings
                </span>
              </div>

              <div className="chatbox-body flex min-h-0 flex-1 flex-col gap-5">
                <SettingGroup title="Voice">
                  <SettingRow label="Engine">
                    <select
                      value={dictation.settings.engine}
                      onChange={(e) =>
                        dictation.setEngine(e.target.value as 'local' | 'cloud')
                      }
                      aria-label="Speech engine"
                      className={selectClass}
                    >
                      <option value="local">Mac built-in (free, on-device)</option>
                      <option value="cloud">Groq Whisper v3 Turbo</option>
                    </select>
                  </SettingRow>
                  {dictation.settings.engine === 'cloud' && (
                  <SettingRow
                    stacked
                    label="Groq API key"
                    value={
                      <button
                        type="button"
                        onClick={() => openUrl('https://console.groq.com/keys')}
                        className="cursor-pointer text-ui-2xs font-medium text-accent-background-10 hover:underline"
                      >
                        Get a free key
                      </button>
                    }
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type={showApiKeyInput ? 'text' : 'password'}
                        value={dictation.settings.groqApiKey}
                        onChange={(e) =>
                          dictation.setGroqApiKey(e.target.value)
                        }
                        placeholder="gsk_..."
                        aria-label="Groq API key"
                        className={classNames(textInput, 'flex-grow font-mono')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                        className={ghostButton}
                      >
                        {showApiKeyInput ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </SettingRow>
                  )}
                  <SettingRow label="Microphone">
                    <select
                      value={dictation.settings.inputDeviceId || 'default'}
                      onChange={(e) =>
                        dictation.setInputDeviceId(e.target.value)
                      }
                      onFocus={() => dictation.refreshDevices()}
                      aria-label="Microphone"
                      className={selectClass}
                    >
                      <option value="default">Default microphone</option>
                      {dictation.availableDevices.map((dev) => (
                        <option key={dev.deviceId} value={dev.deviceId}>
                          {dev.label}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                  <SettingRow label="Translate speech">
                    <select
                      value={dictation.settings.targetLanguage}
                      onChange={(e) =>
                        dictation.setTargetLanguage(e.target.value)
                      }
                      aria-label="Translate speech to"
                      className={selectClass}
                    >
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                  <SettingRow label="Format">
                    <select
                      value={dictation.settings.format}
                      onChange={(e) =>
                        dictation.setFormat(e.target.value as DictationFormat)
                      }
                      aria-label="Output format"
                      className={selectClass}
                    >
                      <option value="translation_only">Translation only</option>
                      <option value="bilingual">Bilingual</option>
                      <option value="original_only">Original voice</option>
                    </select>
                  </SettingRow>
                  <SettingRow label="Activation">
                    <select
                      value={dictation.settings.activationMode}
                      onChange={(e) =>
                        dictation.setActivationMode(
                          e.target.value as DictationActivation
                        )
                      }
                      aria-label="Activation mode"
                      className={selectClass}
                    >
                      <option value="toggle">Toggle (click)</option>
                      <option value="ptt">Push to talk</option>
                    </select>
                  </SettingRow>
                  <SettingRow
                    label="Auto-send to chatbox"
                    description="Send automatically on voice pause"
                  >
                    <Toggle
                      checked={dictation.settings.autoSend}
                      onChange={dictation.setAutoSend}
                      label="Auto-send to chatbox"
                    />
                  </SettingRow>
                  {dictation.settings.engine === 'local' && (
                    <SettingRow
                      label="Fast mode"
                      description="Send ~0.7s after you stop talking; may cut off long pauses"
                    >
                      <Toggle
                        checked={dictation.settings.fastMode}
                        onChange={dictation.setFastMode}
                        label="Fast mode"
                      />
                    </SettingRow>
                  )}
                  <SettingRow
                    label="Auto sticky note"
                    description="Pin what you said and its translation"
                  >
                    <Toggle
                      checked={dictation.settings.autoSticky}
                      onChange={dictation.setAutoSticky}
                      label="Auto sticky note"
                    />
                  </SettingRow>
                  {dictation.settings.autoSticky && (
                    <SettingRow label="Sticky disappears">
                      <select
                        value={dictation.settings.stickySeconds}
                        onChange={(e) =>
                          dictation.setStickySeconds(Number(e.target.value))
                        }
                        aria-label="Sticky disappears after"
                        className={selectClass}
                      >
                        <option value={5}>After 5 seconds</option>
                        <option value={8}>After 8 seconds</option>
                        <option value={15}>After 15 seconds</option>
                        <option value={30}>After 30 seconds</option>
                        <option value={0}>Never</option>
                      </select>
                    </SettingRow>
                  )}
                </SettingGroup>

                <SettingGroup title="Chatbox">
                  <SettingRow
                    label="Battery in chatbox"
                    description="Share tracker battery levels every 30s"
                  >
                    <Toggle
                      checked={floorAnchor.chatboxEnabled}
                      onChange={setChatboxEnabled}
                      label="Battery in chatbox"
                    />
                  </SettingRow>
                  <SettingRow
                    label="Chat-only mode"
                    description="Mute tracker OSC; the chat bubble stays on"
                  >
                    <Toggle
                      checked={floorAnchor.chatboxOnlyMode}
                      onChange={setChatboxOnlyMode}
                      label="Chat-only mode"
                    />
                  </SettingRow>
                </SettingGroup>

                <SettingGroup title="Connection">
                  <SettingRow
                    label="Headset address"
                    description="Quest OSC target (port 9000)"
                  >
                    {isEditingIp ? (
                      <input
                        type="text"
                        value={inputIpValue}
                        onChange={(e) => setInputIpValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveTargetIp(inputIpValue);
                          if (e.key === 'Escape') setIsEditingIp(false);
                        }}
                        onBlur={() => saveTargetIp(inputIpValue)}
                        autoFocus
                        placeholder="192.168.0.106"
                        aria-label="Headset IP address"
                        className={classNames(textInput, 'w-36 font-mono')}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setInputIpValue(targetIp);
                          setIsEditingIp(true);
                        }}
                        className={classNames(ghostButton, 'font-mono')}
                        title="Edit Quest OSC target IP address"
                      >
                        {targetIp}
                      </button>
                    )}
                  </SettingRow>
                  <SettingRow label="Trackers">
                    <span className="tnum text-ui-xs text-background-20">
                      {connectedCount} connected
                      {avgBattery != null && ` · ${avgBattery}% avg battery`}
                      {isDemoMode && ' · demo'}
                    </span>
                  </SettingRow>
                </SettingGroup>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
