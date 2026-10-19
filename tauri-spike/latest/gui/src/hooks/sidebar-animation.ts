import { CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { sidebarAnimationAtom } from '@/store/app-store';

export interface SidebarPushAnimProps {
  className?: string;
  style?: CSSProperties;
  key?: string;
  direction?: 'left' | 'right';
  animKey: number;
}

/**
 * Returns directional push animation props for elements that get shifted
 * when the 3D skeleton sidebar is toggled.
 *
 * @param orderFromRight - 0-indexed distance from right screen edge (skeleton drawer).
 *                         Lower numbers react faster and with more amplitude.
 * @param options - Custom amplitude, delay scaling, or extra delay offset.
 */
export function useSidebarPushAnimation(
  orderFromRight = 0,
  options?: {
    customAmp?: number;
    baseDelay?: number;
    extraDelayMs?: number;
  }
): SidebarPushAnimProps {
  const sidebarAnim = useAtomValue(sidebarAnimationAtom);
  if (!sidebarAnim) {
    return {
      className: undefined,
      style: undefined,
      key: undefined,
      direction: undefined,
      animKey: 0,
    };
  }

  const { customAmp, baseDelay = 42, extraDelayMs = 0 } = options || {};
  const amp = customAmp ?? Math.pow(0.58, Math.max(0, orderFromRight));
  const delayMs = Math.max(0, orderFromRight * baseDelay + extraDelayMs);

  const className =
    sidebarAnim.direction === 'left'
      ? 'animate-preset-push-left'
      : 'animate-preset-push-right';

  const style: CSSProperties = {
    '--push-amp': amp.toFixed(3),
    animationDelay: `${delayMs}ms`,
  } as CSSProperties;

  return {
    className,
    style,
    key: `sidebar_push_${sidebarAnim.direction}_${sidebarAnim.key}_${orderFromRight}`,
    direction: sidebarAnim.direction,
    animKey: sidebarAnim.key,
  };
}
