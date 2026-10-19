import classNames from 'classnames';
import React, { ReactNode } from 'react';

export function BigButton({
  icon,
  disabled,
  children,
  onClick,
  ...props
}: {
  disabled?: boolean;
  icon: ReactNode;
  children?: ReactNode;
} & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      {...props}
      type="button"
      className={classNames(
        'flex flex-col justify-center rounded-xl p-3.5 gap-1.5 cursor-pointer items-center transition-all duration-150',
        {
          'bg-background-60 hover:bg-background-60 cursor-not-allowed text-background-40 fill-background-40':
            disabled,
          'bg-background-60 hover:bg-background-50 text-standard-bold font-semibold tracking-tight fill-background-10 active:scale-[0.98]':
            !disabled,
        },
        props.className
      )}
    >
      <div className="flex justify-around">{icon}</div>
      <div className="flex text-default flex-grow items-center font-semibold tracking-tight">
        {children}
      </div>
    </button>
  );
}
