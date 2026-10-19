import classNames from 'classnames';

export type StatusTone = 'ok' | 'warn' | 'critical' | 'idle';

const toneClass: Record<StatusTone, string> = {
  ok: 'bg-status-success',
  warn: 'bg-status-warning',
  critical: 'bg-status-critical',
  idle: 'bg-background-40',
};

/**
 * A status indicator. The text label is part of the component on purpose:
 * status must never be conveyed by colour alone.
 */
export function StatusDot({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-2 whitespace-nowrap',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={classNames(
          'h-2 w-2 shrink-0',
          toneClass[tone],
          tone === 'critical' ? 'rounded-[2px] rotate-45' : 'rounded-full'
        )}
      />
      <span>{label}</span>
    </span>
  );
}
