import { useMemo } from 'react';
import { DataFeedConfigT, DeviceDataMaskT, TrackerDataMaskT } from 'solarxr-protocol';
import { useConfig } from './config';

export function useDataFeedConfig(livePreview = false) {
  const { config } = useConfig();

  const fastDataFeed = config?.debug && config?.devSettings?.fastDataFeed;
  const feedMaxTps = fastDataFeed ? 90 : livePreview ? 30 : 10;

  return useMemo(() => {
    const trackerData = new TrackerDataMaskT();
    trackerData.position = true;
    trackerData.rotation = true;
    trackerData.info = true;
    trackerData.status = true;
    trackerData.temp = true;
    trackerData.linearAcceleration = true;
    trackerData.rotationReferenceAdjusted = true;
    trackerData.rotationIdentityAdjusted = true;
    trackerData.tps = true;
    trackerData.rawMagneticVector = true;
    trackerData.stayAligned = true;
    trackerData.recovery = true;
    trackerData.adaptiveDrift = true;
    trackerData.filterHealth = true;

    const dataMask = new DeviceDataMaskT();
    dataMask.deviceData = true;
    dataMask.trackerData = trackerData;

    const dataFeedConfig = new DataFeedConfigT();
    dataFeedConfig.dataMask = dataMask;
    dataFeedConfig.boneMask = false;
    dataFeedConfig.minimumTimeSinceLast = 1000 / feedMaxTps;
    dataFeedConfig.syntheticTrackersMask = trackerData;
    dataFeedConfig.stayAlignedPoseMask = true;
    dataFeedConfig.serverGuardsMask = true;

    return { dataFeedConfig, feedMaxTps };
  }, [feedMaxTps]);
}

export function useBonesDataFeedConfig() {
  const { config } = useConfig();

  const fastDataFeed = config?.debug && config?.devSettings?.fastDataFeed;
  const feedMaxTps = fastDataFeed ? 90 : 40;

  return useMemo(() => {
    const dataFeedConfig = new DataFeedConfigT();
    dataFeedConfig.boneMask = true;
    dataFeedConfig.minimumTimeSinceLast = 1000 / feedMaxTps;
    return dataFeedConfig;
  }, [feedMaxTps]);
}
