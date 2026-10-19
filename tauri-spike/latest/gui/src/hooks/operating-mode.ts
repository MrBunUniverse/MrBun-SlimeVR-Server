import { useAtom, useStore } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useMemo, useCallback, useEffect } from 'react';
import { Builder } from 'flatbuffers';
import { useWebsocketAPI } from './websocket-api';
import { bonesAtom } from '@/store/app-store';
import {
  RpcMessage,
  LegTweaksSettingsT,
  ChangeSettingsRequestT,
  ModelSettingsT,
  SettingsRequestT,
  SettingsResponseT,
  SkeletonHeightT,
  BodyPart,
  VRCOSCSettingsT,
  OSCSettingsT,
} from 'solarxr-protocol';

/**
 * The generated code skips a value equal to its default (false, 0), so turning a chatbox
 * toggle off or setting the floor to 0 never reached the server. Every field here is optional
 * and only written when set, so forcing defaults sends exactly what was set.
 */
class ForcedSkeletonHeightT extends SkeletonHeightT {
  pack(builder: Builder) {
    builder.forceDefaults(true);
    try {
      return super.pack(builder);
    } finally {
      builder.forceDefaults(false);
    }
  }
}

export type OperatingMode = 'quest_standalone' | 'pcvr';

export type TrackingProfileName = 'STANDING' | 'CROUCHING' | 'SITTING' | 'CUSTOM';

export type RecenterBehaviorMode =
  | 'KEEP_FLOOR'
  | 'REANCHOR_ON_RECENTER'
  | 'REANCHOR_ON_FULL_RESET';

export type AnchorStatus = 'CALIBRATED' | 'LOCKED' | 'FLOATING' | 'STALE';

export interface QuestStandaloneState {
  isAnchored: boolean;
  floorOffset: number; // in meters
  correctionStrength: number; // 0.0 to 1.0
  footPlant: boolean;
  skatingCorrectionStrength: number;
  hmdVerticalOffset: number; // in meters
  oscRate: number; // 30, 50, 60, 90 Hz
  chatboxEnabled: boolean;
  chatboxOnlyMode: boolean;
  chatboxCustomPinnedEnabled: boolean;
  chatboxCustomPinnedText: string;
  chatboxAppleMusicEnabled: boolean;
  recenterBehavior: RecenterBehaviorMode;
  activeProfile: TrackingProfileName;
  lastCalibrated: number | null;
  anchorStatus: AnchorStatus;
}

export const operatingModeAtom = atomWithStorage<OperatingMode>(
  'slimevr_operating_mode',
  'quest_standalone'
);

// Local storage only covers the moment before the server answers: useOperatingMode asks for the server's
// settings on mount and overwrites floorClip, footPlant, correction strength, OSC rate and chatbox.
// Elevation (floorOffset) stays local: SettingsResponse's floorHeight is the skeleton floor, not the Quest elevation.
export const questStandaloneStateAtom = atomWithStorage<QuestStandaloneState>(
  'slimevr_quest_standalone_state_v2',
  {
    isAnchored: true,
    floorOffset: 0.0,
    correctionStrength: 0.3, // LegTweaksConfig's default on the server
    footPlant: true,
    skatingCorrectionStrength: 0.5,
    hmdVerticalOffset: 0.0,
    oscRate: 60,
    chatboxEnabled: true,
    chatboxOnlyMode: false,
    chatboxCustomPinnedEnabled: false,
    chatboxCustomPinnedText: '',
    chatboxAppleMusicEnabled: false,
    recenterBehavior: 'REANCHOR_ON_FULL_RESET',
    activeProfile: 'STANDING',
    lastCalibrated: null,
    anchorStatus: 'LOCKED',
  }
);

type ToggleChanges = {
  floorClip?: boolean;
  footPlant?: boolean;
  skatingCorrection?: boolean;
};

// Shared by every component using useOperatingMode. Each one hears every SettingsResponse, so a change
// one of them is waiting on has to be visible to all of them, or the others refill the panel with the old value.
const pending = {
  // The server replaces every model toggle named in a request and treats the
  // ones left out as off. To change one toggle, read the server's current set
  // and send it back with only that toggle altered.
  toggles: null as ToggleChanges | null,
  // When each value was last changed here. A response to a request sent just before that change still
  // carries the old value, and must not refill the panel with it.
  // ponytail: a time window, not request tracking; a server slower than this can still flick a value back.
  changedAt: {} as Partial<Record<keyof QuestStandaloneState, number>>,
};
const RECENT_MS = 2000;
const recent = (key: keyof QuestStandaloneState) =>
  Date.now() - (pending.changedAt[key] ?? 0) < RECENT_MS;

export function useOperatingMode() {
  const [mode, setMode] = useAtom(operatingModeAtom);
  const [state, setState] = useAtom(questStandaloneStateAtom);
  const { sendRPCPacket, useRPCPacket } = useWebsocketAPI();
  // Read bones on demand. Subscribing here would re-render every consumer of
  // this hook on each bone update (~30 Hz) although bones are only needed
  // when the floor is calibrated.
  const store = useStore();

  const isQuestStandalone = useMemo(() => mode === 'quest_standalone', [mode]);
  const isPCVR = useMemo(() => mode === 'pcvr', [mode]);

  const toggleMode = () => {
    const nextMode: OperatingMode =
      mode === 'quest_standalone' ? 'pcvr' : 'quest_standalone';
    setMode(nextMode);

    const settingsRequest = new ChangeSettingsRequestT();
    const vrcOsc = new VRCOSCSettingsT();
    const oscSettings = new OSCSettingsT();
    oscSettings.enabled = nextMode === 'quest_standalone';
    vrcOsc.oscSettings = oscSettings;
    vrcOsc.oscqueryEnabled = true;
    settingsRequest.vrcOsc = vrcOsc;
    sendRPCPacket(RpcMessage.ChangeSettingsRequest, settingsRequest);
  };

  // The server sets the Quest elevation from every skeletonHeight message, so each one carries the local
  // elevation, read from the store so it's current even in a memoised callback.
  const sendSkeletonHeight = useCallback(
    (skeletonHeight: SkeletonHeightT) => {
      skeletonHeight.floorHeight ??= store.get(questStandaloneStateAtom).floorOffset;
      const modelSettings = new ModelSettingsT();
      modelSettings.skeletonHeight = Object.assign(
        new ForcedSkeletonHeightT(),
        skeletonHeight
      );
      const settingsRequest = new ChangeSettingsRequestT();
      settingsRequest.modelSettings = modelSettings;
      sendRPCPacket(RpcMessage.ChangeSettingsRequest, settingsRequest);
    },
    [sendRPCPacket, store]
  );

  useEffect(() => {
    sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
  }, []);

  useRPCPacket(RpcMessage.SettingsResponse, (settings: SettingsResponseT) => {
    const model = settings.modelSettings;
    if (!model) return;
    const toggles = model.toggles;
    const skeleton = model.skeletonHeight;

    const changes = pending.toggles;
    pending.toggles = null;
    if (changes && toggles) {
      // Apply the change before reading the toggles back, so the panel doesn't flick to the old value.
      Object.assign(toggles, changes);
      const modelSettings = new ModelSettingsT();
      modelSettings.toggles = toggles;
      const settingsRequest = new ChangeSettingsRequestT();
      settingsRequest.modelSettings = modelSettings;
      sendRPCPacket(RpcMessage.ChangeSettingsRequest, settingsRequest);
    }

    setState((prev) => {
      const isAnchored = toggles?.floorClip ?? prev.isAnchored;
      return {
        ...prev,
        isAnchored,
        anchorStatus: !isAnchored
          ? 'FLOATING'
          : prev.anchorStatus === 'FLOATING'
            ? 'LOCKED'
            : prev.anchorStatus,
        footPlant: toggles?.footPlant ?? prev.footPlant,
        correctionStrength: recent('correctionStrength')
          ? prev.correctionStrength
          : (model.legTweaks?.correctionStrength ?? prev.correctionStrength),
        oscRate: recent('oscRate') ? prev.oscRate : (skeleton?.oscRate ?? prev.oscRate),
        chatboxEnabled: recent('chatboxEnabled')
          ? prev.chatboxEnabled
          : (skeleton?.chatboxEnabled ?? prev.chatboxEnabled),
        chatboxOnlyMode: recent('chatboxOnlyMode')
          ? prev.chatboxOnlyMode
          : (skeleton?.chatboxOnly ?? prev.chatboxOnlyMode),
      };
    });
  });

  /** Sends only the settings named in `updates`; everything else is left alone. */
  const syncToServer = (updates: Partial<QuestStandaloneState>) => {
    for (const key of Object.keys(updates) as (keyof QuestStandaloneState)[]) {
      pending.changedAt[key] = Date.now();
    }
    const toggleChanges: ToggleChanges = {};
    if (updates.isAnchored !== undefined) {
      toggleChanges.floorClip = updates.isAnchored;
    }
    if (updates.footPlant !== undefined) {
      toggleChanges.footPlant = updates.footPlant;
    }
    if (updates.skatingCorrectionStrength !== undefined) {
      toggleChanges.skatingCorrection = updates.skatingCorrectionStrength > 0.05;
    }
    if (Object.keys(toggleChanges).length > 0) {
      pending.toggles = { ...pending.toggles, ...toggleChanges };
      sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
    }

    if (updates.correctionStrength !== undefined) {
      const legTweaks = new LegTweaksSettingsT();
      legTweaks.correctionStrength = updates.correctionStrength;
      const modelSettings = new ModelSettingsT();
      modelSettings.legTweaks = legTweaks;
      const settingsRequest = new ChangeSettingsRequestT();
      settingsRequest.modelSettings = modelSettings;
      sendRPCPacket(RpcMessage.ChangeSettingsRequest, settingsRequest);
    }

    if (
      updates.floorOffset !== undefined ||
      updates.oscRate !== undefined ||
      updates.chatboxEnabled !== undefined ||
      updates.chatboxOnlyMode !== undefined
    ) {
      const skeletonHeight = new SkeletonHeightT();
      if (updates.floorOffset !== undefined) {
        skeletonHeight.floorHeight = updates.floorOffset;
      }
      if (updates.oscRate !== undefined) skeletonHeight.oscRate = updates.oscRate;
      if (updates.chatboxEnabled !== undefined) {
        skeletonHeight.chatboxEnabled = updates.chatboxEnabled;
      }
      if (updates.chatboxOnlyMode !== undefined) {
        skeletonHeight.chatboxOnly = updates.chatboxOnlyMode;
      }
      sendSkeletonHeight(skeletonHeight);
    }
  };

  // Memoised: ChatboxDropdown's effects depend on these, and a new function each render would resend in a loop.
  const triggerChatboxStatus = useCallback(() => {
    const skeletonHeight = new SkeletonHeightT();
    skeletonHeight.chatboxTrigger = true;
    sendSkeletonHeight(skeletonHeight);
  }, [sendSkeletonHeight]);

  const sendChatboxCustomMessage = useCallback(
    (message: string) => {
      if (!message || !message.trim()) return;
      const skeletonHeight = new SkeletonHeightT();
      skeletonHeight.chatboxMessage = message.trim();
      sendSkeletonHeight(skeletonHeight);
    },
    [sendSkeletonHeight]
  );

  const toggleFloorAnchor = () => {
    const nextState = !state.isAnchored;
    const nextStatus: AnchorStatus = nextState ? 'LOCKED' : 'FLOATING';

    syncToServer({ isAnchored: nextState, anchorStatus: nextStatus });
    setState((prev) => ({
      ...prev,
      isAnchored: nextState,
      anchorStatus: nextStatus,
      lastCalibrated: Date.now(),
    }));
  };

  const setFloorHeight = (heightMeters: number) => {
    // Whole centimetres: the server stores a 32-bit float, and stepping from its value otherwise drifts to "-0 cm".
    const clamped = Math.round(Math.max(-3.0, Math.min(3.0, heightMeters)) * 100) / 100;
    syncToServer({ floorOffset: clamped });
    setState((prev) => ({
      ...prev,
      floorOffset: clamped,
      anchorStatus: prev.isAnchored ? 'CALIBRATED' : 'FLOATING',
      lastCalibrated: Date.now(),
    }));
  };

  const adjustFloorHeight = (deltaCm: number) => {
    const newOffset = state.floorOffset + deltaCm / 100;
    setFloorHeight(newOffset);
  };

  const triggerFloorCalibration = () => {
    let calculatedOffset = 0;
    const bones = store.get(bonesAtom);
    const leftFoot = bones.find(
      (b) => b.bodyPart === BodyPart.LEFT_FOOT || b.bodyPart === BodyPart.LEFT_LOWER_LEG
    );
    const rightFoot = bones.find(
      (b) =>
        b.bodyPart === BodyPart.RIGHT_FOOT || b.bodyPart === BodyPart.RIGHT_LOWER_LEG
    );

    if (
      leftFoot?.headPositionG?.y !== undefined &&
      rightFoot?.headPositionG?.y !== undefined
    ) {
      calculatedOffset = Math.min(leftFoot.headPositionG.y, rightFoot.headPositionG.y);
    }

    syncToServer({
      isAnchored: true,
      floorOffset: Math.max(0, calculatedOffset),
      anchorStatus: 'CALIBRATED',
    });

    setState((prev) => ({
      ...prev,
      isAnchored: true,
      floorOffset: Math.max(0, calculatedOffset),
      anchorStatus: 'CALIBRATED',
      lastCalibrated: Date.now(),
    }));
  };

  const setCorrectionStrength = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    syncToServer({ correctionStrength: clamped });
    setState((prev) => ({ ...prev, correctionStrength: clamped }));
  };

  const setFootPlant = (val: boolean) => {
    syncToServer({ footPlant: val });
    setState((prev) => ({ ...prev, footPlant: val }));
  };

  const setSkatingCorrectionStrength = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    syncToServer({ skatingCorrectionStrength: clamped });
    setState((prev) => ({ ...prev, skatingCorrectionStrength: clamped }));
  };

  const setHmdVerticalOffset = (valMeters: number) => {
    setState((prev) => ({ ...prev, hmdVerticalOffset: valMeters }));
  };

  const setOscRate = (rate: number) => {
    setState((prev) => ({ ...prev, oscRate: rate }));
    syncToServer({ oscRate: rate });
  };

  const setRecenterBehavior = (mode: RecenterBehaviorMode) => {
    setState((prev) => ({ ...prev, recenterBehavior: mode }));
  };

  const selectProfile = (profile: TrackingProfileName) => {
    let profileSettings: Partial<QuestStandaloneState> = {
      activeProfile: profile,
    };

    if (profile === 'STANDING') {
      profileSettings = {
        activeProfile: 'STANDING',
        isAnchored: true,
        correctionStrength: 0.5,
        footPlant: true,
        skatingCorrectionStrength: 0.5,
        anchorStatus: 'LOCKED',
      };
    } else if (profile === 'CROUCHING') {
      profileSettings = {
        activeProfile: 'CROUCHING',
        isAnchored: true,
        correctionStrength: 0.7,
        footPlant: true,
        skatingCorrectionStrength: 0.3,
        anchorStatus: 'LOCKED',
      };
    } else if (profile === 'SITTING') {
      profileSettings = {
        activeProfile: 'SITTING',
        isAnchored: false,
        correctionStrength: 0.2,
        footPlant: false,
        skatingCorrectionStrength: 0.0,
        anchorStatus: 'FLOATING',
      };
    }

    syncToServer(profileSettings);
    setState((prev) => ({ ...prev, ...profileSettings }));
  };

  const setChatboxEnabled = (val: boolean) => {
    setState((prev) => ({ ...prev, chatboxEnabled: val }));
    syncToServer({ chatboxEnabled: val });
  };

  const setChatboxOnlyMode = (val: boolean) => {
    setState((prev) => ({ ...prev, chatboxOnlyMode: val }));
    syncToServer({ chatboxOnlyMode: val });
  };

  const setChatboxCustomPinnedEnabled = (val: boolean) => {
    setState((prev) => ({ ...prev, chatboxCustomPinnedEnabled: val }));
  };

  const setChatboxCustomPinnedText = (text: string) => {
    setState((prev) => ({ ...prev, chatboxCustomPinnedText: text }));
  };

  const setChatboxAppleMusicEnabled = (val: boolean) => {
    setState((prev) => ({ ...prev, chatboxAppleMusicEnabled: val }));
  };

  const resetToDefaults = () => {
    selectProfile('STANDING');
  };

  return {
    mode,
    isQuestStandalone,
    isPCVR,
    toggleMode,
    floorAnchor: state,
    toggleFloorAnchor,
    triggerFloorCalibration,
    adjustFloorHeight,
    setFloorHeight,
    setCorrectionStrength,
    setFootPlant,
    setSkatingCorrectionStrength,
    setHmdVerticalOffset,
    setOscRate,
    setChatboxEnabled,
    setChatboxOnlyMode,
    setChatboxCustomPinnedEnabled,
    setChatboxCustomPinnedText,
    setChatboxAppleMusicEnabled,
    triggerChatboxStatus,
    sendChatboxCustomMessage,
    setRecenterBehavior,
    selectProfile,
    resetToDefaults,
  };
}
