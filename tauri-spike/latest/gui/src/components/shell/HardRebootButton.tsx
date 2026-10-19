import { useState } from 'react';
import classNames from 'classnames';
import { Tooltip } from '@/components/commons/Tooltip';

export function HardRebootButton() {
  const [rebooting, setRebooting] = useState(false);

  const handleReboot = () => {
    setRebooting(true);
    setTimeout(() => {
      window.location.reload();
    }, 150);
  };

  return (
    <Tooltip
      preferedDirection="bottom"
      spacing={6}
      content={
        <div className="flex flex-col text-left">
          <span className="text-ui-2xs font-semibold text-background-10">
            Hard Reboot App
          </span>
          <span className="text-ui-2xs text-background-30">
            Reloads GUI without terminal restart
          </span>
        </div>
      }
    >
      <button
        type="button"
        style={{ WebkitAppRegion: 'no-drag' } as any}
        className={classNames(
          'flex items-center justify-center w-7 h-7 rounded-[8px] text-background-30 hover:text-background-10 hover:bg-background-70 active:scale-90 transition-all cursor-pointer select-none',
          rebooting && 'text-accent-background-20'
        )}
        title="Hard Reboot GUI"
        onClick={handleReboot}
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
          className={classNames(
            'transition-transform duration-500',
            rebooting ? 'animate-spin' : 'hover:rotate-45'
          )}
        >
          {/* An app window with a reload arrow, so it isn't mistaken for the reset buttons' circular arrows. */}
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 8.5h18" />
          <path d="M15 14.5a3 3 0 1 1-.9-2.1" />
          <path d="M14.5 10.8v1.8h-1.8" />
        </svg>
      </button>
    </Tooltip>
  );
}
