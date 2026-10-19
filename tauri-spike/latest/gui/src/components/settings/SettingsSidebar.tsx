import classNames from 'classnames';
import { useMemo, useState } from 'react';
import { NavLink, useLocation, useMatch } from 'react-router-dom';
import { Typography } from '@/components/commons/Typography';
import { useVRCConfig } from '@/hooks/vrc-config';
import { useLocalization } from '@fluent/react';

interface SettingsItemDef {
  id: string;
  to: string;
  scrollTo?: string;
  iconName: string;
  category: 'general' | 'interface' | 'osc' | 'utils';
}

function SidebarIcon({ name }: { name: string }) {
  switch (name) {
    case 'steamvr':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-2l-2 2-2-2H8a4 4 0 0 1-4-4Z" />
          <circle cx="9" cy="11" r="2" />
          <circle cx="15" cy="11" r="2" />
        </svg>
      );
    case 'stayaligned':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="3" x2="12" y2="21" />
          <path d="M4 7l8-4 8 4" />
          <path d="M6 18h4" />
          <path d="M14 18h4" />
          <path d="M8 7v7" />
          <path d="M16 7v7" />
        </svg>
      );
    case 'mechanics':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case 'fksettings':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v8" />
          <path d="M8 11l4 2 4-2" />
          <path d="M9 21l3-6 3 6" />
        </svg>
      );
    case 'gesture':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 11V6a2 2 0 0 0-4 0v5" />
          <path d="M14 10V4a2 2 0 0 0-4 0v7" />
          <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
          <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
        </svg>
      );
    case 'telemetry':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      );
    case 'notifications':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case 'behavior':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'appearance':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a10 10 0 0 1 0 20v-20z" fill="currentColor" />
        </svg>
      );
    case 'home':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case 'checklist':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case 'router':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case 'vrchat':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'vmc':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case 'serial':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      );
    case 'firmware':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" />
          <line x1="15" y1="20" x2="15" y2="23" />
        </svg>
      );
    case 'capture':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
          <circle cx="12" cy="10.5" r="2.5" />
        </svg>
      );
    case 'wizard':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        </svg>
      );
    case 'warnings':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'advanced':
    default:
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      );
  }
}

export function SettingsLink({
  to,
  scrollTo,
  id,
  iconName,
}: {
  id: string;
  to: string;
  scrollTo?: string;
  iconName?: string;
}) {
  const { state } = useLocation();
  const doesMatch = useMatch({
    path: to,
  });

  const isActive = useMemo(() => {
    const typedState: { scrollTo?: string } = state as any;
    return (
      (doesMatch && !scrollTo && !typedState?.scrollTo) ||
      (doesMatch && typedState?.scrollTo === scrollTo)
    );
  }, [state, doesMatch, scrollTo]);

  return (
    <NavLink
      to={to}
      state={{ scrollTo }}
      className={classNames(
        'group flex items-center gap-2.5 px-3 py-1.5 rounded-lg whitespace-nowrap text-ui-xs transition-colors select-none',
        {
          'text-accent-background-20 font-medium bg-accent-background-20/10':
            isActive,
          'text-background-30 hover:text-background-10 hover:bg-background-50/15 font-normal':
            !isActive,
        }
      )}
    >
      {iconName && (
        <div
          className={classNames(
            'w-4 h-4 flex items-center justify-center shrink-0 transition-colors',
            {
              'text-accent-background-20': isActive,
              'text-background-30 group-hover:text-background-10': !isActive,
            }
          )}
        >
          <SidebarIcon name={iconName} />
        </div>
      )}
      <Typography id={id} className="truncate tracking-normal text-ui-xs" />
    </NavLink>
  );
}

import { useOperatingMode } from '@/hooks/operating-mode';

export function SettingsSidebar() {
  const { l10n } = useLocalization();
  const { state: vrcConfigState } = useVRCConfig();
  const { isQuestStandalone } = useOperatingMode();
  const [searchQuery, setSearchQuery] = useState('');

  const allItems: SettingsItemDef[] = useMemo(
    () => [
      // General
      ...(isQuestStandalone
        ? []
        : [
            {
              id: 'settings-sidebar-steamvr',
              to: '/settings/trackers',
              scrollTo: 'steamvr',
              iconName: 'steamvr',
              category: 'general' as const,
            },
          ]),
      {
        id: 'settings-sidebar-stay_aligned',
        to: '/settings/trackers',
        scrollTo: 'stayaligned',
        iconName: 'stayaligned',
        category: 'general',
      },
      {
        id: 'settings-sidebar-tracker_mechanics',
        to: '/settings/trackers',
        scrollTo: 'mechanics',
        iconName: 'mechanics',
        category: 'general',
      },
      {
        id: 'settings-sidebar-fk_settings',
        to: '/settings/trackers',
        scrollTo: 'fksettings',
        iconName: 'fksettings',
        category: 'general',
      },
      {
        id: 'settings-sidebar-gesture_control',
        to: '/settings/trackers',
        scrollTo: 'gestureControl',
        iconName: 'gesture',
        category: 'general',
      },
      {
        id: 'settings-sidebar-telemetry',
        to: '/settings/trackers',
        scrollTo: 'telemetry',
        iconName: 'telemetry',
        category: 'general',
      },
      // Interface
      {
        id: 'settings-sidebar-notifications',
        to: '/settings/interface',
        scrollTo: 'notifications',
        iconName: 'notifications',
        category: 'interface',
      },
      {
        id: 'settings-sidebar-behavior',
        to: '/settings/interface',
        scrollTo: 'behavior',
        iconName: 'behavior',
        category: 'interface',
      },
      {
        id: 'settings-sidebar-appearance',
        to: '/settings/interface',
        scrollTo: 'appearance',
        iconName: 'appearance',
        category: 'interface',
      },
      {
        id: 'settings-sidebar-special-themes',
        to: '/settings/special-themes',
        iconName: 'appearance',
        category: 'interface',
      },
      {
        id: 'settings-sidebar-home',
        to: '/settings/interface/home',
        scrollTo: 'home',
        iconName: 'home',
        category: 'interface',
      },
      {
        id: 'settings-sidebar-checklist',
        to: '/settings/interface/home',
        scrollTo: 'checklist',
        iconName: 'checklist',
        category: 'interface',
      },
      // OSC
      {
        id: 'settings-sidebar-osc_router',
        to: '/settings/osc/router',
        scrollTo: 'router',
        iconName: 'router',
        category: 'osc',
      },
      {
        id: 'settings-sidebar-osc_trackers',
        to: '/settings/osc/vrchat',
        scrollTo: 'vrchat',
        iconName: 'vrchat',
        category: 'osc',
      },
      {
        id: 'settings-sidebar-osc_vmc',
        to: '/settings/osc/vmc',
        scrollTo: 'vmc',
        iconName: 'vmc',
        category: 'osc',
      },
      // Utilities
      {
        id: 'settings-sidebar-serial',
        to: '/settings/serial',
        iconName: 'serial',
        category: 'utils',
      },
      {
        id: 'settings-sidebar-firmware-tool',
        to: '/settings/firmware-tool',
        iconName: 'firmware',
        category: 'utils',
      },
      {
        id: 'settings-sidebar-quest-capture',
        to: '/settings/quest-capture',
        iconName: 'capture',
        category: 'utils',
      },
      {
        id: 'navbar-onboarding',
        to: '/onboarding/home',
        iconName: 'wizard',
        category: 'utils',
      },
      ...(vrcConfigState?.isSupported
        ? [
            {
              id: 'settings-sidebar-vrc_warnings',
              to: '/vrc-warnings',
              iconName: 'warnings',
              category: 'utils' as const,
            },
          ]
        : []),
      {
        id: 'settings-sidebar-advanced',
        to: '/settings/advanced',
        iconName: 'advanced',
        category: 'utils',
      },
    ],
    [vrcConfigState, isQuestStandalone]
  );

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return allItems;
    const q = searchQuery.toLowerCase();
    return allItems.filter((item) => {
      const label = l10n.getString(item.id) || item.id;
      return (
        label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
      );
    });
  }, [allItems, searchQuery, l10n]);

  const categories = [
    { key: 'general', titleId: 'settings-sidebar-general' },
    { key: 'interface', titleId: 'settings-sidebar-interface' },
    { key: 'osc', title: 'OSC' },
    { key: 'utils', titleId: 'settings-sidebar-utils' },
  ];

  return (
    <div className="settings-sidebar relative flex flex-col px-2.5 py-3 gap-2 overflow-y-auto bg-[var(--material-tertiary)] rounded-[16px] border border-[var(--material-border-subtle)] h-full shadow-xs select-none">
      {/* Search Bar matching Claude technical aesthetic */}
      <div className="relative w-0 min-w-full flex items-center">
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none text-background-30">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Settings"
          className="w-full pl-8 pr-7 py-1.5 rounded-[10px] bg-[var(--material-secondary)] border border-[var(--material-border-subtle)] focus:border-accent-background-20/40 text-ui-2xs placeholder-background-30 text-background-10 focus:outline-none transition-all leading-normal"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-4 rounded-full hover:bg-background-60 text-background-30 hover:text-background-10 transition-colors"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Filtered Results or Categorized Sections */}
      {searchQuery.trim() ? (
        <div className="flex flex-col gap-1 mt-1">
          {filteredItems.length === 0 ? (
            <div className="py-6 text-center text-ui-2xs text-background-30">
              No matching settings found
            </div>
          ) : (
            filteredItems.map((item) => (
              <SettingsLink
                key={item.id + (item.scrollTo || '')}
                to={item.to}
                scrollTo={item.scrollTo}
                id={item.id}
                iconName={item.iconName}
              />
            ))
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {categories.map((cat) => {
            const items = filteredItems.filter((i) => i.category === cat.key);
            if (items.length === 0) return null;

            return (
              <div key={cat.key} className="flex flex-col gap-1">
                <div className="px-2 pt-1 pb-0.5">
                  {cat.titleId ? (
                    <Typography
                      variant="section-title"
                      id={cat.titleId}
                      className="text-ui-2xs font-semibold uppercase tracking-wider text-background-30"
                    />
                  ) : (
                    <span className="text-ui-2xs font-semibold uppercase tracking-wider text-background-30">
                      {cat.title}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  {items.map((item) => (
                    <SettingsLink
                      key={item.id + (item.scrollTo || '')}
                      to={item.to}
                      scrollTo={item.scrollTo}
                      id={item.id}
                      iconName={item.iconName}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
