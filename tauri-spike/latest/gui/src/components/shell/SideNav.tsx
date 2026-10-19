import { useLocalization } from '@fluent/react';
import classNames from 'classnames';
import { KeyboardEvent, useRef } from 'react';
import { NavLink, matchPath, useLocation, useMatch } from 'react-router-dom';
import { PixelIcon } from '@/components/commons/PixelIcon';
import { SlimeVRIcon } from '@/components/commons/icon/SimevrIcon';
import { useSidebar } from '@/hooks/sidebar';
import { NAV_ITEMS, NavItem } from './nav-items';

export const APP_NAME = 'SirJameSlimeVR';

function SideNavLink({
  item,
  collapsed,
}: {
  item: NavItem;
  collapsed: boolean;
}) {
  const { l10n } = useLocalization();
  const { pathname } = useLocation();
  const matched = !!useMatch({ path: item.match || item.to, end: !item.match });
  const excluded = !!item.exclude && !!matchPath(item.exclude, pathname);
  const active = matched && !excluded;
  const label = l10n.getString(item.labelId, null, item.fallback);

  return (
    <NavLink
      to={item.to}
      state={item.state}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={classNames(
        'sidenav__item flex h-9 items-center gap-3 rounded-[10px] text-ui-xs font-medium',
        // Same inset in both states so icons never shift when toggling.
        'px-[26px]',
        active
          ? 'bg-accent-background-20/[0.12] text-accent-background-10'
          : 'text-background-20 hover:bg-background-10/[0.06] hover:text-background-10'
      )}
    >
      <span
        className={classNames(
          'flex h-5 w-5 shrink-0 items-center justify-center',
          active
            ? 'fill-accent-background-10 text-accent-background-10'
            : 'fill-background-30 text-background-30'
        )}
      >
        {item.icon}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

export function SideNav() {
  const { l10n } = useLocalization();
  const { sidebarCollapsed, toggleSidebar, sidebarWidth } = useSidebar();
  const listRef = useRef<HTMLUListElement>(null);

  // Up/Down/Home/End move between destinations.
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const focusables = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('a, button') ?? []
    );
    const index = focusables.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? focusables.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + focusables.length) %
            focusables.length;
    focusables[next]?.focus();
  };

  return (
    <aside
      aria-label={l10n.getString(
        'nav-primary-label',
        null,
        'Primary navigation'
      )}
      style={{
        width: sidebarWidth,
        ['--sidenav-w' as string]: `${sidebarWidth}px`,
      }}
      className="sidenav flex h-full shrink-0 flex-col border-r border-[var(--material-border-subtle)] bg-background-70"
    >
      {/* Brand row: logo and name double as the sidebar toggle. */}
      <div
        className={classNames('flex h-[46px] shrink-0 items-center px-2')}
        style={{ WebkitAppRegion: 'drag' } as any}
        data-electron-drag-region
      >
        <button
          type="button"
          onClick={toggleSidebar}
          aria-expanded={!sidebarCollapsed}
          aria-label={l10n.getString(
            sidebarCollapsed ? 'nav-sidebar-expand' : 'nav-sidebar-collapse',
            null,
            sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
          )}
          title={l10n.getString(
            sidebarCollapsed ? 'nav-sidebar-expand' : 'nav-sidebar-collapse',
            null,
            sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
          )}
          style={{ WebkitAppRegion: 'no-drag' } as any}
          className={classNames(
            'group flex h-9 cursor-pointer items-center gap-2 rounded-[10px] pl-[17px] pr-2 text-background-10 hover:bg-background-10/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20/70',
            !sidebarCollapsed && 'w-full'
          )}
        >
          {/* Bun: the logo is redrawn as pixel art, like the app icon. Other themes get the vector logo. */}
          <PixelIcon size={38} grid={24}>
            <SlimeVRIcon />
          </PixelIcon>
          {!sidebarCollapsed && (
            <span className="truncate font-serif text-ui-sm tracking-tight">
              {APP_NAME}
            </span>
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={classNames(
              'shrink-0 text-background-30 group-hover:text-background-10',
              sidebarCollapsed ? '' : 'ml-auto rotate-180'
            )}
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <ul ref={listRef} onKeyDown={onKeyDown} className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <SideNavLink item={item} collapsed={sidebarCollapsed} />
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
