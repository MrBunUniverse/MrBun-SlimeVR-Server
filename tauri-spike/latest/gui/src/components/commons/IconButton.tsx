import classNames from 'classnames';
import { ButtonHTMLAttributes, ReactNode, forwardRef } from 'react';

type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> & {
  /** Accessible name. Required: an icon alone is not a label. */
  label: string;
  children: ReactNode;
  /** Toggle state, for buttons that switch something on or off. */
  pressed?: boolean;
};

/** 32px icon button with a mandatory accessible name. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, children, pressed, className, type = 'button', ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        aria-pressed={pressed}
        {...props}
        className={classNames(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] cursor-pointer select-none',
          'text-background-30 hover:bg-background-10/[0.06] hover:text-background-10 active:bg-background-10/[0.1]',
          pressed && 'bg-background-10/[0.08] text-background-10',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        {children}
      </button>
    );
  }
);
