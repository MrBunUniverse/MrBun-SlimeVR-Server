import { useConfig } from '@/hooks/config';

// Pixel ears on the slime logo, like PawPad's Fox and Dog looks. Only in those two themes.
// Drawn like the pixel logo itself (PixelIcon): a one-cell outline in the accent colour, on the logo's own cell size,
// with the same glow. Sprites are the left ear; the right one is mirrored.
const EARS = {
  fox: {
    // Tall and pointed, with the solid tip standing in for PawPad's dark ear tips.
    sprite: [
      '.....#.....',
      '....###....',
      '....###....',
      '...#####...',
      '...#...#...',
      '..#.....#..',
      '..#.....#..',
      '.#.......#.',
      '.#.......#.',
      '#.........#',
      '#.........#',
    ],
    // Upright: the ears stand above the logo, about two logo cells clear of it.
    place: {
      logo: 'bottom-[calc(100%-16px)] inset-x-[2px]',
      badge: 'bottom-[calc(100%+2px)] inset-x-[8px]',
    },
    // The slime's right side curls up higher than its left, so each ear gets its own [x, y] nudge (px) to keep the gap even.
    nudge: {
      logo: [
        [0, 3.5],
        [0, -5.5],
      ],
      badge: [
        [0, 0],
        [0, 0],
      ],
    },
  },
  dog: {
    // Floppy: joined at the top, hanging outwards and down.
    sprite: [
      '...#####',
      '..#....#',
      '.#.....#',
      '#......#',
      '#.....#.',
      '#.....#.',
      '#....#..',
      '#....#..',
      '.#..#...',
      '..##....',
    ],
    place: {
      logo: 'top-[8px] inset-x-[-2px]',
      badge: 'top-[-2px] inset-x-[-2px]',
    },
    nudge: {
      logo: [
        [0, 3],
        [5, -4],
      ],
      badge: [
        [0, 0],
        [0, 0],
      ],
    },
  },
} as const;

// `logo` sits on the pixel slime (welcome screen), `badge` on the round logo badge (waiting for trackers).
// `cell` is the logo's pixel size: its PixelIcon size divided by its grid.
export function PawEars({ cell, on }: { cell: number; on: 'logo' | 'badge' }) {
  const { config } = useConfig();
  const ears = EARS[config?.theme as keyof typeof EARS];
  // Special themes page: "Ears on the logo" turns them off.
  if (!ears || config?.pawEars === false) return null;
  const w = ears.sprite[0].length;
  const h = ears.sprite.length;
  const ear = (mirror: boolean) => {
    const [nx, ny] = ears.nudge[on][mirror ? 1 : 0];
    return (
      <svg
        width={w * cell}
        height={h * cell}
        viewBox={`0 0 ${w} ${h}`}
        shapeRendering="crispEdges"
        className="pixel-icon text-accent-background-30"
        style={{
          translate: `${nx}px ${ny}px`,
          transform: mirror ? 'scaleX(-1)' : undefined,
        }}
      >
        {ears.sprite.flatMap((row, y) =>
          [...row].map((c, x) =>
            c === '#' ? (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width={1}
                height={1}
                fill="currentColor"
              />
            ) : null
          )
        )}
      </svg>
    );
  };
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute flex justify-between ${ears.place[on]}`}
    >
      {ear(false)}
      {ear(true)}
    </span>
  );
}
