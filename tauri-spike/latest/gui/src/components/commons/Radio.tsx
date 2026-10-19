import classNames from 'classnames';
import { Control, Controller, FieldPath, FieldValues } from 'react-hook-form';
import { Typography } from './Typography';
import { ReactNode } from 'react';

export function Radio<T extends FieldValues = FieldValues>({
  control,
  name,
  label,
  value,
  description,
  children,
  // input props
  disabled,
  ...props
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  value: string;
  description?: string | null;
  children?: ReactNode;
} & React.HTMLProps<HTMLInputElement>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, ref, name, value: checked } }) => (
        <label
          className={classNames(
            'w-full p-3.5 rounded-[14px] flex gap-3 border transition-all duration-150',
            {
              'border-accent-background-20/80 bg-accent-background-50/10 dark:bg-background-10/[0.04] shadow-xs':
                value == checked,
              'border-background-50/60 dark:border-background-10/[0.06] bg-background-60/40 dark:bg-background-10/[0.02]':
                value != checked,
              'cursor-pointer hover:bg-background-60/70 dark:hover:bg-background-10/[0.05] active:scale-[0.99]':
                !disabled,
              'opacity-50 cursor-not-allowed': disabled,
            }
          )}
        >
          <input
            type="radio"
            className={classNames(
              'accent-accent-background-20 text-accent-background-10 focus:ring-transparent mt-0.5',
              'focus:ring-offset-transparent focus:outline-transparent'
            )}
            name={name}
            ref={ref}
            onChange={onChange}
            value={value}
            disabled={disabled}
            checked={value == checked}
            {...props}
          />
          <div className="flex flex-col gap-2 pointer-events-none">
            {children ? children : <Typography bold>{label}</Typography>}
            {description && (
              <Typography variant="standard">{description}</Typography>
            )}
          </div>
        </label>
      )}
    />
  );
}
