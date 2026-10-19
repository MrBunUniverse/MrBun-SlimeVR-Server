/**
 * Test Utilities and Simulation Harness for SlimeVR E2E Test Suite
 *
 * Provides mock data generators, FlatBuffers protocol simulators,
 * CSS token validators, and layout dimension calculators.
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface TrackerHardwareStatus {
  batteryPctEstimate?: number;
  batteryVoltage?: number;
  batteryRuntimeEstimate?: number;
  rssi?: number;
  ping?: number;
  temperature?: number;
  packetLossPct?: number;
}

export interface MockTrackerData {
  id: { trackerNum: number; deviceId: { id: number } };
  customName?: string;
  bodyPart: number;
  status: number; // 0 = NONE, 1 = DISCONNECTED, 2 = OK, 3 = TIMED_OUT, 4 = OCCLUDED
  rawRotation: [number, number, number]; // pitch, yaw, roll degrees
  refAdjustedRotation?: [number, number, number];
  velocity: number;
  isHmd?: boolean;
  hardwareStatus?: TrackerHardwareStatus;
}

export interface MockDeviceData {
  id: number;
  customName?: string;
  hardwareInfo?: {
    manufacturer?: string;
    hardwareModel?: string;
    firmwareVersion?: string;
  };
  hardwareStatus?: TrackerHardwareStatus;
}

export interface LayoutDimensions {
  windowWidth: number;
  windowHeight: number;
  topbarHeight: number;
  navbarWidth: number;
  sidebarWidth: number;
  contentWidth: number;
  contentHeight: number;
  isMobile: boolean;
}

/**
 * Calculates responsive UI layout grid dimensions based on window size and collapse states
 */
export function calculateLayoutDimensions(
  windowWidth: number,
  windowHeight: number,
  sidebarCollapsed: boolean,
  checklistCompleted: boolean
): LayoutDimensions {
  const isMobile = windowWidth < 640; // Tailwind `mobile` / `sm` boundary
  const topbarHeight = isMobile ? 44 : 38;
  const navbarWidth = isMobile ? 0 : 110;
  const navbarHeight = isMobile ? 73 : 0;

  // Sidebar expands to 380px or 320px depending on screen width if not collapsed
  let sidebarWidth = 0;
  if (!isMobile) {
    if (sidebarCollapsed) {
      sidebarWidth = 0;
    } else {
      sidebarWidth = windowWidth >= 1200 ? 380 : 320;
    }
  }

  // Margin offsets
  const marginX = isMobile ? 0 : 16; // 2 * 8px
  const marginY = isMobile ? 0 : 16; // 2 * 8px

  const contentWidth = Math.max(0, windowWidth - navbarWidth - sidebarWidth - marginX);
  const contentHeight = Math.max(
    0,
    windowHeight - topbarHeight - navbarHeight - marginY
  );

  return {
    windowWidth,
    windowHeight,
    topbarHeight,
    navbarWidth,
    sidebarWidth,
    contentWidth,
    contentHeight,
    isMobile,
  };
}

/**
 * Calculates Sidebar Drawer heights based on checklist completion & user toggle state
 */
export function calculateSidebarHeights(
  totalHeight: number,
  isClosed: boolean
): { checklistHeight: number; previewHeight: number } {
  const closedHeight = 90; // 90px collapsed checklist header
  if (isClosed) {
    const checklistHeight = closedHeight;
    const previewHeight = Math.max(0, totalHeight - closedHeight - 24);
    return { checklistHeight, previewHeight };
  } else {
    const checklistHeight = Math.max(0, totalHeight - 16);
    const previewHeight = 0;
    return { checklistHeight, previewHeight };
  }
}

/**
 * Computes shake highlight glow radius from IMU velocity
 */
export function calculateShakeHighlightGlow(velocity: number): number {
  if (velocity <= 0 || isNaN(velocity)) return 0;
  return Math.floor(Math.min(velocity, 50) * 8);
}

/**
 * Converts user height in meters to estimated height formatted in cm
 */
export function formatEstimatedHeight(userHeightMeters: number): string {
  if (!userHeightMeters || userHeightMeters <= 0) return '';
  const cm = (userHeightMeters * 100) / 0.936;
  return `${cm.toFixed(1)} cm`;
}

/**
 * Formats 3D rotation vector to string with given precision
 */
export function formatEulerVector(
  vector: [number, number, number],
  precision: number = 0
): string {
  const [x, y, z] = vector.map((v) => {
    if (Object.is(v, -0)) v = 0;
    return v.toFixed(precision);
  });
  return `${x}°, ${y}°, ${z}°`;
}

/**
 * Calculates battery display properties
 */
export function getBatteryStatus(hardware?: TrackerHardwareStatus): {
  pctFormatted: string;
  voltageFormatted: string;
  runtimeFormatted: string;
  level: 'critical' | 'warning' | 'normal' | 'full';
  isDisabled: boolean;
} {
  if (!hardware || hardware.batteryPctEstimate == null) {
    return {
      pctFormatted: '--',
      voltageFormatted: '--',
      runtimeFormatted: '--',
      level: 'normal',
      isDisabled: true,
    };
  }

  const pct = Math.max(0, Math.min(100, Math.round(hardware.batteryPctEstimate)));
  const voltage =
    hardware.batteryVoltage != null ? `${hardware.batteryVoltage.toFixed(2)} V` : '--';

  let runtimeFormatted = '--';
  if (hardware.batteryRuntimeEstimate != null && hardware.batteryRuntimeEstimate > 0) {
    const hours = Math.floor(hardware.batteryRuntimeEstimate / 3600);
    const mins = Math.floor((hardware.batteryRuntimeEstimate % 3600) / 60);
    runtimeFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }

  let level: 'critical' | 'warning' | 'normal' | 'full' = 'normal';
  if (pct <= 10) level = 'critical';
  else if (pct <= 25) level = 'warning';
  else if (pct >= 95) level = 'full';

  return {
    pctFormatted: `${pct}%`,
    voltageFormatted: voltage,
    runtimeFormatted,
    level,
    isDisabled: false,
  };
}

/**
 * Quest OSC diagnostics health evaluator
 */
export function evaluateQuestDiagnostics(
  isConnected: boolean,
  activeTrackersCount: number
): {
  statusColor: 'bg-status-success' | 'bg-status-warning' | 'bg-status-critical';
  statusText: string;
  oscReady: boolean;
} {
  if (!isConnected) {
    return {
      statusColor: 'bg-status-critical',
      statusText: 'Backend Disconnected',
      oscReady: false,
    };
  }
  if (activeTrackersCount > 0) {
    return {
      statusColor: 'bg-status-success',
      statusText: `${activeTrackersCount} Trackers Active`,
      oscReady: true,
    };
  }
  return {
    statusColor: 'bg-status-warning',
    statusText: '0 Trackers Active',
    oscReady: true,
  };
}

/**
 * Reset countdown simulation state machine
 */
export class ResetCountdownController {
  private duration: number;
  private timer: number;
  private status: 'idle' | 'counting' | 'finished' | 'error';
  private error: string | null = null;
  private onReseted?: () => void;
  private onFailed?: () => void;

  constructor(durationSeconds: number, onReseted?: () => void, onFailed?: () => void) {
    this.duration = durationSeconds;
    this.timer = durationSeconds;
    this.status = 'idle';
    this.onReseted = onReseted;
    this.onFailed = onFailed;
  }

  public trigger(isGuarded: boolean = false, guardReason: string = ''): boolean {
    if (isGuarded) {
      this.status = 'error';
      this.error = guardReason || 'Server guard locked';
      if (this.onFailed) this.onFailed();
      return false;
    }
    if (this.duration <= 0) {
      this.status = 'finished';
      if (this.onReseted) this.onReseted();
      return true;
    }
    this.status = 'counting';
    this.timer = this.duration;
    return true;
  }

  public tick(): { timer: number; progress: number; finished: boolean } {
    if (this.status !== 'counting') {
      return { timer: this.timer, progress: 0, finished: this.status === 'finished' };
    }
    this.timer -= 1;
    const progress = (this.duration - this.timer) / this.duration;
    if (this.timer <= 0) {
      this.status = 'finished';
      if (this.onReseted) this.onReseted();
      return { timer: 0, progress: 1.0, finished: true };
    }
    return { timer: this.timer, progress, finished: false };
  }

  public getStatus() {
    return { status: this.status, timer: this.timer, error: this.error };
  }
}
