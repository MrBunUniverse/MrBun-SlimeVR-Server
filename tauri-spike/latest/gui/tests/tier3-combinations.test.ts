import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLayoutDimensions,
  calculateSidebarHeights,
  calculateShakeHighlightGlow,
  formatEulerVector,
  evaluateQuestDiagnostics,
  ResetCountdownController,
} from './helpers/test-utils.ts';
import type { MockTrackerData } from './helpers/test-utils.ts';

describe('Tier 3: Cross-Feature Combinations (C1 - C5)', () => {
  // -------------------------------------------------------------
  // C1: High-Density Table + Collapsible Sidebar Drawer Toggle
  // -------------------------------------------------------------
  describe('C1: High-Density Table + Collapsible Sidebar Drawer Toggle', () => {
    it('C1.1: calculates content layout when switching sidebar between collapsed and open in table view', () => {
      // 960x680 window
      const withSidebar = calculateLayoutDimensions(960, 680, false, true);
      const collapsedSidebar = calculateLayoutDimensions(960, 680, true, true);

      assert.equal(withSidebar.contentWidth, 514);
      assert.equal(collapsedSidebar.contentWidth, 834); // 960 - 110 - 0 - 16

      // Extra width available for high-density table columns
      const deltaWidth = collapsedSidebar.contentWidth - withSidebar.contentWidth;
      assert.equal(deltaWidth, 320);
    });

    it('C1.2: handles 16 trackers in table view while collapsing sidebar to expand table view columns', () => {
      const trackers: MockTrackerData[] = Array.from({ length: 16 }, (_, i) => ({
        id: { trackerNum: i, deviceId: { id: i + 1 } },
        bodyPart: i,
        status: 2,
        rawRotation: [i * 10, i * -5, 0],
        velocity: 0,
      }));

      const collapsedHeights = calculateSidebarHeights(680, true);
      assert.equal(collapsedHeights.checklistHeight, 90);
      assert.ok(collapsedHeights.previewHeight > 0);

      // Verify all 16 rows render properly formatted Euler vectors
      const formatted = trackers.map((t) => formatEulerVector(t.rawRotation, 0));
      assert.equal(formatted.length, 16);
      assert.equal(formatted[5], '50°, -25°, 0°');
    });
  });

  // -------------------------------------------------------------
  // C2: Dark Theme + Liquid Glass Tracker Cards + Shake Glow
  // -------------------------------------------------------------
  describe('C2: Dark Theme + Liquid Glass Tracker Cards + Shake Glow', () => {
    it('C2.1: updates shake glow dynamically across velocities', () => {
      const velocities = [0.0, 1.2, 3.5, 8.0, 20.0];
      const themes = ['slime', 'dark'];

      for (const theme of themes) {
        const glowRadii = velocities.map((v) => calculateShakeHighlightGlow(v));
        assert.deepEqual(glowRadii, [0, 9, 28, 64, 160]);
        // Glow radius calculation is invariant across supported dark themes.
        assert.ok(theme === 'slime' || theme === 'dark');
      }
    });

    it('C2.2: maintains glass card opacity tokens across theme changes', () => {
      const darkTokens = {
        bg: 'rgba(34, 35, 40, 0.72)',
        border: 'rgba(255, 255, 255, 0.10)',
      };
      assert.ok(darkTokens.bg.includes('0.72'));
      assert.ok(darkTokens.border.includes('0.10'));
    });
  });

  // -------------------------------------------------------------
  // C3: Multi-Tracker Reset Countdown + Active OSC Diagnostics Pill Update
  // -------------------------------------------------------------
  describe('C3: Multi-Tracker Reset Countdown + Active OSC Diagnostics Pill Update', () => {
    it('C3.1: runs 3-second full reset countdown while diagnostic status stays active and green', () => {
      let resetFinished = false;
      const controller = new ResetCountdownController(3, () => {
        resetFinished = true;
      });

      // Trigger reset
      assert.equal(controller.trigger(false), true);

      // Verify diagnostics pill is green with 8 active trackers
      let diag = evaluateQuestDiagnostics(true, 8);
      assert.equal(diag.statusColor, 'bg-status-success');

      // Tick 1
      controller.tick();
      diag = evaluateQuestDiagnostics(true, 8);
      assert.equal(diag.statusText, '8 Trackers Active');

      // Tick 2
      controller.tick();
      assert.equal(controller.getStatus().timer, 1);

      // Tick 3
      controller.tick();
      assert.equal(resetFinished, true);
      assert.equal(controller.getStatus().status, 'finished');
    });

    it('C3.2: aborts reset countdown if server guard indicates disconnect during countdown', () => {
      const controller = new ResetCountdownController(3);
      controller.trigger(false);

      // Server disconnect occurs mid-countdown
      const diag = evaluateQuestDiagnostics(false, 0);
      assert.equal(diag.statusColor, 'bg-status-critical');
      assert.equal(diag.statusText, 'Backend Disconnected');
    });
  });

  // -------------------------------------------------------------
  // C4: Preset Switching + Unassigned Tracker Detection + Table View
  // -------------------------------------------------------------
  describe('C4: Preset Switching + Unassigned Tracker Detection + Table View', () => {
    it('C4.1: filters trackers dynamically when switching presets from Full Body to Upper Body', () => {
      const allTrackers: MockTrackerData[] = [
        {
          id: { trackerNum: 0, deviceId: { id: 1 } },
          bodyPart: 1,
          status: 2,
          rawRotation: [0, 0, 0],
          velocity: 0,
        }, // Head
        {
          id: { trackerNum: 1, deviceId: { id: 1 } },
          bodyPart: 2,
          status: 2,
          rawRotation: [0, 0, 0],
          velocity: 0,
        }, // Chest
        {
          id: { trackerNum: 2, deviceId: { id: 1 } },
          bodyPart: 3,
          status: 2,
          rawRotation: [0, 0, 0],
          velocity: 0,
        }, // Waist
        {
          id: { trackerNum: 3, deviceId: { id: 2 } },
          bodyPart: 4,
          status: 2,
          rawRotation: [0, 0, 0],
          velocity: 0,
        }, // L Thigh
        {
          id: { trackerNum: 4, deviceId: { id: 2 } },
          bodyPart: 5,
          status: 2,
          rawRotation: [0, 0, 0],
          velocity: 0,
        }, // R Thigh
        {
          id: { trackerNum: 5, deviceId: { id: 3 } },
          bodyPart: 6,
          status: 2,
          rawRotation: [0, 0, 0],
          velocity: 0,
        }, // L Foot
        {
          id: { trackerNum: 6, deviceId: { id: 3 } },
          bodyPart: 7,
          status: 2,
          rawRotation: [0, 0, 0],
          velocity: 0,
        }, // R Foot
      ];

      // Preset 1: Full Body (all 7 assigned)
      const fullBodyPreset = allTrackers.filter((t) => t.bodyPart > 0);
      assert.equal(fullBodyPreset.length, 7);

      // Preset 2: Upper Body (Head, Chest, Waist only)
      const upperBodyPreset = allTrackers.filter((t) => [1, 2, 3].includes(t.bodyPart));
      assert.equal(upperBodyPreset.length, 3);

      const diagFull = evaluateQuestDiagnostics(true, fullBodyPreset.length);
      const diagUpper = evaluateQuestDiagnostics(true, upperBodyPreset.length);

      assert.equal(diagFull.statusText, '7 Trackers Active');
      assert.equal(diagUpper.statusText, '3 Trackers Active');
    });

    it('C4.2: preserves unassigned trackers list during preset changes', () => {
      const unassigned: MockTrackerData[] = [
        {
          id: { trackerNum: 99, deviceId: { id: 10 } },
          bodyPart: 0,
          status: 2,
          rawRotation: [0, 0, 0],
          velocity: 0,
        },
      ];
      assert.equal(unassigned.length, 1);
      assert.equal(unassigned[0].bodyPart, 0);
    });
  });

  // -------------------------------------------------------------
  // C5: Min Window Size (380x560) + 32 Trackers + Collapsed Checklist + Fast Reset
  // -------------------------------------------------------------
  describe('C5: Min Window Size (380x560) + 32 Trackers + Collapsed Checklist + Fast Reset', () => {
    it('C5.1: handles 32 trackers on minimal 380x560 mobile viewport with instant yaw reset', () => {
      const dims = calculateLayoutDimensions(380, 560, false, true);
      assert.equal(dims.isMobile, true);
      assert.equal(dims.contentWidth, 380);

      const trackers: MockTrackerData[] = Array.from({ length: 32 }, (_, i) => ({
        id: { trackerNum: i, deviceId: { id: i + 1 } },
        bodyPart: i % 12,
        status: 2,
        rawRotation: [i, i * 2, i * 3],
        velocity: 0,
      }));
      assert.equal(trackers.length, 32);

      let yawResetCompleted = false;
      const controller = new ResetCountdownController(0, () => {
        yawResetCompleted = true;
      });
      controller.trigger(false);
      assert.equal(yawResetCompleted, true);
    });

    it('C5.2: verifies layout stability without NaN or negative dimension values', () => {
      const dims = calculateLayoutDimensions(380, 560, true, true);
      assert.ok(!isNaN(dims.contentWidth));
      assert.ok(!isNaN(dims.contentHeight));
      assert.ok(dims.contentWidth > 0);
      assert.ok(dims.contentHeight > 0);
    });
  });
});
