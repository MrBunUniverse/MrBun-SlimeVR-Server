# Changelog

This project is in early development. Versions below 1.0 can change anything without notice.

Version numbers follow `0.MINOR.PATCH`. A minor version adds features or changes behavior. A patch version only fixes things.

## 0.3.0 (2026-10-04)

Tracker reliability and new tests.

- Added drift compensation, so trackers stay aligned over longer sessions.
- Added a pose stability estimate for each tracker.
- Added recovery states, so a tracker that drops out can rejoin more smoothly.
- Added a UDP connection registry.
- Updated the desktop interface and Quest diagnostics.
- Added server and app tests.
- Moved developer docs into `docs/dev/` and the launch scripts into `scripts/`.
- The protocol submodule now points to `SJ-SolarXR-Protocol`.

Known limits: only tested on macOS, and there are no installers.

## 0.2.0 (2026-09-17)

Redesigned desktop interface.

- New navy, gray and amber theme.
- New top bar, tabs and floating navigation.
- Reworked tracker cards, diagnostics, setup, settings and broadcast controls.
- Routes, tracker behavior and saved settings are unchanged.

## 0.1.1 (2026-09-17)

- Added the Apache 2.0 license file.

## 0.1.0 (2026-09-17)

- Snapshot of the project before the interface redesign.
