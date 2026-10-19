# UI Map

Locator for GUI work. Paths are relative to `gui/`. Entries name files and symbols, not line numbers: open the file and `rg` the symbol. Update this map when a component moves, is renamed, or changes responsibility.

Routes are defined in `src/App.tsx`. Design direction is in `docs/dev/DESIGN.md`.

## Shell and chrome

| Element | File | Notes |
| --- | --- | --- |
| Route wrapper, skip link, shortcuts | `src/components/shell/AppShell.tsx` | Cmd/Ctrl+B toggles sidebar, Cmd/Ctrl+1..4 jump pages |
| Left navigation | `src/components/shell/SideNav.tsx`, `shell/nav-items.tsx` | `SideNav`, `APP_NAME`; destinations list in `nav-items` |
| Title bar | `src/components/TopBar.tsx` | Status cluster, theme toggle, reload, window controls |
| Connection status popover | `src/components/shell/StatusCluster.tsx` | Server, mode, trackers, Mac IP, headset address, scan |
| Other shell controls | `src/components/shell/{QuestTargetIPPill,ThemeModeToggle,RefreshTrackersButton,HardRebootButton,VersionTag}.tsx` | |
| Layouts | `src/components/MainLayout.tsx` (+ `.scss`), `EmptyLayout.tsx`, `src/AppLayout.tsx` | Grid shell for main routes |
| Broadcast / VRChat chatbox | `src/components/broadcast/ChatboxDropdown.tsx` (+ `.scss`) | Voice, sticky, music, BPM tabs; battery broadcast |
| Reset toolbar | `src/components/Toolbar.tsx` | `Toolbar`, `ResetActionsGroup`, `BasicResetButton` |
| App-level modals | `src/components/{SerialDetectionModal,UnknownDeviceModal,VersionUpdateModal,TrackersStillOnModal,TrayOrExitModal}.tsx` | |
| Pause / BVH buttons | `src/components/TrackingPauseButton.tsx`, `BVHButton.tsx` | |

## Home (`/`)

| Element | File | Notes |
| --- | --- | --- |
| Page, card/table switch, inspector toggle | `src/components/home/Home.tsx` | `Home` |
| Tracker grid card | `src/components/home/HomeEmptyState.tsx` | `ClaudeTrackerWindowCard`: battery tag, 3-dot battery, banner, body icon, IMU preview |
| Empty state, setup links, demo mode | `src/components/home/HomeEmptyState.tsx` | `TrackerEmptyState`, `SETUP_STEPS`, `SETUP_LINKS`, `HomeEmptyState` |
| Presets | `src/components/home/PresetSelector.tsx` | |
| Quest diagnostics | `src/components/home/QuestDiagnosticsCard.tsx`, `QuestDiagnosticsPill.tsx` | Card and compact pill |
| Reset button | `src/components/home/ResetButton.tsx` | Countdown button |
| Home settings modal | `src/components/home/HomeSettingsModal.tsx` | |
| Inspector (right column) | `src/components/Sidebar.tsx` | `Sidebar`, `PreviewSection`, `PreviewControls`; Preview and Checklist tabs |
| 3D skeleton / IMU canvases | `src/components/widgets/SkeletonVisualizerWidget.tsx`, `IMUVisualizerWidget.tsx` | Three.js |

## Trackers (`/tracker/:trackernum/:deviceid`)

| Element | File | Notes |
| --- | --- | --- |
| Table view | `src/components/tracker/TrackersTable.tsx` (+ `.scss`) | `TrackerNameCell`, `Header`, `Cell`, `Row` |
| Status pill | `src/components/tracker/TrackerStatus.tsx` | `statusClassMap` holds dot colors |
| Battery, Wi-Fi | `src/components/tracker/TrackerBattery.tsx`, `TrackerWifi.tsx` | |
| Detail page | `src/components/tracker/TrackerSettings.tsx` | Name, assignment, rotation, drift profile, firmware cards |
| Assignment menu | `src/components/tracker/SingleTrackerBodyAssignmentMenu.tsx` | |
| Legacy cards (onboarding) | `src/components/tracker/TrackerCard.tsx`, `TrackerPartCard.tsx` | |
| Body part icons | `src/components/commons/BodyPartIcon.tsx`, `commons/icon/<Part>Icon.tsx` | `mapPart` maps `BodyPart` to icon; resize via each icon's `viewBox` |

## Remote and Quest (`/remote`)

| Element | File | Notes |
| --- | --- | --- |
| Remote page | `src/components/remote/RemotePage.tsx` | Headset list, wireless ADB, audio demo, game audio and mic cards, mirror studio |
| Quest capture settings | `src/components/settings/pages/QuestCaptureSettings.tsx`, `src/hooks/quest-capture.ts` | Presets, crop, codec, bitrate; persisted settings |
| Native side | `electron/main/quest-capture.ts`, `quest-audio.ts`, `channel-test-tone.ts` | scrcpy/ADB processes |

## Settings (`/settings/...`)

| Element | File | Notes |
| --- | --- | --- |
| Layout and sidebar | `src/components/settings/SettingsLayout.tsx` (+ `.scss`), `SettingsPageLayout.tsx`, `SettingsSidebar.tsx` | |
| Pages | `src/components/settings/pages/{GeneralSettings,InterfaceSettings,HomeScreenSettings,VRCOSCSettings,OSCRouterSettings,VMCSettings,Serial,AdvancedSettings,QuestCaptureSettings}.tsx` | `GeneralSettings` is very long; `rg` the section |
| Stay Aligned | `src/components/settings/pages/components/StayAlignedSettings.tsx`, `StayAlignedPoseModal.tsx` | |
| Magnetometer toggle | `src/components/settings/pages/MagnetometerToggleSetting.tsx` | |
| Modals | `src/components/settings/SettingsResetModal.tsx`, `HandsWarningModal.tsx` | |
| Firmware tool | `src/components/firmware-tool/FirmwareTool.tsx`, `DeviceCard.tsx`, `steps/` | |

## Onboarding (`/onboarding/...`)

| Element | File | Notes |
| --- | --- | --- |
| Layout | `src/components/onboarding/OnboardingLayout.tsx` | |
| Intro, Wi-Fi, dongle, connect | `src/components/onboarding/pages/{Home,WifiCreds,Dongle,ConnectTracker,ResetTutorial}.tsx` | |
| Quiz | `src/components/onboarding/pages/quiz/` | `SlimeSetQuestion.tsx` and peers |
| Assignment | `src/components/onboarding/pages/trackers-assign/{TrackerAssignment,TrackerSelectionMenu}.tsx`, `onboarding/BodyAssignment.tsx` | |
| Mounting | `src/components/onboarding/pages/mounting/{MountingChoose,AutomaticMounting,ManualMounting,MountingSelectionMenu}.tsx` | Shared logic in `src/hooks/manual-mounting.ts` |
| Proportions | `src/components/onboarding/pages/body-proportions/{BodyProportions,AutomaticProportions,ManualProportions,ScaledProportions,HeightInput}.tsx` | |
| Modals | `src/components/onboarding/{SkipSetupWarningModal,UdevRulesModal,NeckWarningModal}.tsx` | |

## Checklist and VRChat

| Element | File |
| --- | --- |
| Tracking checklist | `src/components/tracking-checklist/{TrackingChecklist,TrackingChecklistModal,TrackingChecklistProvider}.tsx` |
| VRChat warnings | `src/components/vrc/VRCWarningsPage.tsx` |

## Shared primitives

All in `src/components/commons/`: `Button`, `BigButton`, `IconButton`, `SegmentedControl`, `StatusDot`, `Typography`, `Input`, `Dropdown`, `Checkbox`, `Radio`, `Toggle`, `Range`, `Slider`, `NumberSelector`, `SettingRow`, `TipBox` (also exports the warning box), `Tooltip`, `BaseModal`, `Modal`, `ButtonConfirmModal`, `ProgressBar`, `VerticalStepper`, `ThemeSelector`, `LangSelector`, `BodyDisplay`, `BodyInteractions`.

`IconButton` requires an accessible name. Status is never conveyed by color alone.

## Tokens and theming

| Area | File | Notes |
| --- | --- | --- |
| CSS tokens, glass classes, themes | `src/index.scss` | `:root[data-theme='…']` blocks, `.glass-panel`, `.glass-pill`, focus ring |
| Tailwind scales | `tailwind.config.ts` | `background-*`, `accent-background-*`, `text-ui-*` |
| Contrast gate | `scripts/check-contrast.mjs` | `pnpm run check:contrast` |
| Strings | `public/i18n/en/translation.ftl` | Fluent; add keys here for new UI text |

## State and hooks

| Name | File | Purpose |
| --- | --- | --- |
| Jotai atoms | `src/store/app-store.ts` | Devices, trackers, assignment, sidebar |
| Demo trackers | `src/store/demo-trackers.ts` | Simulated data for demo mode |
| `useWebsocketAPI` | `src/hooks/websocket-api.ts` | RPC and data feed to the server |
| `useAppContext` | `src/hooks/app.ts` | Global app state |
| `useConfig` | `src/hooks/config.ts` | User config |
| `useTracker` | `src/hooks/tracker.ts` | Name, velocity, status helpers |
| `useReset` | `src/hooks/reset.ts` | Yaw/Full/Mounting countdown logic |
| `usePresets` | `src/hooks/presets.ts` | Preset load/save/switch |
| `useOnboarding` | `src/hooks/onboarding.ts` | Wizard state |
| Operating mode, layout, sidebar | `src/hooks/operating-mode.ts`, `layout.ts`, `sidebar.ts` | |
| Audio feedback | `src/utils/audio-feedback.ts` | Countdown beeps, reset chime |
