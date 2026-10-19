import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BodyPart,
  DataFeedMessage,
  DataFeedUpdateT,
  TrackerStatus,
} from 'solarxr-protocol';
import { HeartModel, HeartProfile, ActivityTracker } from '@/utils/adaptive-bpm';
import { useWebsocketAPI } from './websocket-api';

const TORSO = [BodyPart.CHEST, BodyPart.UPPER_CHEST, BodyPart.WAIST, BodyPart.HIP];
const THIGHS = [BodyPart.LEFT_UPPER_LEG, BodyPart.RIGHT_UPPER_LEG];
const LEGS = [
  BodyPart.LEFT_LOWER_LEG,
  BodyPart.RIGHT_LOWER_LEG,
  BodyPart.LEFT_FOOT,
  BodyPart.RIGHT_FOOT,
];

/** Five minutes of readings, one every 5 s, for the panel's graph. */
const HISTORY_POINTS = 60;

/** Runs the heart model on live tracker movement. */
export function useHeartRate(active: boolean, profile: HeartProfile) {
  const { useDataFeedPacket, isConnected } = useWebsocketAPI();
  const model = useRef(new HeartModel());
  model.current.profile = profile;
  const [state, setState] = useState(() => model.current.snapshot(performance.now()));
  const [history, setHistory] = useState<number[]>([]);
  const live = active && isConnected;

  const receive = useCallback(
    (packet: DataFeedUpdateT) => {
      if (!live || !packet.devices.length) return;
      const trackers: ActivityTracker[] = [];
      for (const device of packet.devices) {
        for (const tracker of device.trackers) {
          if (
            !tracker.info?.isImu ||
            tracker.status !== TrackerStatus.OK ||
            !tracker.rotation ||
            tracker.tps === 0
          )
            continue;
          const part = tracker.info.bodyPart;
          trackers.push({
            id: `${tracker.trackerId?.deviceId?.id}:${tracker.trackerId?.trackerNum}`,
            role: TORSO.includes(part)
              ? 'torso'
              : THIGHS.includes(part)
                ? 'thigh'
                : LEGS.includes(part)
                  ? 'leg'
                  : 'other',
            rotation: tracker.rotation,
            acceleration: tracker.linearAcceleration,
            postureRotation: tracker.rotationReferenceAdjusted,
          });
        }
      }
      model.current.sample(trackers, performance.now());
    },
    [live]
  );
  useDataFeedPacket(DataFeedMessage.DataFeedUpdate, receive);

  // The heart keeps beating between data frames: step it 4 times a second, show it once a second.
  useEffect(() => {
    if (!active) return;
    let ticks = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      model.current.step(now);
      if (++ticks % 4) return;
      const snap = model.current.snapshot(now);
      setState(snap);
      if (ticks % 20 === 0 && snap.available)
        setHistory((h) => [...h, snap.bpm].slice(-HISTORY_POINTS));
    }, 250);
    return () => clearInterval(timer);
  }, [active]);

  return { ...state, history, available: active && state.available };
}
