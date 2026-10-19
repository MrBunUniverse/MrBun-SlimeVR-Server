#!/usr/bin/env python3
"""Check that a special theme sets every colour token the app uses.

A `:root[data-theme='x']` block only overrides what it lists. Any token it leaves out falls back
to the base `:root` values, which is how a theme's pages end up in the default colours.

Usage: check-theme-tokens.py <theme-name> [gui/src dir]
Exits 1 if any colour token used by the app is missing from the theme.
"""
import re
import sys
from pathlib import Path

theme = sys.argv[1] if len(sys.argv) > 1 else 'bun'
gui = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[1] / 'latest/gui'
scss = (gui / 'src/index.scss').read_text()
tailwind = (gui / 'tailwind.config.ts').read_text()

# Tokens the theme block sets.
start = scss.index(f":root[data-theme='{theme}']")
end = scss.index('\n}', start)
block = scss[start:end]
set_tokens = set(re.findall(r'(--[a-z0-9-]+)\s*:', block))

# Tokens the app uses: var(--x) in the stylesheet and in the Tailwind colour config.
# Variables defined inside a component rule (not :root) are local helpers, so they are not theme tokens.
local = set()
for selector, body in re.findall(r'([^{}]+)\{([^{}]*)\}', scss):
    if not re.fullmatch(r':root(\[[^\]]*\])?', selector.strip()):
        local.update(re.findall(r'(--[a-z0-9-]+)\s*:', body))
used = set(re.findall(r'var\((--[a-z0-9-]+)\)', scss + tailwind)) - local

# Colour tokens only: a value that is an rgb/rgba/hex colour, or a var() that resolves to one.
base_values = dict(re.findall(r'(--[a-z0-9-]+)\s*:\s*([^;]+);', scss))
COLOUR = re.compile(r'rgba?\(|#[0-9a-fA-F]{3,8}\b|^\s*\d+\s*,\s*\d+\s*,\s*\d+')


def is_colour(name, depth=0):
    value = base_values.get(name, '').strip()
    if depth > 3 or not value:
        return False
    ref = re.match(r'var\((--[a-z0-9-]+)\)', value)
    if ref:
        return is_colour(ref.group(1), depth + 1)
    return bool(COLOUR.search(value))


missing = sorted(t for t in used - set_tokens if is_colour(t))
print(f"theme '{theme}': sets {len(set_tokens)} tokens; colour tokens used but not set: {len(missing)}")
for token in missing:
    print(f"  missing {token}  (base: {base_values.get(token, '?').strip()[:60]})")
sys.exit(1 if missing else 0)
