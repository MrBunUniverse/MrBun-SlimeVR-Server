import { ReactElement, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { isPawTheme, useConfig } from '@/hooks/config';

// Redraws an icon on a small pixel grid, so it reads as PawPad-style pixel art.
// Only in the Bun theme. Other themes get the original icon back, unchanged.
// The colour comes from the theme (text-accent-background-30) and the glow from `.pixel-icon` in index.scss.
export function PixelIcon({
  children,
  size = 24,
  grid = 24,
  className,
}: {
  children: ReactElement;
  size?: number;
  grid?: number;
  className?: string;
}) {
  const { config } = useConfig();
  const pixel = isPawTheme(config?.theme);
  const holderRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The icon is read from a hidden copy in the live tree, not from renderToStaticMarkup. That keeps the
  // providers in place, so an icon that calls useConfig still works. Redraws only when the markup changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const svg = holderRef.current?.querySelector('svg');
    if (!pixel || !canvas || !svg) return;
    const markup = svg.outerHTML;
    const key = `${grid}:${markup}`;
    // The key lives on the canvas, so a canvas that is remounted (for example after a theme change) is drawn again.
    if (canvas.dataset.drawn === key) return;
    canvas.dataset.drawn = key;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Give the SVG an explicit size, so it rasterises at the grid resolution.
    const sized = markup.replace(/<svg([^>]*)>/, (_, attrs: string) => {
      // Without a viewBox the art keeps its full size and gets cropped to the grid, so map it down instead.
      const w = attrs.match(/\swidth="([\d.]+)"/)?.[1];
      const h = attrs.match(/\sheight="([\d.]+)"/)?.[1];
      const viewBox =
        w && h && !attrs.includes('viewBox') ? ` viewBox="0 0 ${w} ${h}"` : '';
      // The root needs the SVG namespace, or the browser won't load it as an image.
      return `<svg${attrs.replace(/\s(width|height|xmlns)="[^"]*"/g, '')}${viewBox} xmlns="http://www.w3.org/2000/svg" width="${grid}" height="${grid}">`;
    });
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, grid, grid);
      ctx.drawImage(img, 0, 0, grid, grid);
      const { data } = ctx.getImageData(0, 0, grid, grid);
      const [r, g, b] = (
        getComputedStyle(canvas).color.match(/\d+/g) ?? ['224', '144', '126']
      ).map(Number);
      ctx.clearRect(0, 0, grid, grid);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      for (let y = 0; y < grid; y++) {
        for (let x = 0; x < grid; x++) {
          // Hard threshold on alpha, so every pixel is either on or off.
          if (data[(y * grid + x) * 4 + 3] > 110) ctx.fillRect(x, y, 1, 1);
        }
      }
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  });

  if (!pixel) return children;

  return (
    <>
      <span ref={holderRef} hidden>
        {children}
      </span>
      <canvas
        ref={canvasRef}
        width={grid}
        height={grid}
        aria-hidden="true"
        className={classNames(
          'pixel-icon text-accent-background-30',
          className
        )}
        style={{ width: size, height: size, imageRendering: 'pixelated' }}
      />
    </>
  );
}
