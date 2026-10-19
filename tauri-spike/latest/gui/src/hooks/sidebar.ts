import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useCallback } from 'react';
import { useBreakpoint } from './breakpoint';

const sidebarCollapsedAtom = atomWithStorage('slimevr-sidebar-collapsed', false);

export const SIDEBAR_WIDTH = 224;
// Icon-only rail; the macOS window buttons live in their own title strip.
export const SIDEBAR_COLLAPSED_WIDTH = 88;

/**
 * Sidebar state. Narrow windows always show the icon-only sidebar so the
 * content keeps its space.
 */
export function useSidebar() {
  const { isMobile } = useBreakpoint('mobile');
  const [userCollapsed, setUserCollapsed] = useAtom(sidebarCollapsedAtom);
  const sidebarCollapsed = isMobile || userCollapsed;

  const toggleSidebar = useCallback(
    () => setUserCollapsed((collapsed) => !collapsed),
    [setUserCollapsed]
  );

  return {
    sidebarCollapsed,
    toggleSidebar,
    sidebarWidth: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
  };
}
