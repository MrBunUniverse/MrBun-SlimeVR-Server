import { ReactNode } from 'react';
import { GearIcon } from '@/components/commons/icon/GearIcon';
import { HomeIcon } from '@/components/commons/icon/HomeIcon';
import { HumanIcon } from '@/components/commons/icon/HumanIcon';
import { RemoteIcon } from '@/components/commons/icon/RemoteIcon';
import { RulerIcon } from '@/components/commons/icon/RulerIcon';

export interface NavItem {
  to: string;
  /** Route pattern used to decide the active item (defaults to `to`). */
  match?: string;
  /** Route pattern that turns the item off even when `match` fits. */
  exclude?: string;
  labelId: string;
  fallback: string;
  icon: ReactNode;
  /** Cmd/Ctrl + this digit opens the page. */
  shortcut: string;
  /** Location state passed when the item is opened. */
  state?: Record<string, unknown>;
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    labelId: 'navbar-home',
    fallback: 'Home',
    icon: <HomeIcon />,
    shortcut: '1',
  },
  {
    to: '/remote',
    labelId: 'navbar-remote',
    fallback: 'Remote',
    icon: <RemoteIcon />,
    shortcut: '2',
  },
  {
    to: '/onboarding/home',
    match: '/onboarding/*',
    exclude: '/onboarding/body-proportions/*',
    labelId: 'navbar-onboarding',
    fallback: 'Setup Wizard',
    icon: <HumanIcon />,
    shortcut: '3',
  },
  {
    to: '/onboarding/body-proportions/scaled',
    match: '/onboarding/body-proportions/*',
    labelId: 'navbar-body_proportions',
    fallback: 'Body Proportions',
    icon: <RulerIcon />,
    shortcut: '5',
    state: { alonePage: true },
  },
  {
    to: '/settings/trackers',
    match: '/settings/*',
    labelId: 'navbar-settings',
    fallback: 'Settings',
    icon: <GearIcon />,
    shortcut: '4',
  },
];
