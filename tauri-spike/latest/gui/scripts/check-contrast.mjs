// Verifies WCAG contrast for the Claude (light) and Night (dark) theme tokens
// in src/index.scss. Run: node scripts/check-contrast.mjs
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.scss', import.meta.url), 'utf8');

function readTheme(selector) {
  // Last block wins, so later overrides in the file are honoured.
  const re = new RegExp(`:root\\[data-theme='${selector}'\\]\\s*\\{([^}]*)\\}`, 'g');
  const vars = {};
  for (const m of css.matchAll(re)) {
    for (const v of m[1].matchAll(/--([\w-]+):\s*(\d+),\s*(\d+),\s*(\d+)/g)) {
      vars[v[1]] = [Number(v[2]), Number(v[3]), Number(v[4])];
    }
  }
  return vars;
}

const lum = ([r, g, b]) => {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const WHITE = [255, 255, 255];
// [foreground, background, minimum ratio, what it is]
const pairs = [
  ['background-10', 'background-80', 4.5, 'primary text on canvas'],
  ['background-10', 'background-60', 4.5, 'primary text on card'],
  ['background-10', 'background-70', 4.5, 'primary text on panel'],
  ['background-20', 'background-80', 4.5, 'secondary text on canvas'],
  ['background-20', 'background-60', 4.5, 'secondary text on card'],
  ['background-30', 'background-80', 4.5, 'muted text on canvas'],
  ['background-30', 'background-60', 4.5, 'muted text on card'],
  ['background-30', 'background-70', 4.5, 'muted text on panel'],
  ['accent-background-10', 'background-80', 4.5, 'accent text on canvas'],
  ['accent-background-10', 'background-60', 4.5, 'accent text on card'],
  ['accent-background-10', 'background-70', 4.5, 'accent text on panel'],
  ['@white', 'accent-background-20', 4.5, 'button label on primary accent'],
  ['success', 'background-80', 4.5, 'success text on canvas'],
  ['warning', 'background-80', 4.5, 'warning text on canvas'],
  ['critical', 'background-80', 4.5, 'critical text on canvas'],
  ['background-40', 'background-80', 3, 'icons / quiet UI on canvas'],
  ['accent-background-20', 'background-80', 3, 'accent UI parts on canvas'],
  ['motion', 'background-80', 3, 'moving-tracker orange on canvas'],
  ['motion', 'background-60', 3, 'moving-tracker orange on card'],
];

let failed = 0;
for (const [name, label] of [['claude', 'Light (claude)'], ['dark', 'Night (dark)']]) {
  const t = readTheme(name);
  console.log(`\n${label}`);
  for (const [fg, bg, min, what] of pairs) {
    const f = fg === '@white' ? WHITE : t[fg];
    const b = t[bg];
    if (!f || !b) { console.log(`  ?    missing token for ${what}`); failed++; continue; }
    const r = ratio(f, b);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`  ${ok ? 'pass' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1 (need ${min})  ${what}`);
  }
}
console.log(failed ? `\n${failed} pair(s) failing` : '\nAll pairs pass');
process.exit(failed ? 1 : 0);
