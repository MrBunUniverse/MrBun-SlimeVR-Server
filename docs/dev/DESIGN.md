# SlimeVR GUI design direction

## Identity

SlimeVR is a focused desktop control surface for live body tracking. It should feel calm, precise, tactile, and trustworthy while tracking is active.

## Reference language

- Dark blue-gray surfaces with warm-gray text, navy depth, and one warm amber
  action color from the supplied palette.
- Thin outlines, restrained shadows, and clear grouping.
- Floating navigation dock and toolbar inspired by macOS desktop apps.
- Compact cards, tabs, drawers, and mobile sheets.
- Monochrome line icons with consistent visual weight.

## Product rules

- Show tracking health before advanced telemetry.
- Put frequent actions near the current task.
- Use tabs for view navigation, not commands.
- Use drawers and sheets for detail without losing context.
- Use a toolbar for frequent actions: status at left, reset/calibration in the
  center, and workspace view controls at right.
- Use segmented tabs only for peer views (Motion / VRChat); use disclosure rows
  for expandable control groups such as Tracking and Advanced.
- Selected tabs are defined by a filled segment, contrast, and position—not by
  accent color alone. Tabs must support arrow/Home/End keyboard navigation.
- Keep empty, loading, error, and disconnected states useful.
- Preserve existing routes, state, IPC, RPC, configuration, and localization.

## Visual dials

- Energy: 2. Calm utility surface with small moments of warmth.
- Rhythm: 3. Vary composition by task; avoid repeated dashboard cards.
- Motion: 1. Short feedback transitions only. No perpetual decorative motion.

The reference theme disables decorative contour loops; live-state motion and
explicit interaction feedback remain available.

## Palette direction

Use semantic tokens, not raw colors in components.

- Canvas: a deepened navy derived from `#1A3263`.
- Surface: darkened blue-gray derived from `#547792`, with an even deeper
  surface for elevation.
- Primary text and navigation: `#E8E2DB` warm gray.
- Secondary structure and quiet metadata: `#547792` blue-gray, lightened through
  semantic text tokens when dark-surface contrast requires it.
- Primary actions and selected emphasis: `#FAB95B` amber with navy text.
- Status: explicit label plus icon and color. Red and green remain semantic
  exceptions where users need to recognize health quickly.

The dark theme remains supported. Light reference colors must pass contrast checks before release.

## Rollout plan

1. Shell: establish the top bar, floating dock, route-level information architecture, semantic theme tokens, and focus/contrast rules.
2. Live tracking: make Home the health-first workspace; align tracker cards, diagnostics, reset actions, table view, and the skeleton drawer to the same surfaces.
3. Workflows: align Remote and Setup around task-specific cards, clear prerequisites, progressive disclosure, and useful empty/error states.
4. Configuration: keep the searchable Settings rail, but unify section headers, controls, tabs, sheets, and destructive-action states.
5. Hardening: verify every route at desktop/mobile widths, preserve WebSocket/RPC/IPC behavior, run the existing tests/build, and remove only styling that is proven redundant.

## Acceptance gates

- Existing routes and deep links still resolve.
- Tracker discovery, resets, calibration, WebSocket updates, Quest streaming, and Electron actions remain behaviorally unchanged.
- The floating dock is keyboard reachable, has visible focus, and does not cover scrollable content.
- Primary yellow actions meet WCAG AA contrast; status never depends on color alone.
- Reduced motion and reduced transparency still produce usable layouts.
- No new UI dependency is introduced without a measured interaction or maintenance benefit.
