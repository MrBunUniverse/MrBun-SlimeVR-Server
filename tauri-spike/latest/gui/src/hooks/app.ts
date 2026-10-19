import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  BoneT,
  DataFeedMessage,
  DataFeedUpdateT,
  ResetResponseT,
  RpcMessage,
  StartDataFeedT,
} from 'solarxr-protocol';
import { handleResetSounds } from '@/sounds/sounds';
import { useConfig } from './config';
import { useBonesDataFeedConfig, useDataFeedConfig } from './datafeed-config';
import { useWebsocketAPI } from './websocket-api';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  bonesAtom,
  datafeedAtom,
  devicesAtom,
  livePreviewCountAtom,
} from '@/store/app-store';
import { getSentryOrCompute, updateSentryContext } from '@/utils/sentry';
import { fetchCurrentFirmwareRelease, FirmwareRelease } from './firmware-update';
import { DEFAULT_LOCALE, LangContext } from '@/i18n/config';

const isSteam = window.electronAPI ? await window.electronAPI.isSteam() : false;
const UI_FEED_UPDATE_INTERVAL = 1000 / 30;

export interface AppContext {
  currentFirmwareRelease: FirmwareRelease | null;
}

export function useProvideAppContext(): AppContext {
  const { useRPCPacket, sendDataFeedPacket, useDataFeedPacket, isConnected } =
    useWebsocketAPI();
  const { changeLocales } = useContext(LangContext);
  const { config } = useConfig();
  const livePreviews = useAtomValue(livePreviewCountAtom) > 0;
  const { dataFeedConfig } = useDataFeedConfig(livePreviews);
  const bonesDataFeedConfig = useBonesDataFeedConfig();
  const setDatafeed = useSetAtom(datafeedAtom);
  const setBones = useSetAtom(bonesAtom);
  const devices = useAtomValue(devicesAtom);
  const pendingDatafeedRef = useRef<DataFeedUpdateT | null>(null);
  const pendingBonesRef = useRef<BoneT[] | null>(null);
  const flushTimerRef = useRef<number | null>(null);

  const [currentFirmwareRelease, setCurrentFirmwareRelease] =
    useState<FirmwareRelease | null>(null);

  useEffect(() => {
    if (isConnected) {
      const startDataFeed = new StartDataFeedT();
      startDataFeed.dataFeeds = [dataFeedConfig, bonesDataFeedConfig];
      sendDataFeedPacket(DataFeedMessage.StartDataFeed, startDataFeed);
    }
  }, [isConnected, config?.debug, config?.devSettings?.fastDataFeed, livePreviews]);

  const flushPendingFeed = useCallback(() => {
    flushTimerRef.current = null;

    const pendingDatafeed = pendingDatafeedRef.current;
    const pendingBones = pendingBonesRef.current;
    pendingDatafeedRef.current = null;
    pendingBonesRef.current = null;

    if (pendingDatafeed) setDatafeed(pendingDatafeed);
    if (pendingBones) setBones(pendingBones);
  }, [setBones, setDatafeed]);

  const scheduleFeedFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.setTimeout(
      flushPendingFeed,
      UI_FEED_UPDATE_INTERVAL
    );
  }, [flushPendingFeed]);

  const handleDataFeedUpdate = useCallback(
    (packet: DataFeedUpdateT) => {
      if (packet.index === 0) {
        pendingDatafeedRef.current = packet;
      } else if (packet.index === 1) {
        pendingBonesRef.current = packet.bones;
      }
      scheduleFeedFlush();
    },
    [scheduleFeedFlush]
  );

  useDataFeedPacket(DataFeedMessage.DataFeedUpdate, handleDataFeedUpdate);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    updateSentryContext(devices);
  }, [devices]);

  useRPCPacket(RpcMessage.ResetResponse, (resetResponse: ResetResponseT) => {
    if (!config?.feedbackSound) return;
    handleResetSounds(config?.feedbackSoundVolume ?? 1, resetResponse);
  });

  useEffect(() => {
    if (!config) return;

    fetchCurrentFirmwareRelease(config.uuid).then(setCurrentFirmwareRelease);
    const interval = setInterval(() => {
      fetchCurrentFirmwareRelease(config.uuid).then(setCurrentFirmwareRelease);
    }, 3600000);
    return () => {
      clearInterval(interval);
    };
  }, [config?.uuid]);

  useLayoutEffect(() => {
    changeLocales([config?.lang || DEFAULT_LOCALE]);
  }, []);

  useLayoutEffect(() => {
    if (!config) return;
    if (config.errorTracking !== undefined) {
      // Alows for sentry to refresh if user change the setting once the gui
      // is initialized
      getSentryOrCompute(config.errorTracking ?? false, config.uuid, isSteam);
    }
  }, [config]);

  return {
    currentFirmwareRelease,
  };
}

export const AppContextC = createContext<AppContext>(undefined as any);

export function useAppContext() {
  const context = useContext<AppContext>(AppContextC);
  if (!context) {
    throw new Error('useAppContext must be within a AppContext Provider');
  }
  return context;
}
