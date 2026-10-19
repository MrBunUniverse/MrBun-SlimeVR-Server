# Adding a special theme

Special themes live in the spike's GUI copy at `tauri-spike/latest/gui`. Bun, Fox and Dog are the PawPad ones. They share one layout: the Bun-scoped rules in `index.scss` use `:root:is([data-theme='bun'], [data-theme='fox'], [data-theme='dog'])`, and components check `isPawTheme()` from `hooks/config.ts`.

## Checklist

1. **Add the theme block** in `gui/src/index.scss`: `:root[data-theme='<name>'] { … }`.
   Set **every** colour token the app uses, not only the text and accent colours.
   A token left out falls back to the base `:root` values, and that's how a page keeps the default colours.
2. **Run the checker:**

   ```bash
   python3 tauri-spike/tools/check-theme-tokens.py <name>
   ```

   It exits 1 and lists every colour token still missing. Fix them all before testing.
3. **Add the option** to `gui/src/components/settings/pages/SpecialThemesSettings.tsx`, with its strings in `gui/public/i18n/en/translation.ftl`.
4. **Check the light/night toggle.** `ThemeModeToggle` is hidden for every PawPad theme. A new PawPad-style theme goes in `PAW_THEMES` (`hooks/config.ts`) and in the shared `:root:is(...)` selectors; any other special theme needs its own check in `ThemeModeToggle`.
5. **Check the pages that hardcode colours.** These don't follow any theme:
   - `components/settings/pages/Serial.tsx` (`bg-[#100E0B]`)
   - `components/remote/RemotePage.tsx` (`bg-[#1B1915]`, `bg-white`)
   - `components/home/Home.tsx` and `components/settings/pages/VRCOSCSettings.tsx` (`bg-white`)
   - `components/widgets/*Visualizer*` (the skeleton colours)

   Status colours (green, amber, red) on `HomeEmptyState.tsx` are intentional.
6. **Screenshot these screens** in the new theme: Home (waiting for trackers, the Quest strip, the 3D preview), Settings → Appearance, Special themes, and one settings page with cards.
7. **Confirm the theme survives** navigation and a restart, since `AppLayout` reads `config.theme` on every load.

## Known limits

- The checker only checks colour tokens. Sizes, fonts, and motion are not covered.
- Hardcoded colours (checklist item 5) need converting to tokens before a theme can change them.
