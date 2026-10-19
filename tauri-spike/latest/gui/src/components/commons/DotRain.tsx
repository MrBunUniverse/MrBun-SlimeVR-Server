import { useEffect, useRef } from 'react';
import { isPawTheme, useConfig } from '@/hooks/config';

// A dotted canvas for the settings tab chooser, in the Bun theme. It draws its own dot grid, the same look as body's,
// and drops fall through it, one dot at a time, lighting each dot they pass. A new drop comes every few seconds.
// The grid starts at the canvas's own top-left corner, so every drop lands on a dot that is already drawn.
// Runs in steps and stops once the canvas is empty. The dots stay static when the animations setting is off or reduced motion is on.
// Nothing is drawn outside Bun.
const CELL = 12; // matches the dot grid on body
const DOT = 2;
const STEP_MS = 90;
const GAP_MIN = 900;
const GAP_MAX = 1900;
const BASE = 'rgba(239, 230, 214, 0.1)';
// The head is the Bun coral, and the trail fades back into the cream dots over about ten dots.
const TRAIL = [
  'rgb(224, 144, 126)',
  'rgba(239, 230, 214, 0.55)',
  'rgba(239, 230, 214, 0.45)',
  'rgba(239, 230, 214, 0.36)',
  'rgba(239, 230, 214, 0.28)',
  'rgba(239, 230, 214, 0.22)',
  'rgba(239, 230, 214, 0.17)',
  'rgba(239, 230, 214, 0.13)',
  'rgba(239, 230, 214, 0.1)',
];

type Drop = { col: number; y: number; len: number };

export function DotRain({
  className = 'absolute inset-0 w-full h-full pointer-events-none',
}: {
  className?: string;
}) {
  const { config } = useConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shown = isPawTheme(config?.theme);
  const animate = config?.animations !== false;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!shown || !canvas || !ctx) return;
    const moving =
      animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let cols = 0;
    let rows = 0;
    let dpr = 1;
    let drops: Drop[] = [];
    let spawnTimer = 0;
    let stepTimer = 0;

    // Sizes the canvas and its grid. Drops reset on resize, which is fine for a background.
    const size = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      cols = Math.floor(canvas.clientWidth / CELL);
      rows = Math.floor(canvas.clientHeight / CELL);
    };

    // Paints the base dots, then the drops over them.
    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BASE;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          ctx.fillRect(
            x * CELL + (CELL - DOT) / 2,
            y * CELL + (CELL - DOT) / 2,
            DOT,
            DOT
          );
        }
      }
      for (const d of drops) {
        for (let k = 0; k < d.len; k++) {
          const row = d.y - k;
          if (row < 0 || row >= rows) continue;
          ctx.fillStyle = TRAIL[Math.min(k, TRAIL.length - 1)];
          ctx.fillRect(
            d.col * CELL + (CELL - DOT) / 2,
            row * CELL + (CELL - DOT) / 2,
            DOT,
            DOT
          );
        }
      }
    };

    const stop = () => {
      window.clearInterval(stepTimer);
      stepTimer = 0;
    };

    // One step: every drop falls a dot. Drops that have left the bottom are removed.
    const tick = () => {
      for (const d of drops) d.y += 1;
      drops = drops.filter((d) => d.y - d.len < rows);
      draw();
      if (drops.length === 0) stop();
    };

    const spawn = () => {
      if (cols > 0 && document.visibilityState === 'visible') {
        drops.push({
          col: Math.floor(Math.random() * cols),
          y: -1,
          len: 6 + Math.floor(Math.random() * 6),
        });
        if (!stepTimer) stepTimer = window.setInterval(tick, STEP_MS);
      }
      spawnTimer = window.setTimeout(
        spawn,
        GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN)
      );
    };

    size();
    draw();
    const ro = new ResizeObserver(() => {
      size();
      drops = [];
      stop();
      draw();
    });
    ro.observe(canvas);
    if (moving) spawnTimer = window.setTimeout(spawn, 600);

    return () => {
      ro.disconnect();
      window.clearTimeout(spawnTimer);
      stop();
    };
  }, [shown, animate]);

  if (!shown) return null;

  return (
    <canvas ref={canvasRef} aria-hidden="true" className={className} />
  );
}
