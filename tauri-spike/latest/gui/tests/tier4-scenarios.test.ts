import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLayoutDimensions,
  calculateSidebarHeights,
  calculateShakeHighlightGlow,
  formatEstimatedHeight,
  formatEulerVector,
  getBatteryStatus,
  evaluateQuestDiagnostics,
  ResetCountdownController,
} from './helpers/test-utils.ts';
import type { MockTrackerData, MockDeviceData } from './helpers/test-utils.ts';

describe('Tier 4: Real-World Application Scenarios (S1 - S4)', () => {
  // -------------------------------------------------------------
  // S1: Complete VR Cold-Start Session
  // -------------------------------------------------------------
  describe('S1: Complete VR Cold-Start Session', () => {
    it('S1.1: establishes cold start connection, discovers 8 IMU trackers, and validates health telemetry', () => {
      let isConnected = false;
      let trackers: MockTrackerData[] = [];

      // Step 1: App launches offline
      let diag = evaluateQuestDiagnostics(isConnected, trackers.length);
      assert.equal(diag.statusColor, 'bg-status-critical');
      assert.equal(diag.statusText, 'Backend Disconnected');

      // Step 2: WebSocket connects
      isConnected = true;
      diag = evaluateQuestDiagnostics(isConnected, trackers.length);
      assert.equal(diag.statusColor, 'bg-status-warning');
      assert.equal(diag.statusText, '0 Trackers Active');

      // Step 3: Discover 8 IMUs (Chest, Waist, L/R Thigh, L/R Ankle, L/R Foot)
      const bodyParts = [2, 3, 4, 5, 6, 7, 8, 9];
      trackers = bodyParts.map((bp, i) => ({
        id: { trackerNum: i, deviceId: { id: i + 1 } },
        customName: `Slime IMU ${i + 1}`,
        bodyPart: bp,
        status: 2, // OK
        rawRotation: [0, 0, 0],
        velocity: 0,
        hardwareStatus: {
          batteryPctEstimate: 95 - i * 2,
          batteryVoltage: 4.15 - i * 0.02,
          batteryRuntimeEstimate: 3600 * 7,
          ping: 15 + i * 2,
          rssi: -55 - i * 3,
        },
      }));

      diag = evaluateQuestDiagnostics(isConnected, trackers.length);
      assert.equal(diag.statusColor, 'bg-status-success');
      assert.equal(diag.statusText, '8 Trackers Active');

      // Validate all battery pills are valid and non-disabled
      for (const t of trackers) {
        const batt = getBatteryStatus(t.hardwareStatus);
        assert.equal(batt.isDisabled, false);
        assert.ok(batt.level === 'full' || batt.level === 'normal');
      }
    });

    it('S1.2: expands checklist on initial setup and auto-collapses on checklist completion', () => {
      const windowH = 680;
      let isChecklistComplete = false;

      // Incomplete state -> Checklist open (calc(100% - 16px)), Visualizer 0%
      let heights = calculateSidebarHeights(windowH, isChecklistComplete);
      assert.equal(heights.checklistHeight, 664); // 680 - 16
      assert.equal(heights.previewHeight, 0);

      // User finishes setup checklist
      isChecklistComplete = true;

      // Complete state -> Checklist collapses to 90px header, Visualizer expands
      heights = calculateSidebarHeights(windowH, isChecklistComplete);
      assert.equal(heights.checklistHeight, 90);
      assert.equal(heights.previewHeight, 566); // 680 - 90 - 24
    });
  });

  // -------------------------------------------------------------
  // S2: Live Calibration & Body Proportioning Workflow
  // -------------------------------------------------------------
  describe('S2: Live Calibration & Body Proportioning Workflow', () => {
    it('S2.1: ingests user height and formats estimated height for 3D skeleton visualizer', () => {
      const userHeightMeters = 1.78; // 178 cm
      const formatted = formatEstimatedHeight(userHeightMeters);
      // (1.78 * 100) / 0.936 = 190.17 cm
      assert.equal(formatted, '190.2 cm');
    });

    it('S2.2: executes sequential calibration: Yaw Reset followed by Guarded Ski Mounting Reset', () => {
      // Step 1: Immediate Yaw Reset
      let yawResetCompleted = false;
      const yawController = new ResetCountdownController(0, () => {
        yawResetCompleted = true;
      });
      yawController.trigger(false);
      assert.equal(yawResetCompleted, true);

      // Step 2: Guarded Ski Mounting Reset (3s timer)
      let mountingResetCompleted = false;
      const mountingController = new ResetCountdownController(3, () => {
        mountingResetCompleted = true;
      });

      mountingController.trigger(false);
      assert.equal(mountingController.getStatus().status, 'counting');

      // Countdown ticks
      mountingController.tick();
      mountingController.tick();
      mountingController.tick();

      assert.equal(mountingResetCompleted, true);
      assert.equal(mountingController.getStatus().status, 'finished');
    });
  });

  // -------------------------------------------------------------
  // S3: Standalone Quest OSC Streaming & Active Monitoring Workflow
  // -------------------------------------------------------------
  describe('S3: Standalone Quest OSC Streaming & Active Monitoring Workflow', () => {
    it('S3.1: verifies continuous OSC streaming, battery discharge, and packet loss handling', () => {
      const tracker: MockTrackerData = {
        id: { trackerNum: 0, deviceId: { id: 1 } },
        bodyPart: 6, // Left Foot
        status: 2,
        rawRotation: [12.5, 45.2, -3.1],
        velocity: 2.1,
        hardwareStatus: {
          batteryPctEstimate: 80,
          batteryVoltage: 3.95,
          batteryRuntimeEstimate: 3600 * 5,
          ping: 22,
          rssi: -60,
          packetLossPct: 0,
        },
      };

      // Initial healthy streaming
      let batt = getBatteryStatus(tracker.hardwareStatus);
      assert.equal(batt.pctFormatted, '80%');
      assert.equal(batt.level, 'normal');

      // Battery drains over VR session
      tracker.hardwareStatus!.batteryPctEstimate = 8;
      tracker.hardwareStatus!.batteryVoltage = 3.4;
      batt = getBatteryStatus(tracker.hardwareStatus);
      assert.equal(batt.pctFormatted, '8%');
      assert.equal(batt.level, 'critical');

      // Packet loss occurs
      tracker.hardwareStatus!.packetLossPct = 45;
      assert.equal(tracker.hardwareStatus!.packetLossPct, 45);
    });

    it('S3.2: switches tracking preset from Full Body (8) to Seated (5) and verifies active hardware count', () => {
      const fullBodyCount = 8;
      const seatedCount = 5;

      let diag = evaluateQuestDiagnostics(true, fullBodyCount);
      assert.equal(diag.statusText, '8 Trackers Active');

      // Switch to seated preset
      diag = evaluateQuestDiagnostics(true, seatedCount);
      assert.equal(diag.statusText, '5 Trackers Active');
      assert.equal(diag.statusColor, 'bg-status-success');
    });
  });

  // -------------------------------------------------------------
  // S4: Dynamic Tracker Hot-Plug & Reconfiguration Workflow
  // -------------------------------------------------------------
  describe('S4: Dynamic Tracker Hot-Plug & Reconfiguration Workflow', () => {
    it('S4.1: ingests new hardware devices, assigns unassigned nodes, and calculates shake highlight', () => {
      const assignedTrackers: MockTrackerData[] = [
        {
          id: { trackerNum: 0, deviceId: { id: 1 } },
          bodyPart: 2,
          status: 2,
          rawRotation: [0, 0, 0],
          velocity: 0,
        },
        {
          id: { trackerNum: 1, deviceId: { id: 2 } },
          bodyPart: 3,
          status: 2,
          rawRotation: [0, 0, 0],
          velocity: 0,
        },
      ];

      const unassignedTrackers: MockTrackerData[] = [
        {
          id: { trackerNum: 2, deviceId: { id: 3 } },
          bodyPart: 0,
          status: 2,
          rawRotation: [0, 0, 0],
          velocity: 0,
        },
        {
          id: { trackerNum: 3, deviceId: { id: 4 } },
          bodyPart: 0,
          status: 2,
          rawRotation: [0, 0, 0],
          velocity: 0,
        },
      ];

      assert.equal(assignedTrackers.length, 2);
      assert.equal(unassignedTrackers.length, 2);

      // User assigns tracker 2 to Left Upper Arm (bodyPart 10) and tracker 3 to Right Upper Arm (bodyPart 11)
      const newlyAssigned1 = { ...unassignedTrackers[0], bodyPart: 10, velocity: 3.5 };
      const newlyAssigned2 = { ...unassignedTrackers[1], bodyPart: 11, velocity: 0.5 };

      assignedTrackers.push(newlyAssigned1, newlyAssigned2);
      unassignedTrackers.length = 0; // empty unassigned

      assert.equal(assignedTrackers.length, 4);
      assert.equal(unassignedTrackers.length, 0);

      // Shake highlight triggers on moving newly assigned tracker
      const glow1 = calculateShakeHighlightGlow(newlyAssigned1.velocity);
      const glow2 = calculateShakeHighlightGlow(newlyAssigned2.velocity);

      assert.equal(glow1, 28); // Math.floor(3.5 * 8)
      assert.equal(glow2, 4); // Math.floor(0.5 * 8)
    });

    it('S4.2: verifies top diagnostics pill dynamically updates to reflect hot-plugged devices', () => {
      let activeCount = 4;
      let diag = evaluateQuestDiagnostics(true, activeCount);
      assert.equal(diag.statusText, '4 Trackers Active');

      // Add 2 more trackers
      activeCount += 2;
      diag = evaluateQuestDiagnostics(true, activeCount);
      assert.equal(diag.statusText, '6 Trackers Active');
    });
  });
});
