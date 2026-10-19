import { useNavigate } from 'react-router-dom';
import { useLocalization } from '@fluent/react';
import { TrackerDataT } from 'solarxr-protocol';
import { useConfig } from '@/hooks/config';
import { Typography } from '@/components/commons/Typography';
import { TrackersTable } from '@/components/tracker/TrackersTable';
import { useAtomValue, useAtom } from 'jotai';
import {
  assignedTrackersAtom,
  unassignedTrackersAtom,
  showSidebarAtom,
  connectedIMUTrackersAtom,
  sidebarAnimationAtom,
  hasRealTrackersAtom,
} from '@/store/app-store';
import { demoModeAtom } from '@/store/demo-trackers';
import { useSidebarPushAnimation } from '@/hooks/sidebar-animation';
import { useState, useRef, useEffect, CSSProperties } from 'react';
import classNames from 'classnames';
import { HomeSettingsModal } from './HomeSettingsModal';
import { HomeEmptyState } from './HomeEmptyState';
import { BaseModal } from '@/components/commons/BaseModal';
import { ResetActionsGroup } from '@/components/Toolbar';
import { useTrackerPresets } from '@/hooks/presets';
import { useWebsocketAPI } from '@/hooks/websocket-api';

import { Sidebar } from '@/components/Sidebar';
import { useBreakpoint } from '@/hooks/breakpoint';
import { useTrackingChecklist } from '@/hooks/tracking-checklist';

function CardViewIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.5" />
    </svg>
  );
}

function TableViewIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
      <line x1="1.5" y1="5.5" x2="14.5" y2="5.5" />
      <line x1="1.5" y1="10.5" x2="14.5" y2="10.5" />
      <line x1="6" y1="5.5" x2="6" y2="14.5" />
    </svg>
  );
}

function SkeletonViewIcon({ className }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="4" r="2.2" />
      <line x1="12" y1="6.2" x2="12" y2="13.5" />
      <path d="M5.5 13.5L7 8.5L12 8.5L17 8.5L18.5 13.5" />
      <path d="M7.5 21L8.5 13.5L12 13.5L15.5 13.5L16.5 21" />
      <circle cx="7" cy="8.5" r="0.6" fill="currentColor" />
      <circle cx="17" cy="8.5" r="0.6" fill="currentColor" />
      <circle cx="12" cy="8.5" r="0.6" fill="currentColor" />
      <circle cx="8.5" cy="13.5" r="0.6" fill="currentColor" />
      <circle cx="15.5" cy="13.5" r="0.6" fill="currentColor" />
      <circle cx="8" cy="17" r="0.6" fill="currentColor" />
      <circle cx="16" cy="17" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function Home() {
  const { l10n } = useLocalization();
  const { config, setConfig } = useConfig();
  const trackers = useAtomValue(assignedTrackersAtom);
  const unassignedTrackers = useAtomValue(unassignedTrackersAtom);
  const navigate = useNavigate();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    const fade = fadeRef.current;
    if (!el || !fade) return;

    const onScroll = () => {
      const opacity = Math.min(el.scrollTop / 20, 1);
      fade.style.opacity = String(opacity);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const sendToSettings = (tracker: TrackerDataT) => {
    navigate(
      `/tracker/${tracker.trackerId?.trackerNum}/${tracker.trackerId?.deviceId?.id}`
    );
  };

  const settingsOpenState = useState(false);

  const toggleLayout = () => {
    setConfig({
      homeLayout: config?.homeLayout === 'table' ? 'default' : 'table',
    });
  };

  const sidebarAnim = useAtomValue(sidebarAnimationAtom);
  const [activeViewAnim, setActiveViewAnim] = useState<{
    id: 'card' | 'table' | 'skeleton';
    key: number;
  } | null>(null);

  const [lastSidebarKey, setLastSidebarKey] = useState<number | null>(null);
  const [viewAnimMode, setViewAnimMode] = useState<'local' | 'sidebar'>(
    'local'
  );

  useEffect(() => {
    if (sidebarAnim && sidebarAnim.key !== lastSidebarKey) {
      setLastSidebarKey(sidebarAnim.key);
      setViewAnimMode('sidebar');
    }
  }, [sidebarAnim, lastSidebarKey]);

  const viewButtonOrder = ['card', 'table', 'skeleton'] as const;

  const handleViewTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    current: 'card' | 'table'
  ) => {
    const tabs = ['card', 'table'] as const;
    const index = tabs.indexOf(current);
    let nextIndex = index;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    document.getElementById(`home-view-tab-${tabs[nextIndex]}`)?.focus();
  };

  const handleViewAction = (
    id: 'card' | 'table' | 'skeleton',
    action: () => void
  ) => {
    action();
    setViewAnimMode('local');
    setActiveViewAnim((prev) => ({
      id,
      key: (prev?.key ?? 0) + 1,
    }));
  };

  useEffect(() => {
    if (!activeViewAnim) return;

    const timeoutId = window.setTimeout(() => {
      setActiveViewAnim(null);
    }, 520);

    return () => window.clearTimeout(timeoutId);
  }, [activeViewAnim?.key]);

  const selectedViewIdx = activeViewAnim
    ? viewButtonOrder.indexOf(activeViewAnim.id)
    : -1;

  const getViewAnimProps = (id: 'card' | 'table' | 'skeleton') => {
    if (viewAnimMode === 'sidebar' && sidebarAnim) {
      if (id === 'skeleton' && activeViewAnim?.id === 'skeleton') {
        return {
          className: 'animate-preset-pop',
          style: { '--pop-scale': '0.38' } as CSSProperties,
        };
      }
      if (id === 'table' || id === 'card') {
        const order = id === 'table' ? 0 : 1;
        const amp = Math.pow(0.55, order) * 0.35;
        const delay = `${order * 35}ms`;
        const className =
          sidebarAnim.direction === 'left'
            ? 'animate-preset-push-left'
            : 'animate-preset-push-right';
        const style = {
          '--push-amp': amp.toFixed(3),
          animationDelay: delay,
        } as CSSProperties;
        return { className, style };
      }
    }

    const idx = viewButtonOrder.indexOf(id);
    const isSelected = activeViewAnim?.id === id;
    const distance = selectedViewIdx >= 0 ? Math.abs(idx - selectedViewIdx) : 0;
    const className = !activeViewAnim
      ? undefined
      : isSelected
        ? 'animate-preset-pop'
        : idx < selectedViewIdx
          ? 'animate-preset-push-left'
          : 'animate-preset-push-right';
    const style = !activeViewAnim
      ? undefined
      : isSelected
        ? ({ '--pop-scale': '0.2' } as CSSProperties)
        : ({
            '--push-amp': Math.max(0.12, 0.24 - distance * 0.04).toFixed(2),
            animationDelay: `${Math.max(0, distance - 1) * 24}ms`,
          } as CSSProperties);

    return { className, style };
  };

  // Keep the shared control-animation contract used by the home view tests;
  // compactPillAnim and leftClusterAnim are now represented by this static strip.
  const collapseAnim = useSidebarPushAnimation(8);
  const tableContainerAnim = useSidebarPushAnimation(2);
  const localViewSwitchKey =
    viewAnimMode === 'local' &&
    activeViewAnim != null &&
    activeViewAnim.id !== 'skeleton'
      ? activeViewAnim.key
      : null;
  const cardLayoutTransitionKey =
    viewAnimMode === 'local' && activeViewAnim?.id === 'card'
      ? activeViewAnim.key
      : null;

  const [showSidebar, setShowSidebar] = useAtom(showSidebarAtom);
  const { completion: checklistCompletion } = useTrackingChecklist();
  // When the inspector is closed there is no Checklist tab to carry the dot.
  const checklistNeedsAttention =
    checklistCompletion === 'incomplete' || checklistCompletion === 'partial';
  const { activePreset, presets, activePresetId, setActivePresetId } =
    useTrackerPresets();
  const { isConnected } = useWebsocketAPI();
  const connectedTrackers = useAtomValue(connectedIMUTrackersAtom);
  const isHealthy = isConnected && connectedTrackers.length > 0;
  const demoMode = useAtomValue(demoModeAtom);
  const hasRealTrackers = useAtomValue(hasRealTrackersAtom);
  const isDemo = demoMode && !hasRealTrackers;

  const { isMobile } = useBreakpoint('mobile');
  const isSidebarVisible = !isMobile && showSidebar;
  const [hasBeenOpened, setHasBeenOpened] = useState(isSidebarVisible);

  const [sidebarWidth, setSidebarWidth] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('slimevr-sidebar-width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 300 && parsed <= 520) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return null;
  });

  const [windowSize, setWindowSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  const [isDragging, setIsDragging] = useState(false);
  const [isTrackerSetupOpen, setIsTrackerSetupOpen] = useState(false);
  const dragStartXRef = useRef<number>(0);
  const dragStartWidthRef = useRef<number>(0);
  const sidebarContainerRef = useRef<HTMLDivElement | null>(null);
  const maxSidebarWidth = Math.max(
    300,
    Math.min(520, Math.floor(windowSize.width * 0.38))
  );
  const resolvedSidebarWidth = Math.min(sidebarWidth || 360, maxSidebarWidth);

  useEffect(() => {
    const updateWindowSize = () =>
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', updateWindowSize);
    return () => window.removeEventListener('resize', updateWindowSize);
  }, []);

  useEffect(() => {
    if (sidebarWidth != null && sidebarWidth > maxSidebarWidth) {
      setSidebarWidth(maxSidebarWidth);
    }
  }, [sidebarWidth, maxSidebarWidth]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    const currentWidth =
      sidebarContainerRef.current?.getBoundingClientRect().width ||
      sidebarWidth ||
      340;
    dragStartWidthRef.current = currentWidth;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    const delta = dragStartXRef.current - e.clientX;
    const newWidth = dragStartWidthRef.current + delta;
    const minWidth = 300;
    const clamped = Math.round(
      Math.min(Math.max(newWidth, minWidth), maxSidebarWidth)
    );
    setSidebarWidth(clamped);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (sidebarWidth) {
      try {
        localStorage.setItem('slimevr-sidebar-width', sidebarWidth.toString());
      } catch {
        // ignore
      }
    }
  };

  const handleDoubleClick = () => {
    setSidebarWidth(null);
    try {
      localStorage.removeItem('slimevr-sidebar-width');
    } catch {
      // ignore
    }
  };

  const handleResizeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Home') {
      e.preventDefault();
      handleDoubleClick();
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    e.preventDefault();
    const minWidth = 300;
    const step = e.shiftKey ? 48 : 24;
    const nextWidth = Math.min(
      maxSidebarWidth,
      Math.max(
        minWidth,
        resolvedSidebarWidth + (e.key === 'ArrowLeft' ? step : -step)
      )
    );
    setSidebarWidth(nextWidth);
    try {
      localStorage.setItem('slimevr-sidebar-width', nextWidth.toString());
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isSidebarVisible) setHasBeenOpened(true);
  }, [isSidebarVisible]);

  return (
    <div className="home-view relative h-full flex flex-col min-h-0 overflow-hidden">
      <HomeSettingsModal open={settingsOpenState} />

      {/* Demo: a striped band, so simulated trackers can't be mistaken for live data. */}
      {isDemo && (
        <div
          role="status"
          className="shrink-0 border-b border-status-warning/30 py-1 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-status-warning"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, rgba(var(--warning), 0.14) 0 10px, transparent 10px 20px)',
          }}
        >
          Demo · simulated trackers, not live data
        </div>
      )}

      {/* Minimalist Flush Header Bar - No Floating Dock - Spans 100% full width, fixed position */}
      <div
        className="home-command-bar relative z-50 mx-3 flex flex-nowrap items-center gap-2 border-b border-background-10/[0.04] px-2 py-1.5 pt-2.5 select-none sm:mx-4 sm:gap-3 sm:px-3"
        role="toolbar"
        aria-label="Tracking controls"
      >
        {/* Left Section: Compact tracker status, always visible */}
        <div className="home-command-bar__group home-command-bar__status relative shrink-0">
          <button
            type="button"
            onClick={() => setIsTrackerSetupOpen((open) => !open)}
            style={collapseAnim.style}
            className={classNames(
              'flex min-h-9 flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-ui-2xs text-background-20 transition-colors cursor-pointer select-none hover:bg-background-60 hover:text-background-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20',
              collapseAnim.className
            )}
            aria-label={`${l10n.getString('home-tracker-target')} ${activePreset?.targetCount ?? 5}, ${l10n.getString('home-tracker-connected')} ${connectedTrackers.length}. ${l10n.getString('home-tracker-setup')}.`}
            aria-expanded={isTrackerSetupOpen}
            aria-controls="home-tracker-setup-popover"
          >
            <span
              className={classNames(
                'w-1.5 h-1.5 rounded-full shrink-0',
                isConnected
                  ? isHealthy
                    ? 'bg-status-success'
                    : 'bg-status-warning'
                  : 'bg-status-critical'
              )}
              aria-hidden="true"
            />
            {/* The one tracker count on screen: connected out of the preset's target. */}
            <span className="font-mono font-semibold text-background-10">
              {connectedTrackers.length}/{activePreset?.targetCount ?? 5}
            </span>
            <span className="home-tracker-count__label lowercase">
              {l10n.getString('home-tracker-connected')}
            </span>
            <span
              className={classNames(
                'ml-0.5 text-ui-2xs leading-none text-background-30 transition-transform',
                isTrackerSetupOpen && 'rotate-180'
              )}
              aria-hidden="true"
            >
              ⌄
            </span>
          </button>

          {isTrackerSetupOpen && (
            <>
              <button
                type="button"
                aria-label="Close tracker setup chooser"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setIsTrackerSetupOpen(false)}
              />
              <div
                id="home-tracker-setup-popover"
                className="absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-1rem))] rounded-[13px] border border-[var(--material-border-primary)] bg-background-70 p-2.5 shadow-xl"
              >
                <div className="px-2 pb-1.5 pt-0.5 text-ui-2xs font-semibold uppercase tracking-[0.08em] text-background-30">
                  {l10n.getString('home-tracker-setup')}
                </div>
                <div className="flex flex-col gap-1.5">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.description}
                      aria-label={`${preset.targetCount} trackers: ${preset.name}`}
                      onClick={() => setActivePresetId(preset.id)}
                      className={classNames(
                        'grid w-full grid-cols-[auto_1fr] items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20/70',
                        preset.mode === activePresetId
                          ? 'border-accent-background-20/75 bg-accent-background-20/10'
                          : 'border-[var(--material-border-subtle)] hover:border-accent-background-20/40 hover:bg-[var(--material-tertiary-hover)]'
                      )}
                    >
                      <span className="font-serif text-ui-lg leading-none tracking-tight text-background-10">
                        x{preset.targetCount}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-ui-2xs font-medium leading-tight text-background-10">
                          {preset.name}
                        </span>
                        <span className="truncate text-ui-2xs leading-tight text-background-30">
                          {preset.description}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 border-t border-[var(--material-border-subtle)] pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsTrackerSetupOpen(false);
                      navigate('/onboarding/trackers-assign');
                    }}
                    className="w-full rounded-[8px] bg-accent-background-20/15 px-2.5 py-2 text-left text-ui-2xs font-medium text-accent-background-10 transition-colors hover:bg-accent-background-20/25 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20/70"
                  >
                    {l10n.getString('navbar-trackers_assign')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Center Section: Unified Resets & Calibrations */}
        <div
          className="home-command-bar__group home-command-bar__center flex items-center justify-center shrink-0"
          role="group"
          aria-label="Calibration and reset actions"
        >
          <ResetActionsGroup />
        </div>

        {/* Right Section: Minimalist View Mode & 3D Skeleton Controls */}
        <div
          className="home-command-bar__group home-command-bar__views flex items-center gap-2 shrink-0"
          role="group"
          aria-label="Workspace view"
        >
          {/* Card / Table Layout Segmented Control */}
          <div
            className="home-view-switcher flex items-center gap-0.5 overflow-hidden rounded-[9px] border p-0.5 border-background-10/[0.08] bg-background-10/[0.04]"
            role="tablist"
            aria-label={l10n.getString('home-view-select')}
          >
            <button
              id="home-view-tab-card"
              key={`card_${activeViewAnim?.key ?? 0}`}
              type="button"
              role="tab"
              aria-label={l10n.getString('home-view-cards')}
              aria-selected={config?.homeLayout !== 'table'}
              aria-controls="home-tracker-view-panel"
              tabIndex={config?.homeLayout !== 'table' ? 0 : -1}
              onKeyDown={(event) => handleViewTabKeyDown(event, 'card')}
              onClick={() => {
                handleViewAction('card', () => {
                  if (config?.homeLayout === 'table') toggleLayout();
                });
              }}
              style={getViewAnimProps('card').style}
              className={classNames(
                'home-view-switcher__button flex min-h-9 items-center justify-center gap-2 rounded-[7px] px-2.5 py-1.5 text-ui-2xs font-medium transition-[background-color,color,box-shadow,transform] cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20',
                config?.homeLayout !== 'table'
                  ? 'bg-white dark:bg-background-10/[0.12] text-background-10 shadow-xs'
                  : 'text-background-30 hover:text-background-10',
                getViewAnimProps('card').className
              )}
            >
              <CardViewIcon />
              <span className="home-view-label">
                {l10n.getString('home-view-cards')}
              </span>
            </button>

            <button
              id="home-view-tab-table"
              key={`table_${activeViewAnim?.key ?? 0}`}
              type="button"
              role="tab"
              aria-label={l10n.getString('home-view-table')}
              aria-selected={config?.homeLayout === 'table'}
              aria-controls="home-tracker-view-panel"
              tabIndex={config?.homeLayout === 'table' ? 0 : -1}
              onKeyDown={(event) => handleViewTabKeyDown(event, 'table')}
              onClick={() => {
                handleViewAction('table', () => {
                  if (config?.homeLayout !== 'table') toggleLayout();
                });
              }}
              style={getViewAnimProps('table').style}
              className={classNames(
                'home-view-switcher__button flex min-h-9 items-center justify-center gap-2 rounded-[7px] px-2.5 py-1.5 text-ui-2xs font-medium transition-[background-color,color,box-shadow,transform] cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20',
                config?.homeLayout === 'table'
                  ? 'bg-white dark:bg-background-10/[0.12] text-background-10 shadow-xs'
                  : 'text-background-30 hover:text-background-10',
                getViewAnimProps('table').className
              )}
            >
              <TableViewIcon />
              <span className="home-view-label">
                {l10n.getString('home-view-table')}
              </span>
            </button>
          </div>

          {/* 3D Realtime Skeleton Preview Toggle */}
          <button
            key={`skeleton_${activeViewAnim?.key ?? 0}`}
            type="button"
            onClick={() => {
              handleViewAction('skeleton', () => {
                setShowSidebar(!showSidebar);
              });
            }}
            style={getViewAnimProps('skeleton').style}
            className={classNames(
              'home-skeleton-toggle relative flex min-h-9 min-w-9 items-center justify-center rounded-[9px] border px-2 py-1.5 text-ui-2xs font-medium transition-[background-color,border-color,color,box-shadow,transform] cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20',
              showSidebar
                ? 'bg-accent-background-20/15 text-accent-background-10 border-accent-background-20/30 shadow-xs'
                : 'bg-background-10/[0.04] text-background-30 hover:text-background-10 border-background-10/[0.08]',
              getViewAnimProps('skeleton').className
            )}
            aria-label={l10n.getString(
              showSidebar ? 'home-view-preview-hide' : 'home-view-preview'
            )}
            aria-expanded={showSidebar}
            aria-controls={
              isMobile
                ? 'home-mobile-skeleton-preview'
                : 'home-skeleton-preview'
            }
            title={l10n.getString(
              showSidebar ? 'home-view-preview-hide' : 'home-view-preview'
            )}
          >
            <SkeletonViewIcon />
            {checklistNeedsAttention && !showSidebar && (
              <span
                role="img"
                aria-label={l10n.getString(
                  'inspector-checklist-attention',
                  null,
                  'Needs attention'
                )}
                className="absolute right-1 top-1 h-2 w-2 rounded-full bg-status-warning ring-2 ring-background-70"
              />
            )}
          </button>
        </div>
      </div>

      {/* Lower Workspace Split: Left = Tracker Scroll Area, Right = 3D Skeleton Live View */}
      <div className="relative flex-grow min-h-0 flex flex-row overflow-hidden">
        {/* Left Column: Scroll Area Container */}
        <div className="relative flex-grow min-w-0 flex flex-col h-full">
          {/* Top Fade Gradient Scrim */}
          <div
            ref={fadeRef}
            className="pointer-events-none absolute top-0 left-0 right-0 h-10 z-20 transition-opacity duration-150 ease-out"
            style={{
              opacity: 0,
              background:
                'linear-gradient(to bottom, rgb(var(--background-80)) 0%, rgba(var(--background-80), 0.8) 40%, rgba(var(--background-80), 0.2) 75%, rgba(var(--background-80), 0) 100%)',
            }}
          />

          <div
            ref={scrollContainerRef}
            id="home-tracker-view-panel"
            role="tabpanel"
            aria-labelledby={`home-view-tab-${config?.homeLayout === 'table' ? 'table' : 'card'}`}
            tabIndex={0}
            className="overflow-y-auto overflow-x-hidden flex-grow flex flex-col relative h-full bg-background-80"
          >
            {config?.homeLayout === 'table' ? (
              <div key="layout-table" className="flex flex-col flex-grow pb-6">
                {trackers.length > 0 && (
                  <>
                    <div className="flex w-full gap-2 items-center px-3 h-5">
                      <Typography
                        color="secondary"
                        id="toolbar-assigned_trackers"
                        vars={{ count: trackers.length }}
                        className="text-ui-2xs font-semibold tracking-tight"
                      />
                      <div className="bg-background-50/30 h-[1px] rounded-full flex-grow" />
                    </div>
                    <div
                      style={tableContainerAnim.style}
                      className={classNames(
                        'mx-2 overflow-x-auto will-change-transform',
                        tableContainerAnim.className
                      )}
                    >
                      <TrackersTable
                        flatTrackers={trackers}
                        clickedTracker={(tracker) => sendToSettings(tracker)}
                      />
                    </div>
                  </>
                )}

                {unassignedTrackers.length > 0 && (
                  <>
                    <div className="flex w-full gap-2 items-center px-4 h-5 mt-4">
                      <Typography
                        color="secondary"
                        id="toolbar-unassigned_trackers"
                        vars={{ count: unassignedTrackers.length }}
                      />
                      <div className="bg-background-50 h-[2px] rounded-lg flex-grow" />
                    </div>
                    <div
                      style={tableContainerAnim.style}
                      className={classNames(
                        'mx-2 overflow-x-auto will-change-transform',
                        tableContainerAnim.className
                      )}
                    >
                      <TrackersTable
                        flatTrackers={unassignedTrackers}
                        clickedTracker={(tracker) => sendToSettings(tracker)}
                      />
                    </div>
                  </>
                )}

                {trackers.length === 0 && unassignedTrackers.length === 0 && (
                  <HomeEmptyState
                    viewSwitchKey={localViewSwitchKey}
                    cardLayoutTransitionKey={cardLayoutTransitionKey}
                    suppressGridEntrance={
                      viewAnimMode === 'local' && activeViewAnim !== null
                    }
                  />
                )}
              </div>
            ) : config?.homeLayout == 'default' || !config?.homeLayout ? (
              /* Claude Window Card Dashboard (replaces legacy <TrackerCard /> grid) */
              <HomeEmptyState
                key={`layout-card-${config?.homeLayout || 'default'}`}
                viewSwitchKey={localViewSwitchKey}
                cardLayoutTransitionKey={cardLayoutTransitionKey}
                suppressGridEntrance={
                  viewAnimMode === 'local' && activeViewAnim !== null
                }
              />
            ) : (
              <HomeEmptyState
                key={`layout-card-${config?.homeLayout || 'default'}`}
                viewSwitchKey={localViewSwitchKey}
                cardLayoutTransitionKey={cardLayoutTransitionKey}
                suppressGridEntrance={
                  viewAnimMode === 'local' && activeViewAnim !== null
                }
              />
            )}
          </div>
        </div>

        {/* Right column: docked inspector (skeleton preview + setup checklist). */}
        {!isMobile && (
          <div
            ref={sidebarContainerRef}
            style={{
              width: isSidebarVisible ? `${resolvedSidebarWidth}px` : 0,
            }}
            className={classNames(
              'relative h-full shrink-0',
              isSidebarVisible ? 'pointer-events-auto' : 'pointer-events-none'
            )}
            aria-hidden={!isSidebarVisible}
          >
            {isSidebarVisible && (
              <div
                role="separator"
                tabIndex={0}
                aria-label={l10n.getString('home-view-preview')}
                aria-orientation="vertical"
                aria-valuemin={300}
                aria-valuemax={maxSidebarWidth}
                aria-valuenow={resolvedSidebarWidth}
                aria-valuetext={`${resolvedSidebarWidth} px`}
                aria-controls="home-skeleton-preview"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onDoubleClick={handleDoubleClick}
                onKeyDown={handleResizeKeyDown}
                className="group absolute -left-2 top-0 bottom-0 z-30 flex w-4 cursor-col-resize touch-none select-none items-center justify-center"
                title="Drag to resize. Double-click to reset."
              >
                <div
                  className={classNames(
                    'h-12 w-1 rounded-full',
                    isDragging
                      ? 'bg-accent-background-20'
                      : 'bg-background-40/60 group-hover:bg-accent-background-20'
                  )}
                />
              </div>
            )}

            <div
              id="home-skeleton-preview"
              className="flex h-full min-w-0 flex-col overflow-hidden border-l border-[var(--material-border-subtle)] bg-background-70"
            >
              {(hasBeenOpened || isSidebarVisible) && (
                <Sidebar onResetPreviewWidth={handleDoubleClick} />
              )}
            </div>
          </div>
        )}

        {isMobile && (
          <BaseModal
            isOpen={showSidebar}
            onRequestClose={() => setShowSidebar(false)}
            closeable
            contentLabel={l10n.getString('home-view-preview')}
            overlayClassName="fixed inset-0 z-[80] flex justify-end bg-background-90/80"
            className="m-2 flex h-[calc(100%-1rem)] w-[min(420px,calc(100vw-1rem))] max-w-none flex-col overflow-hidden rounded-xl border border-[var(--material-border-primary)] bg-background-70 p-2 text-background-10 shadow-xl outline-none"
          >
            <div className="flex min-h-10 items-center justify-between gap-3 px-2">
              <span className="font-serif text-ui-xs text-background-10">
                {l10n.getString('home-view-preview')}
              </span>
              <button
                type="button"
                onClick={() => setShowSidebar(false)}
                className="min-h-9 rounded-lg px-3 text-ui-2xs text-background-20 hover:bg-background-60 hover:text-background-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20"
              >
                {l10n.getString('tracking_checklist-settings-close')}
              </button>
            </div>
            <div id="home-mobile-skeleton-preview" className="min-h-0 flex-1">
              <Sidebar />
            </div>
          </BaseModal>
        )}
      </div>
    </div>
  );
}
