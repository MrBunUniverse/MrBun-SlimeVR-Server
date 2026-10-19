import classNames from 'classnames';
import {
  Children,
  Fragment,
  isValidElement,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';

export function SettingsPageLayout({
  children,
  className,
  ...props
}: {
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const { state } = useLocation();

  useEffect(() => {
    const typedState: { scrollTo: string } = state;
    if (!pageRef.current || !typedState || !typedState.scrollTo) {
      return;
    }
    const elem = pageRef.current.querySelector(
      `#${typedState.scrollTo}`
    ) as HTMLElement | null;
    if (elem) {
      // Scroll the settings panel only. scrollIntoView also scrolls the app's overflow-hidden root, which pushed the window up.
      const panel = elem.closest<HTMLElement>('.overflow-y-auto');
      if (!panel) return;
      const top =
        elem.getBoundingClientRect().top -
        panel.getBoundingClientRect().top +
        panel.scrollTop;
      panel.scrollTo({ top, behavior: 'smooth' });
    }
  }, [state]);

  return (
    <div ref={pageRef} className={className} {...props}>
      {children}
    </div>
  );
}

export function SettingsPagePaneLayout({
  children,
  className,
  icon,
  id,
  defaultCollapsed = false,
  ...props
}: {
  children: ReactNode;
  icon: ReactNode;
  id?: string;
  defaultCollapsed?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (!id) return defaultCollapsed;
    const saved = localStorage.getItem(`slimevr-settings-pane-${id}-collapsed`);
    return saved !== null ? saved === 'true' : defaultCollapsed;
  });

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (id) {
        localStorage.setItem(
          `slimevr-settings-pane-${id}-collapsed`,
          String(next)
        );
      }
      return next;
    });
  };

  // Unwrap fragment if needed
  let elements: ReactNode[] = [];
  if (isValidElement(children) && children.type === Fragment) {
    elements = Children.toArray((children.props as any).children);
  } else {
    elements = Children.toArray(children);
  }

  const titleElement = elements[0];
  const bodyElements = elements.slice(1);
  const hasBody = bodyElements.length > 0;

  return (
    <div
      id={id}
      className={classNames(
        'settings-pane flex w-full scroll-mt-12 flex-col rounded-[12px] border border-[var(--material-border-subtle)] bg-background-70 shadow-[inset_0_1px_0_0_rgba(250,249,245,0.04)] mobile:scroll-mt-20',
        className
      )}
      {...props}
    >
      {/* Thin header: stays the same height collapsed, the body grows below it. */}
      <div
        role={hasBody ? 'button' : undefined}
        tabIndex={hasBody ? 0 : undefined}
        aria-expanded={hasBody ? !isCollapsed : undefined}
        className={classNames(
          'flex min-h-[48px] w-full select-none items-center gap-3 px-4 py-2 rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20/60',
          hasBody && 'group cursor-pointer hover:bg-background-10/[0.03]'
        )}
        onClick={() => {
          if (hasBody) toggleCollapsed();
        }}
        onKeyDown={(e) => {
          if (hasBody && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            toggleCollapsed();
          }
        }}
      >
        <div className="settings-pane__icon flex h-5 w-5 shrink-0 items-center justify-center text-accent-background-10 fill-accent-background-10 [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </div>

        <div className="flex min-w-0 flex-1 items-center [&>*]:!font-sans [&>*]:!text-ui-md [&>*]:!font-medium [&>*]:!tracking-tight">
          {titleElement}
        </div>

        {hasBody && (
          <svg
            className={classNames(
              'h-4 w-4 shrink-0 text-background-30 transition-transform duration-300 ease-out group-hover:text-background-10',
              isCollapsed ? '-rotate-90' : 'rotate-0'
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </div>

      {/* Top-to-bottom collapsible body */}
      {hasBody && (
        <div
          className={classNames(
            'grid transition-all duration-300 ease-out category-pane-grid',
            isCollapsed
              ? 'grid-rows-[0fr] opacity-0 category-pane-grid-collapsed pointer-events-none'
              : 'grid-rows-[1fr] opacity-100 category-pane-grid-expanded'
          )}
        >
          <div className="overflow-hidden min-h-0">
            <div className="flex w-full min-w-0 flex-col border-t border-[var(--material-border-subtle)] px-4 pb-4 pt-3">
              {bodyElements}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
