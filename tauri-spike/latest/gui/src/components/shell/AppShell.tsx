import { useLocalization } from '@fluent/react';
import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMac } from '@/hooks/platform';
import { useSidebar } from '@/hooks/sidebar';
import { NAV_ITEMS } from './nav-items';
import { SideNav } from './SideNav';

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Wraps every screen. Provides the skip link, the `main` landmark, the sidebar
 * (when that navigation layout is selected) and the global shortcuts:
 * Cmd/Ctrl+B toggles the sidebar and Cmd/Ctrl+1..4 jump between pages.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { l10n } = useLocalization();
  const navigate = useNavigate();
  const isMac = useIsMac();
  const { toggleSidebar } = useSidebar();

  // Lets CSS pause decorative animations while the window is hidden.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.classList.toggle('is-page-hidden', document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleSidebar();
        return;
      }

      const item = NAV_ITEMS.find(
        (candidate) => candidate.shortcut === event.key
      );
      if (item) {
        event.preventDefault();
        navigate(item.to, { state: item.state });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, toggleSidebar]);

  return (
    <div className="flex h-full w-full flex-col">
      {isMac && (
        <div
          className="h-7 w-full shrink-0 select-none bg-background-70 border-b border-[var(--material-border-subtle)]"
          style={{ WebkitAppRegion: 'drag' } as any}
          data-electron-drag-region
        />
      )}
      <div className="flex min-h-0 w-full flex-1">
        <a
          href="#main-content"
          className="skip-link text-ui-xs font-medium"
          onClick={(event) => {
            // The app uses hash routing, so a bare #anchor must not navigate.
            event.preventDefault();
            document.getElementById('main-content')?.focus();
          }}
        >
          {l10n.getString('nav-skip-to-content', null, 'Skip to content')}
        </a>
        <SideNav />
        <main
          id="main-content"
          tabIndex={-1}
          className="h-full min-w-0 flex-1 outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
