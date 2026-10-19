"""Draws the spike's app icon: the SlimeVR logo (same geometry as gui/electron/resources/icons/icon.svg)
on a PawPad-style pixel tile in the Bun palette. Standard library only, so no Pillow install is needed.

Run: python3 make_spike_icon.py   -> writes icon-1024.png next to this script.
Then: npx tauri icon icon/icon-1024.png   (from tauri-spike/)
"""
import math
import os
import struct
import zlib

GRID = 64            # pixel cells across the icon (16 px each at 1024)
OUT = 1024
SRC = 380            # the SVG's viewBox size

# Bun palette (from PawPad obs-overlay/retro.js BUN and the spike's Bun theme)
TILE = (51, 33, 27)          # #33211b panel
TILE_HI = (58, 38, 32)       # #3a2620 raised
INK = (31, 19, 15)           # #1f130f darkest edge
CREAM = (239, 230, 214)      # #efe6d6 eyes
CREAM_HI = (251, 246, 236)   # #fbf6ec highlight
CORAL = (224, 144, 126)      # #e0907e wave


def bezier(p0, p1, p2, p3, steps=48):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def polyline(points):
    return list(points)


# Stroke paths from icon.svg, in its 380 x 380 space.
LEFT_EYE = (polyline([(72.867, 191.74), (109.867, 152.74), (148.867, 188.74)]), 13.62)
RIGHT_EYE = (polyline([(208.87, 187.74), (246.87, 152.74), (282.87, 190.74)]), 13.62)

# The wave: "m56.867 253.74 s130.61-31.182 248 5 c13.45 4.146 20.244 2.975 20-8 s1.909-126.06-46-131"
P0 = (56.867, 253.74)
P3 = (P0[0] + 248, P0[1] + 5)
C2a = (P0[0] + 130.61, P0[1] - 31.182)
wave = bezier(P0, P0, C2a, P3)
P4 = (P3[0] + 20, P3[1] - 8)
C1b = (P3[0] + 13.45, P3[1] + 4.146)
C2b = (P3[0] + 20.244, P3[1] + 2.975)
wave += bezier(P3, C1b, C2b, P4)[1:]
P5 = (P4[0] - 46, P4[1] - 131)
C1c = (2 * P4[0] - C2b[0], 2 * P4[1] - C2b[1])
C2c = (P4[0] + 1.909, P4[1] - 126.06)
wave += bezier(P4, C1c, C2c, P5)[1:]
WAVE = (wave, 17.0)


def dist_to_polyline(x, y, pts):
    best = float('inf')
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        dx, dy = x2 - x1, y2 - y1
        length2 = dx * dx + dy * dy
        t = 0 if length2 == 0 else max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / length2))
        px, py = x1 + t * dx, y1 + t * dy
        best = min(best, math.hypot(x - px, y - py))
    return best


def in_rounded_rect(x, y, size, radius):
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    return math.hypot(x - cx, y - cy) <= radius


def logo_hit(x, y):
    """Return 'eye', 'wave', or None for a point in SVG space."""
    for name, (pts, width) in (('eye', LEFT_EYE), ('eye', RIGHT_EYE), ('wave', WAVE)):
        if dist_to_polyline(x, y, pts) <= width / 2:
            return name
    return None


LOGO_SCALE = 1.14    # the logo is drawn this much bigger, about the centre, so it fills the tile


def cell_colour(cx, cy):
    """Colour for one grid cell, sampled at its centre in SVG space."""
    unit = SRC / GRID
    x, y = (cx + 0.5) * unit, (cy + 0.5) * unit
    if not in_rounded_rect(x, y, SRC, 76):
        return None
    c = SRC / 2
    hit = logo_hit(c + (x - c) / LOGO_SCALE, c + (y - c) / LOGO_SCALE)
    if hit == 'eye':
        return CREAM
    if hit == 'wave':
        return CORAL
    return TILE


def build_grid():
    grid = [[cell_colour(x, y) for x in range(GRID)] for y in range(GRID)]
    # No border: the tile is plain, with no ink edge, highlight row or drop shadow, so the logo stands alone.
    return grid


def write_png(path, width, height, rgba_rows):
    raw = b''.join(b'\x00' + bytes(row) for row in rgba_rows)

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    header = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def main():
    grid = build_grid()
    cell = OUT // GRID
    rows = []
    for py in range(OUT):
        gy = py // cell
        row = bytearray()
        for px in range(OUT):
            c = grid[gy][px // cell]
            if c is None:
                row += bytes((0, 0, 0, 0))
            else:
                row += bytes((c[0], c[1], c[2], 255))
        rows.append(row)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icon-1024.png')
    write_png(out, OUT, OUT, rows)
    print('wrote', out)


if __name__ == '__main__':
    main()
