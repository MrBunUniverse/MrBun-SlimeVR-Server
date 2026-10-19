import { ReactNode } from 'react';
import { BulbIcon } from './icon/BulbIcon';
import { Typography } from './Typography';
import classNames from 'classnames';

export function TipBox({
  children,
  hideIcon = false,
  whitespace = false,
  className,
}: {
  children?: ReactNode;
  hideIcon?: boolean;
  whitespace?: boolean;
  className?: string;
}) {
  return (
    <div
      className={classNames(
        'tip-box flex flex-row gap-3 bg-accent-background-50/15 dark:bg-background-10/[0.03] border border-accent-background-30/20 dark:border-background-10/[0.08] p-3 rounded-[14px]',
        className
      )}
    >
      <div
        className={classNames(
          'fill-accent-background-20 text-accent-background-10 flex flex-col justify-center shrink-0',
          hideIcon && 'hidden'
        )}
      >
        <BulbIcon />
      </div>
      <div className="flex flex-col justify-center text-ui-2xs leading-relaxed text-background-10 flex-1 min-w-0">
        <Typography
          whitespace={whitespace ? 'whitespace-pre' : undefined}
          className="w-full"
        >
          {children}
        </Typography>
      </div>
    </div>
  );
}

/**
 * Will respect new lines and spacing given in text
 */
export function WarningBox({
  children,
  whitespace = true,
  hideIcon = false,
  className,
}: {
  children: ReactNode;
  whitespace?: boolean;
  hideIcon?: boolean;
  className?: string;
}) {
  return (
    <div
      className={classNames(
        'warning-box flex flex-row gap-3 bg-accent-background-20/8 dark:bg-accent-background-20/12 border border-accent-background-20/25 dark:border-accent-background-20/30 p-3.5 rounded-[12px] select-none',
        className
      )}
    >
      <div
        className={classNames(
          'text-accent-background-10 flex flex-col justify-center shrink-0',
          hideIcon && 'hidden'
        )}
      >
        <svg
          className="w-5 h-5 stroke-accent-background-20"
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <div className="flex flex-col justify-center text-ui-2xs text-background-10 leading-relaxed font-sans min-w-0 break-words">
        <Typography whitespace={whitespace ? 'whitespace-pre-wrap' : undefined}>
          {children}
        </Typography>
      </div>
    </div>
  );
}
