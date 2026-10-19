# SlimeVR Tauri Spike: Performance Baseline

Reference numbers for CPU, GPU, and RAM on macOS. Use this table to check new features (animations, layouts, screens) against the baseline before they ship.

Measured 2026-10-11 on a Mac15,12 (MacBook Air, Apple Silicon), macOS 27.0 (26A428), 15 GB RAM.

## Build under test

- **Spike:** Tauri release build (`tauri-spike/src-tauri/target/release/bundle/macos/SlimeVR Spike.app`). Its GUI is the latest uncommitted GUI from the main checkout's working copy (`codex/cleanup-project-organization`), snapshotted into `tauri-spike/latest/`.
- **Server:** the main worktree's `slimevr.jar` (`server/desktop/build/libs/`), which uses protocol `00c38a6`. The custom server (`tauri-spike/custom/`, protocol `9f8a473`) was not measured yet. Re-measure once it is running.

## Baseline (current)

Each row is one 20 to 30 second run of `tools/measure-resources.sh`, taken in the same session. GPU is **system-wide**, so other apps change it (see Notes).

| Scenario | GPU, system-wide avg (peak) | Spike CPU avg (peak) | Spike RAM | Server CPU avg (peak) | Server RAM |
|---|---|---|---|---|---|
| Spike closed (baseline) | 40.5% (44%) | 0% | 0 MB | 12.2% (15.3%) | 133 MB |
| Welcome screen, Setup Wizard (idle) | 47.0% (50%) | 4.5% (4.9%) | 241 MB | 13.2% (15.3%) | 132 MB |
| Home screen with 3D skeleton | 46.9% (48%) | 17.5% (18.4%) | 297 MB | 12.4% (14.2%) | 132 MB |

A second Home run, using interval CPU from `top`, gave **17.8%** spike CPU and **13.8%** server CPU. The first Home run before that showed 40.8% GPU (peak 49%).

The spike's own WebKit GPU process, read by hand from `ps`, was about **2%** CPU idle and about **7%** on Home. This is the best per-app GPU proxy available without admin rights.

## Proposed budgets

These are targets based on the numbers above. Adjust them if you want tighter limits.

| Scenario | Spike CPU | Spike RAM | Spike GPU process CPU | Server CPU | Server RAM |
|---|---|---|---|---|---|
| Idle (welcome screen) | at most 6% | at most 260 MB | at most 3% | at most 15% | at most 140 MB |
| Home (3D skeleton) | at most 20% | at most 310 MB | at most 10% | at most 15% | at most 140 MB |

The server heap is capped at `-Xmx128M`, so its RAM stays near 130 MB.

Do not budget on system-wide GPU. Other apps dominate it: Meta Quest Virtual Display and Claude were both busy during these runs.

## How to measure

1. Close or note other heavy apps. Check with `ps -axo pid,%cpu,comm | sort -k2 -rn | head`.
2. Open the spike and go to the screen you want to test.
3. Run:

   ```bash
   bash tauri-spike/tools/measure-resources.sh "<scenario label>" 30
   ```

   The script reports system GPU, spike CPU and RAM, and server CPU and RAM. It finds the spike's processes by start time, because macOS launches the WebKit helpers rather than the app. It uses `top` interval CPU, so the first sample is skipped.

4. For a per-process GPU check, run this in your own terminal, since it needs your password:

   ```bash
   sudo powermetrics --samplers gpu_power -i 2000 -n 10
   ```

   This reports system-wide GPU only, but it's useful to confirm the `ioreg` readings.

5. Compare the result against the budgets above. Record the scenario, the time, and the other apps that were running.

## Notes and known issues

- **GPU readings are system-wide.** They rose from about 24% to about 40–47% between runs, which mostly reflects other apps. Compare spike results with the spike closed in the same session.
- **The `kernel_task` bug is fixed.** An earlier version of the script used PID 0 when the spike was closed, which counted kernel activity as spike CPU. It now watches only the server in that case.
- **Earlier readings** are not directly comparable to this table. The idle GPU check with `ioreg` read 23.7% with the spike closed and 22.8% with it open. That was a quieter session.
- **Server:** the earlier measurement of 4.1% CPU and 133 MB was taken over 30 seconds, but the spike's screen state was not controlled.
- **Not yet measured:** the custom server, the Remote screen, the Quest pages, and any animation-heavy screen.
