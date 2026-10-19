import classNames from 'classnames';
import { KeyboardEvent, ReactNode, useRef } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/**
 * Single-choice control (radio group semantics) with arrow-key navigation.
 * `iconOnly` hides the visible text but keeps it as the accessible name.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  iconOnly = false,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  ariaLabel: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = options.length - 1;
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={classNames(
        'inline-flex items-center gap-0.5 rounded-[10px] border border-[var(--material-border-subtle)] bg-background-10/[0.04] p-0.5',
        className
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => (refs.current[index] = el)}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={iconOnly ? option.label : undefined}
            title={iconOnly ? option.label : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={classNames(
              'inline-flex h-7 min-w-7 items-center justify-center gap-1.5 rounded-[8px] px-2 text-ui-xs font-medium cursor-pointer select-none',
              selected
                ? 'bg-background-60 text-background-10 shadow-xs'
                : 'text-background-30 hover:text-background-10'
            )}
          >
            {option.icon}
            {!iconOnly && <span>{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
