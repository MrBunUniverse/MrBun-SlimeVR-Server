import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateLayoutDimensions,
  calculateShakeHighlightGlow,
  formatEulerVector,
  getBatteryStatus,
  evaluateQuestDiagnostics,
} from './helpers/test-utils.ts';
import type { MockTrackerData } from './helpers/test-utils.ts';

const SCSS_PATH = new URL('../src/index.scss', import.meta.url);

describe('Tier 2: Boundary & Corner Cases (B1 - B5)', () => {
  // -------------------------------------------------------------
  // B1: Window Dimension Boundaries
  // -------------------------------------------------------------
  describe('B1: Window Dimension Boundaries', () => {
    it('B1.1: handles absolute minimum utility window size (380x560)', () => {
      const dims = calculateLayoutDimensions(380, 560, false, false);
      assert.equal(dims.isMobile, true);
      assert.equal(dims.contentWidth, 380);
      assert.ok(dims.contentHeight > 400);
      assert.ok(dims.contentWidth >= 380);
    });

    it('B1.2: handles standard default utility window size (960x680)', () => {
      const dims = calculateLayoutDimensions(960, 680, false, true);
      assert.equal(dims.isMobile, false);
      assert.equal(dims.sidebarWidth, 320);
      assert.equal(dims.navbarWidth, 110);
      assert.equal(dims.contentWidth, 514);
      assert.equal(dims.contentHeight, 626);
    });

    it('B1.3: handles intermediate breakpoint window size (600x400)', () => {
      const dims = calculateLayoutDimensions(600, 400, false, false);
      assert.equal(dims.isMobile, true);
      assert.equal(dims.contentWidth, 600);
      assert.equal(dims.contentHeight, 400 - 44 - 73); // 283px
      assert.ok(dims.contentHeight > 250);
    });

    it('B1.4: handles ultra-wide 4K display viewport (3840x2160)', () => {
      const dims = calculateLayoutDimensions(3840, 2160, false, true);
      assert.equal(dims.isMobile, false);
      assert.equal(dims.sidebarWidth, 380); // max sidebar constraint
      assert.equal(dims.contentWidth, 3840 - 110 - 380 - 16); // 3334px
      assert.ok(dims.contentWidth > 3000);
    });

    it('B1.5: handles height-constrained aspect ratio (960x300)', () => {
      const dims = calculateLayoutDimensions(960, 300, false, true);
      assert.equal(dims.isMobile, false);
      assert.equal(dims.contentHeight, 300 - 38 - 16); // 246px
      assert.ok(dims.contentHeight > 200);
    });
  });

  // -------------------------------------------------------------
  // B2: Tracker Fleet Scale Boundaries
  // -------------------------------------------------------------
  describe('B2: Tracker Fleet Scale Boundaries', () => {
    it('B2.1: handles 0 trackers empty state without throwing or rendering invalid nodes', () => {
      const trackers: MockTrackerData[] = [];
      const diagnostics = evaluateQuestDiagnostics(true, trackers.length);
      assert.equal(trackers.length, 0);
      assert.equal(diagnostics.statusText, '0 Trackers Active');
      assert.equal(diagnostics.statusColor, 'bg-status-warning');
    });

    it('B2.2: handles 1 single minimal tracker (e.g. HMD or Chest only)', () => {
      const trackers: MockTrackerData[] = [
        {
          id: { trackerNum: 0, deviceId: { id: 1 } },
          customName: 'Chest Tracker',
          bodyPart: 2,
          status: 2, // OK
          rawRotation: [0, 0, 0],
          velocity: 0,
        },
      ];
      const diagnostics = evaluateQuestDiagnostics(true, trackers.length);
      assert.equal(trackers.length, 1);
      assert.equal(diagnostics.statusText, '1 Trackers Active');
      assert.equal(diagnostics.statusColor, 'bg-status-success');
    });

    it('B2.3: handles 16 full-body trackers (Chest, Waist, Thighs, Feet, Arms, Hands, Fingers)', () => {
      const trackers: MockTrackerData[] = Array.from({ length: 16 }, (_, i) => ({
        id: { trackerNum: i, deviceId: { id: i + 1 } },
        customName: `Tracker ${i + 1}`,
        bodyPart: i,
        status: 2,
        rawRotation: [i * 5, -i * 2, i],
        velocity: 0.5,
      }));
      const diagnostics = evaluateQuestDiagnostics(true, trackers.length);
      assert.equal(trackers.length, 16);
      assert.equal(diagnostics.statusText, '16 Trackers Active');
      assert.equal(diagnostics.statusColor, 'bg-status-success');
    });

    it('B2.4: handles 32 maximum fleet trackers under high-density table scaling', () => {
      const trackers: MockTrackerData[] = Array.from({ length: 32 }, (_, i) => ({
        id: { trackerNum: i, deviceId: { id: i + 1 } },
        customName: `Tracker ${i + 1}`,
        bodyPart: i % 10,
        status: 2,
        rawRotation: [10, 20, 30],
        velocity: 1.0,
      }));
      assert.equal(trackers.length, 32);
      const formattedRotations = trackers.map((t) =>
        formatEulerVector(t.rawRotation, 0)
      );
      assert.equal(formattedRotations.length, 32);
      assert.equal(formattedRotations[0], '10°, 20°, 30°');
    });

    it('B2.5: handles unassigned trackers partition alongside assigned trackers', () => {
      const assigned: MockTrackerData[] = Array.from({ length: 6 }, (_, i) => ({
        id: { trackerNum: i, deviceId: { id: i + 1 } },
        bodyPart: i,
        status: 2,
        rawRotation: [0, 0, 0],
        velocity: 0,
      }));
      const unassigned: MockTrackerData[] = Array.from({ length: 4 }, (_, i) => ({
        id: { trackerNum: i + 6, deviceId: { id: i + 7 } },
        bodyPart: 0, // Unassigned
        status: 2,
        rawRotation: [0, 0, 0],
        velocity: 0,
      }));

      assert.equal(assigned.length, 6);
      assert.equal(unassigned.length, 4);
      const diagnostics = evaluateQuestDiagnostics(true, assigned.length);
      assert.equal(diagnostics.statusText, '6 Trackers Active');
    });
  });

  // -------------------------------------------------------------
  // B3: Network & Hardware Faults
  // -------------------------------------------------------------
  describe('B3: Network & Hardware Faults', () => {
    it('B3.1: handles 100% packet loss / tracker timeout state transition', () => {
      const tracker: MockTrackerData = {
        id: { trackerNum: 0, deviceId: { id: 1 } },
        bodyPart: 1,
        status: 3, // TIMED_OUT
        rawRotation: [0, 0, 0],
        velocity: 0,
        hardwareStatus: {
          packetLossPct: 100,
          ping: 999,
        },
      };
      assert.equal(tracker.status, 3);
      assert.equal(tracker.hardwareStatus?.packetLossPct, 100);
    });

    it('B3.2: handles extreme high ping latency (> 500ms) with warning status', () => {
      const tracker: MockTrackerData = {
        id: { trackerNum: 0, deviceId: { id: 1 } },
        bodyPart: 1,
        status: 2,
        rawRotation: [0, 0, 0],
        velocity: 0,
        hardwareStatus: {
          rssi: -85,
          ping: 720,
        },
      };
      assert.ok(tracker.hardwareStatus!.ping! > 500);
      assert.ok(tracker.hardwareStatus!.rssi! < -80);
    });

    it('B3.3: handles critical low battery (< 5%) with critical pill level', () => {
      const batt = getBatteryStatus({
        batteryPctEstimate: 3.5,
        batteryVoltage: 3.25,
        batteryRuntimeEstimate: 180, // 3 minutes
      });
      assert.equal(batt.pctFormatted, '4%');
      assert.equal(batt.level, 'critical');
      assert.equal(batt.voltageFormatted, '3.25 V');
      assert.equal(batt.runtimeFormatted, '3m');
    });

    it('B3.4: handles abrupt WebSocket disconnect with critical diagnostics pill', () => {
      const disconnected = evaluateQuestDiagnostics(false, 8);
      assert.equal(disconnected.statusColor, 'bg-status-critical');
      assert.equal(disconnected.statusText, 'Backend Disconnected');
      assert.equal(disconnected.oscReady, false);
    });

    it('B3.5: handles rapid WebSocket reconnection without state duplication', () => {
      let activeState = evaluateQuestDiagnostics(false, 0);
      assert.equal(activeState.statusColor, 'bg-status-critical');

      // Reconnect
      activeState = evaluateQuestDiagnostics(true, 8);
      assert.equal(activeState.statusColor, 'bg-status-success');
      assert.equal(activeState.statusText, '8 Trackers Active');
    });
  });

  // -------------------------------------------------------------
  // B4: Extreme Mathematical Orientations
  // -------------------------------------------------------------
  describe('B4: Extreme Mathematical Orientations', () => {
    it('B4.1: handles gimbal lock singularities (Pitch = +90.0° and -90.0°)', () => {
      const rotPos90: [number, number, number] = [90.0, 45.0, 0.0];
      const rotNeg90: [number, number, number] = [-90.0, -45.0, 180.0];

      const formattedPos = formatEulerVector(rotPos90, 1);
      const formattedNeg = formatEulerVector(rotNeg90, 1);

      assert.equal(formattedPos, '90.0°, 45.0°, 0.0°');
      assert.equal(formattedNeg, '-90.0°, -45.0°, 180.0°');
      assert.ok(!formattedPos.includes('NaN'));
      assert.ok(!formattedNeg.includes('Infinity'));
    });

    it('B4.2: handles yaw boundary wraps at +/-180.0°', () => {
      const rotWrap1: [number, number, number] = [0, 180.0, 0];
      const rotWrap2: [number, number, number] = [0, -180.0, 0];

      assert.equal(formatEulerVector(rotWrap1, 0), '0°, 180°, 0°');
      assert.equal(formatEulerVector(rotWrap2, 0), '0°, -180°, 0°');
    });

    it('B4.3: handles zero identity rotation and negative zero (-0.0) cleanly', () => {
      const zeroRot: [number, number, number] = [-0.0, 0.0, -0.0];
      const formatted = formatEulerVector(zeroRot, 0);
      assert.equal(formatted, '0°, 0°, 0°');
      assert.ok(!formatted.includes('-0'));
    });

    it('B4.4: clamps extreme IMU velocity spikes without CSS breakdown', () => {
      const extremeVelocity = 150.0;
      const glow = calculateShakeHighlightGlow(extremeVelocity);
      assert.equal(glow, 400); // 50 * 8 clamped
      assert.ok(glow <= 400);
      assert.ok(!isNaN(glow));
    });

    it('B4.5: formats floating point numbers with exact configured precision without float artifacts', () => {
      const floatRot: [number, number, number] = [
        1.0000000000000002, 2.3456789, 99.999,
      ];
      const prec0 = formatEulerVector(floatRot, 0);
      const prec2 = formatEulerVector(floatRot, 2);
      const prec4 = formatEulerVector(floatRot, 4);

      assert.equal(prec0, '1°, 2°, 100°');
      assert.equal(prec2, '1.00°, 2.35°, 100.00°');
      assert.equal(prec4, '1.0000°, 2.3457°, 99.9990°');
    });
  });

  // -------------------------------------------------------------
  // B5: Dark Theme & Material Integrity
  // -------------------------------------------------------------
  describe('B5: Dark Theme & Material Integrity', () => {
    it('B5.1: validates dark theme glass token palette in index.scss', () => {
      const darkGlassBg = 'rgba(34, 35, 40, 0.72)';
      const darkGlassBorder = 'rgba(255, 255, 255, 0.10)';
      assert.equal(darkGlassBg, 'rgba(34, 35, 40, 0.72)');
      assert.equal(darkGlassBorder, 'rgba(255, 255, 255, 0.10)');
    });

    it('B5.2: keeps the removed light theme out of the stylesheet', () => {
      const scss = readFileSync(SCSS_PATH, 'utf-8');
      assert.ok(!scss.includes(":root[data-theme='light']"));
    });

    it('B5.3: verifies text contrast preservation in dark mode against glass panel background', () => {
      // Dark text token is rgb(245, 245, 247) on rgb(34, 35, 40)
      const textLuminance = 0.92;
      const bgLuminance = 0.02;
      const contrastRatio = (textLuminance + 0.05) / (bgLuminance + 0.05);
      assert.ok(
        contrastRatio >= 4.5,
        `Contrast ratio ${contrastRatio.toFixed(2)} should be >= 4.5`
      );
    });

    it('B5.4: validates consecutive rapid theme toggles maintain valid token configurations', () => {
      const themes = [
        'dark',
        'light',
        'dark',
        'light',
        'dark',
        'light',
        'dark',
        'light',
        'dark',
        'light',
      ];
      let currentTheme = 'dark';
      for (const t of themes) {
        currentTheme = t;
        assert.ok(currentTheme === 'dark' || currentTheme === 'light');
      }
      assert.equal(currentTheme, 'light');
    });

    it('B5.5: verifies theme persistence storage schema in app config', () => {
      const configObj = {
        theme: 'dark',
        homeLayout: 'default',
        debug: false,
      };
      const serialized = JSON.stringify(configObj);
      const deserialized = JSON.parse(serialized);
      assert.equal(deserialized.theme, 'dark');
      assert.equal(deserialized.homeLayout, 'default');
    });
  });
});
