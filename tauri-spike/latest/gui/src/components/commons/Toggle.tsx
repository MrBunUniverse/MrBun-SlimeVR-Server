import classNames from 'classnames';

/** Switch for an on/off setting. Uses the app accent, not status green. */
export function Toggle({
  checked,
  onChange,
  label,
  title,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={classNames(
        'relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full p-[2px] transition-colors duration-200 before:absolute before:-inset-[5px] before:content-[""] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20/70 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-accent-background-20' : 'bg-background-10/[0.14]'
      )}
    >
      <span
        className={classNames(
          'h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
          checked ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  );
}
