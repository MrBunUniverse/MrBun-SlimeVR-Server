import { useEffect, useState } from 'react';
import classNames from 'classnames';
import { Tooltip } from '@/components/commons/Tooltip';

type State = 'idle' | 'confirm' | 'restarting' | 'error';

/** Spike only: stops the server and starts it again. Needs a second click, so a stray click doesn't drop tracking. */
export function ServerRestartButton() {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');
  const restart = window.electronAPI?.restartServer;

  // The confirm and result states fall back to idle by themselves.
  useEffect(() => {
    if (state === 'idle') return;
    const id = setTimeout(() => setState('idle'), state === 'confirm' ? 3000 : 6000);
    return () => clearTimeout(id);
  }, [state]);

  if (!restart) return null;

  const onClick = async () => {
    if (state === 'restarting') return;
    if (state !== 'confirm') {
      setState('confirm');
      return;
    }
    setState('restarting');
    try {
      await restart();
    } catch (e) {
      setError(String(e));
      setState('error');
    }
  };

  const tip =
    state === 'confirm'
      ? 'Click again to restart the server'
      : state === 'restarting'
        ? 'Restarting… trackers reconnect in a few seconds'
        : state === 'error'
          ? error
          : 'Quits and reopens the SlimeVR server';

  return (
    <Tooltip
      preferedDirection="bottom"
      spacing={6}
      content={
        <div className="flex flex-col text-left">
          <span className="text-ui-2xs font-semibold text-background-10">
            Restart Server
          </span>
          <span className="text-ui-2xs text-background-30">{tip}</span>
        </div>
      }
    >
      <button
        type="button"
        style={{ WebkitAppRegion: 'no-drag' } as any}
        className={classNames(
          'flex items-center justify-center h-7 rounded-[8px] border font-mono text-ui-2xs active:scale-90 transition-all cursor-pointer select-none',
          state === 'confirm' ? 'px-2 gap-1' : 'w-7',
          state === 'confirm' || state === 'error'
            ? 'bg-status-critical text-white border-status-critical'
            : 'bg-status-critical/10 text-status-critical border-status-critical/40 hover:bg-status-critical/20'
        )}
        title="Restart Server"
        aria-label="Restart server"
        onClick={onClick}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={classNames(state === 'restarting' && 'animate-spin')}
        >
          <path d="M12 2v10" />
          <path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
        </svg>
        {state === 'confirm' && <span>Restart?</span>}
      </button>
    </Tooltip>
  );
}
