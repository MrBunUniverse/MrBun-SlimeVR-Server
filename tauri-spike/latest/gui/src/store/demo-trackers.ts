import { atom } from 'jotai';
import {
  BodyPart,
  DeviceDataT,
  TrackerDataT,
  TrackerInfoT,
  TrackerIdT,
  DeviceIdT,
  TrackerStatus,
  QuatT,
  Vec3fT,
} from 'solarxr-protocol';
import { FlatDeviceTracker } from './app-store';

// Stored in localStorage so user preference persists
const DEMO_MODE_STORAGE_KEY = 'slimevr-demo-trackers-enabled';

const initialDemoState =
  typeof window !== 'undefined'
    ? localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true'
    : false;

export const demoModeAtom = atom<boolean>(initialDemoState);

export const toggleDemoModeAtom = atom(
  (get) => get(demoModeAtom),
  (get, set) => {
    const next = !get(demoModeAtom);
    set(demoModeAtom, next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(DEMO_MODE_STORAGE_KEY, String(next));
    }
  }
);

function createMockTracker({
  id,
  trackerNum,
  name,
  bodyPart,
  batteryPct,
  voltage,
  ping,
  rssi,
  status = TrackerStatus.OK,
}: {
  id: number;
  trackerNum: number;
  name: string;
  bodyPart: BodyPart;
  batteryPct: number;
  voltage: number;
  ping: number;
  rssi: number;
  status?: TrackerStatus;
}): FlatDeviceTracker {
  const device = new DeviceDataT();
  device.id = new DeviceIdT(id);
  device.customName = `SlimeVR #${id}`;
  device.hardwareInfo = null;
  device.hardwareStatus = {
    errorStatus: null,
    ping,
    rssi,
    mcuTemp: 34.2,
    batteryVoltage: voltage,
    batteryPctEstimate: batteryPct,
    packType: () => null,
    unpack: () => null,
  } as any;

  const tracker = new TrackerDataT();
  tracker.trackerId = new TrackerIdT(new DeviceIdT(id), trackerNum);
  const info = new TrackerInfoT();
  info.customName = name;
  info.displayName = name;
  info.bodyPart = bodyPart;
  info.isImu = true;
  info.editable = true;
  info.isComputed = false;
  tracker.info = info;
  tracker.status = status;
  tracker.tps = 100;
  tracker.rotation = new QuatT(0, 0, 0, 1);
  tracker.rotationReferenceAdjusted = new QuatT(0, 0, 0, 1);
  tracker.rotationIdentityAdjusted = new QuatT(0, 0, 0, 1);
  tracker.linearAcceleration = new Vec3fT(0, 0, 0);

  return { device, tracker };
}

// Varied battery levels and statuses to demo every 3-ball status condition:
// - 95%: 3 Green balls (Full battery)
// - 85%: 2 Green, 1 Yellow (80%+)
// - 68%: 2 Green, 1 Red (Under 80%)
// - 48%: 1 Green, 1 Yellow, 1 Red (~Half battery)
// - 28%: 1 Yellow, 2 Red (Low battery)
// - 12%: 3 Red balls (Almost dead / Critical)
// - 0% (Dead): 3 Dim Red balls
// - Disconnected: 3 Grey balls
export const DEMO_TRACKERS_SET: FlatDeviceTracker[] = [
  // 1. Full Battery (>= 90%) -> 3 Green balls
  createMockTracker({
    id: 1,
    trackerNum: 0,
    name: 'Chest Tracker',
    bodyPart: BodyPart.CHEST,
    batteryPct: 95,
    voltage: 4.18,
    ping: 11,
    rssi: -52,
    status: TrackerStatus.OK,
  }),
  // 2. High Battery (80% - 89%) -> 2 Green, 1 Yellow
  createMockTracker({
    id: 2,
    trackerNum: 0,
    name: 'Waist / Hip Tracker',
    bodyPart: BodyPart.HIP,
    batteryPct: 85,
    voltage: 4.02,
    ping: 13,
    rssi: -55,
    status: TrackerStatus.OK,
  }),
  // 3. Under 80% (60% - 79%) -> 2 Green, 1 Red
  createMockTracker({
    id: 3,
    trackerNum: 0,
    name: 'Left Upper Leg',
    bodyPart: BodyPart.LEFT_UPPER_LEG,
    batteryPct: 72,
    voltage: 3.88,
    ping: 15,
    rssi: -58,
    status: TrackerStatus.OK,
  }),
  // 4. Half Battery (~50%) -> 1 Green, 1 Yellow, 1 Red
  createMockTracker({
    id: 4,
    trackerNum: 0,
    name: 'Right Upper Leg',
    bodyPart: BodyPart.RIGHT_UPPER_LEG,
    batteryPct: 48,
    voltage: 3.75,
    ping: 14,
    rssi: -57,
    status: TrackerStatus.OK,
  }),
  // 5. Low Battery (20% - 39%) -> 1 Yellow, 2 Red
  createMockTracker({
    id: 5,
    trackerNum: 0,
    name: 'Left Lower Leg',
    bodyPart: BodyPart.LEFT_LOWER_LEG,
    batteryPct: 28,
    voltage: 3.65,
    ping: 16,
    rssi: -62,
    status: TrackerStatus.OK,
  }),
  // 6. Almost Dead / Critical (1% - 19%) -> 3 Red balls
  createMockTracker({
    id: 6,
    trackerNum: 0,
    name: 'Right Lower Leg',
    bodyPart: BodyPart.RIGHT_LOWER_LEG,
    batteryPct: 12,
    voltage: 3.52,
    ping: 18,
    rssi: -65,
    status: TrackerStatus.OK,
  }),
  // 7. Dead (0% battery) -> 3 Dim Red balls
  createMockTracker({
    id: 7,
    trackerNum: 0,
    name: 'Left Foot (Dead)',
    bodyPart: BodyPart.LEFT_FOOT,
    batteryPct: 0,
    voltage: 3.25,
    ping: 25,
    rssi: -72,
    status: TrackerStatus.OK,
  }),
  // 8. Disconnected Tracker -> 3 Grey balls
  createMockTracker({
    id: 8,
    trackerNum: 0,
    name: 'Right Foot (Offline)',
    bodyPart: BodyPart.RIGHT_FOOT,
    batteryPct: 0,
    voltage: 0,
    ping: 0,
    rssi: 0,
    status: TrackerStatus.DISCONNECTED,
  }),
];
