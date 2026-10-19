import { isPawTheme, useConfig } from '@/hooks/config';
import { Tooltip } from '@/components/commons/Tooltip';

export function ThemeModeToggle() {
  const { config, setConfig } = useConfig();
  // Special themes (Bun, Fox, Dog) have their own look. Night and light would drop them back to the default theme.
  if (isPawTheme(config?.theme)) return null;
  const isNight = config?.theme === 'dark';
  const label = isNight ? 'Switch to light mode' : 'Switch to night mode';

  return (
    <Tooltip
      preferedDirection="bottom"
      spacing={6}
      content={
        <span className="text-ui-2xs font-semibold text-background-10">
          {label}
        </span>
      }
    >
      <button
        type="button"
        role="switch"
        aria-checked={isNight}
        aria-label={label}
        style={{ WebkitAppRegion: 'no-drag' } as any}
        className="flex items-center justify-center w-7 h-7 rounded-[8px] text-background-30 hover:text-background-10 hover:bg-background-70 active:scale-90 transition-all cursor-pointer select-none"
        onClick={() => {
          const next = isNight ? 'claude' : 'dark';
          // Apply right away; screens outside AppLayout never re-run its effect.
          document.documentElement.dataset.theme = next;
          try {
            localStorage.setItem('slimevr-theme-hint', next);
          } catch {
            // ignore
          }
          void setConfig({ theme: next });
        }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {isNight ? (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </>
          ) : (
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          )}
        </svg>
      </button>
    </Tooltip>
  );
}
