# Plan: SlimeVR spike in the PawPad style

Goal: make the spike app (the Tauri shell around the latest GUI) match the PawPad look: a pixel
retro feel, the Bun palette, bigger and easier-to-read text, pixel-style buttons and animations, and a
menu bar (tray) icon that's easy to see. Keep all the functionality.

Status of the starting point (2026-10-11):
- Bun theme exists (colour tokens, pixel dot grid, 3px corners, Quest strip, hidden light/night toggle).
- App icon is done (pixel SlimeVR logo, Bun palette). Menu bar icon is not started.
- Tray is not enabled (`tauri` has no `tray-icon` feature).
- Text sizes come from `--font-size`, so the app already has a size knob.
- Main font is Inter and Newsreader, loaded from Google Fonts. The spike's CSP blocks that, so the spike
  shows system fallbacks.

## Phase 0: decisions (you)

Answer the questions in `questions` below. Phases 1 to 7 depend on them.

## Phase 1: fonts and type scale

1. Self-host the fonts with `@fontsource/*` packages (already used for Poppins). Remove the Google
   `@import`. This works offline and keeps the CSP strict.
2. Pick the pixel display face for headings only (for example Silkscreen or Pixelify Sans), and keep a
   readable sans for body text. Check it has the glyphs for every language in `public/i18n`.
3. Adjust the type scale in `tailwind.config.ts`: raise the `ui-*` sizes, or raise the base
   `--font-size` for the Bun theme only.

## Phase 2: text size and layout audit

4. Screenshot every screen at 1280×800 before and after: Home, Remote, Setup Wizard, Settings (every
   tab), Tracker Assignment, Mounting, Body Proportions, Connect Trackers, Quest capture, Firmware tool.
5. Fix overflow and clipping at the larger size. Check the mobile breakpoint too, since the Android app
   uses this GUI.
6. Check the longest translations in `translation.ftl`, because they grow the most.

## Phase 3: pixel components

7. Buttons, cards, toggles, sliders, and inputs: 3px corners, pixel outline (box-shadow stepped corners
   like PawPad's `.status` and `.gear`), and a visible focus ring.
8. Keep circles as circles (`rounded-full`), and keep the existing focus behaviour for keyboard users.
9. Pixel background: the dot grid on `body`, already in Bun. Decide if it appears on every screen.

## Phase 4: animations

10. Replace easing curves with `steps()` on the pixel elements (the bunny boing, timers, progress) so
    motion looks stepped, like PawPad's `timer-tick` and `skiing` keyframes.
11. Keep the mascot idle bounce (`slime-idle-bounce`), but use stepped timing.
12. Respect `prefers-reduced-motion` everywhere, and add a Calm mode toggle that PawPad already has.

## Phase 5: menu bar (tray) icon

13. Enable Tauri's `tray-icon` feature. Draw a monochrome pixel template icon for the menu bar, at 22 px
    (44 px for Retina), with thick pixels so it reads at that size.
14. Tray menu: Show, Hide, Quit. Clicking the icon shows the window. This matches Electron's tray
    (`gui/electron/main/index.ts`).

## Phase 6: colours and artwork

15. Convert the hardcoded colours to tokens. These files still use them: `Serial.tsx`, `RemotePage.tsx`,
    `Home.tsx`, `VRCOSCSettings.tsx`, `HomeEmptyState.tsx`, and the skeleton and IMU widgets (see
    `THEMES.md`). Status colours stay as they are.
16. Optional: Bun artwork (the bunny) in empty states and the welcome screen, in place of the slime.

## Phase 7: verification

17. `tsc --noEmit`, ESLint, and Prettier on the GUI. Also run `check-theme-tokens.py bun`.
18. `measure-resources.sh` on Home and the welcome screen, and compare with `PERFORMANCE_BASELINE.md`.
    Animated pixel effects can push the GPU up, so check the budgets.
19. Screenshot pass for every screen, plus a reduced-motion check, and a check of the tray icon.

## What you need to do

- Answer the questions.
- Give me any PawPad artwork you want reused (the bunny, the stick caps, the menu bar icon, the fonts
  you like).
- Confirm you're happy with the font licences before I add them.
- Start the server when I ask, since I can't start it myself from here.

## What may break, and the alternative

| Risk | Why it happens | Alternative |
|---|---|---|
| Bigger text overflows dense screens (Home, Settings) | Fixed-width panels and cards | Use the existing `--font-size` setting as an opt-in "Large text" toggle instead of changing the default |
| Pixel font has no glyphs for some languages | Pixel faces are Latin only | Use the pixel font for headings and English only, with the normal fallback for other languages |
| Pixel outlines clip tooltips, dropdowns, or focus rings | `overflow: hidden` and stepped box-shadows | Keep the radius, and use pixel outlines only on cards and the primary button |
| Stepped animations feel laggy | `steps()` with too few frames | Use stepped timing only on the mascot and the boing, and keep normal easing elsewhere |
| Motion makes some people feel unwell | Pixel motion and bounce | Respect `prefers-reduced-motion` and keep Calm mode on by default when it's set |
| Tray icon is too small to read | 22 px template icon | Make a coloured icon (not a template) at 44 px with a simpler shape |
| Animated effects raise GPU use | Constant animation | Animate only while the page is visible, and only on hover or change |
| Changing shared GUI code breaks Electron | Same code base | Gate the PawPad styles behind `data-theme='bun'` (or a new `pawpad` theme) so Electron keeps its look |
| Config from another server build crashes settings | Filter types from uncommitted server work | Already fixed with a fallback in the custom server copy. Keep a single server version when testing |
| Fonts won't load in the spike | CSP blocks Google Fonts | Self-host with `@fontsource` (Phase 1) |
| Quest capture and audio pages still break | Native APIs not ported to Tauri (`questAudio`, `questCapture`, `requestMicrophoneAccess`) | Hide those pages in the spike, or port them later |

## Decisions (answered 2026-10-11)

1. Nearly the full PawPad retro look, but body text stays clean and readable. Pixel corners on elements.
2. Pixel-style display type only on the big key text: the SirJameSlimeVR name, the SlimeVR wordmark, and big titles.
3. Text size is customisable. The app already has a `textSize` setting, so expose it instead of hard-coding a size.
4. Menu bar icon stays consistent with the app icon (the pixel SlimeVR logo).
5. The SlimeVR mascot stays for now. The Bun artwork may come later.
6. Default look is the PawPad style. After setup (trackers, Wi-Fi, and so on), Basic mode offers a choice to switch to Special themes or the Classic look.
7. Pixel styling only on big titles, and on elements where it makes sense. Don't overcrowd the app.
8. Dot grid background on the Home screen only, for now.
9. Animations on by default, with a toggle to turn them off.
10. Spike only. The Electron app and Android are not part of this round.
11. The server question is still open (see question 11 below).
12. Priority: theme and buttons first. Tray (menu bar) comes after.
13. Quest capture and the Remote page come later.
14. No archive of the Electron icon, or only for reference or rollback.
15. Fox and dog come after Bun is finished.

Done in this round: big titles in monospace, primary buttons with pixel corners, dot grid on Home only, and
the token checker now ignores local helper variables.

## Questions

1. Which PawPad parts do you want: only the palette and the pixel corners, or the full retro look
   (pixel font, pixel animations, mascot)?
2. Should the pixel font be used for all text, for headings only, or only in the Bun theme?
3. How much bigger should text be? For example: body +2 px and headings +4 px, or a "Large text" option
   that you turn on?
4. For the menu bar icon: the SlimeVR logo, the bunny, or a simple pixel "S"? Monochrome (follows the
   Mac menu bar colour) or full colour?
5. Should the Bun artwork replace the slime mascot on empty states and the welcome screen?
6. Should the Bun look become the default for the whole app, or stay an option in Special themes?
7. Should all buttons get pixel outlines, or only the primary buttons?
8. Should the pixel dot background show on every screen, or only on Home?
9. Keep the animations on by default, or default to Calm mode?
10. Does this plan cover only the spike, or also the Electron app and the Android app?
11. Should the server come from the custom branch, or from your working copy with the newest tracking
    work? (The working copy has more filters, but it doesn't match the GUI's protocol yet.)
12. Priority: menu bar first, text size first, or theme and buttons first?
13. Should Quest capture and the Remote page be in scope now, or left for later?
14. Do you also want the Electron app's icon redrawn in this style?
15. Fox and dog themes: after Bun is fully finished, or in parallel?
