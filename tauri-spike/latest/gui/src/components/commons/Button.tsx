import classNames from 'classnames';
import React, { ReactNode, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { LoaderIcon, SlimeState } from './icon/LoaderIcon';
import { Localized, LocalizedProps } from '@fluent/react';

function ButtonContent({
  loading,
  icon,
  children,
}: {
  loading: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div
        className={classNames(
          { 'opacity-0': loading },
          'flex flex-row gap-2 justify-center items-center'
        )}
      >
        {icon && (
          <div className="flex justify-center items-center fill-background-10 w-5">
            {icon}
          </div>
        )}
        {children}
      </div>
      {loading && (
        <div className="absolute top-0 left-0 w-full h-full flex justify-center items-center fill-background-10">
          <LoaderIcon slimeState={SlimeState.JUMPY} />
        </div>
      )}
    </>
  );
}

export type ButtonProps = {
  children?: ReactNode;
  icon?: ReactNode;
  variant: 'primary' | 'secondary' | 'tertiary' | 'quaternary';
  to?: string;
  loading?: boolean;
  rounded?: boolean;
  state?: any;
  id?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement> &
  Omit<LocalizedProps, 'id'>;

export function Button({
  children,
  variant,
  disabled,
  to,
  loading = false,
  state = {},
  icon,
  rounded = false,
  attrs,
  id,
  vars,
  elems,
  ...props
}: ButtonProps) {
  const classes = useMemo(() => {
    const variantsMap = {
      primary: classNames({
        'app-button-primary bg-accent-background-20 hover:bg-accent-background-40 text-white font-medium tracking-tight active:scale-[0.98] shadow-xs transition-all duration-150':
          !disabled,
        // Disabled reads as disabled: a flat neutral fill and muted text, not a faded accent.
        'bg-background-10/[0.06] hover:bg-background-10/[0.06] cursor-not-allowed text-background-30 border border-background-10/[0.08]':
          disabled,
      }),
      secondary: classNames({
        'app-button-secondary bg-background-60/60 hover:bg-background-60/90 text-background-10 border border-background-50/50 dark:border-background-10/[0.08] font-medium tracking-tight active:scale-[0.98] shadow-xs transition-all duration-150':
          !disabled,
        'bg-background-60/20 hover:bg-background-60/20 cursor-not-allowed text-background-40 border border-background-50/20':
          disabled,
      }),
      tertiary: classNames({
        'app-button-tertiary bg-background-50/50 hover:bg-background-50/80 text-background-10 font-medium tracking-tight active:scale-[0.98] border border-background-50/40 dark:border-background-10/[0.04] transition-all duration-150':
          !disabled,
        'bg-background-50/20 hover:bg-background-50/20 cursor-not-allowed text-background-40':
          disabled,
      }),
      quaternary: classNames({
        'hover:bg-background-60/50 font-medium tracking-tight text-background-20 hover:text-background-10 active:scale-[0.98] transition-all duration-150':
          !disabled,
        'cursor-not-allowed text-background-40': disabled,
      }),
    };
    return classNames(
      variantsMap[variant],
      'font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-30/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background-80 focus:outline-none text-center relative flex items-center justify-center text-ui-2xs font-medium tracking-normal whitespace-nowrap leading-none select-none',
      {
        'rounded-full p-2 text-center min-h-[34px] min-w-[34px] active:scale-[0.96]':
          rounded,
        'rounded-full px-5 sm:px-6 py-2.5 min-h-[36px]': !rounded,
      },
      props.className
    );
  }, [variant, disabled, rounded, props.className]);

  const content = to ? (
    <NavLink
      to={to}
      className={classes}
      state={state}
      onClick={(ev) => {
        if (disabled) {
          ev.preventDefault();
          return;
        }
        if (props.onClick) return props.onClick(ev as any);
      }}
    >
      <ButtonContent icon={icon} loading={loading}>
        {id && (
          <Localized attrs={attrs} vars={vars} elems={elems} id={id}>
            {children}
          </Localized>
        )}
        {!id && children}
      </ButtonContent>
    </NavLink>
  ) : (
    <button type="button" {...props} className={classes} disabled={disabled}>
      <ButtonContent icon={icon} loading={loading}>
        {id && (
          <Localized attrs={attrs} vars={vars} elems={elems} id={id}>
            {children}
          </Localized>
        )}
        {!id && children}
      </ButtonContent>
    </button>
  );

  return content;
}
