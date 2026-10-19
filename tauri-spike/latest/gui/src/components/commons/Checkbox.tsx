import classNames from 'classnames';
import { forwardRef, useMemo } from 'react';
import { Control, Controller, FieldPath, FieldValues } from 'react-hook-form';

export const CHECKBOX_CLASSES = classNames(
  'bg-background-60/80 border border-background-50/60 dark:border-background-10/10 cursor-pointer rounded-[6px] w-4.5 h-4.5 text-accent-background-20 focus:border-accent-background-30 focus:ring-2 focus:ring-accent-background-30/30 focus-visible:outline-none transition-all'
);

export const CheckboxInternal = forwardRef<
  HTMLInputElement,
  {
    disabled?: boolean;
    variant?: 'checkbox' | 'toggle';
    color?: 'primary' | 'secondary' | 'tertiary';
    label?: string;
    outlined?: boolean;
    loading?: boolean;
    name: string;
  } & Partial<React.HTMLProps<HTMLInputElement>>
>(function AppCheckbox(
  {
    variant = 'checkbox',
    outlined = false,
    loading = false,
    disabled = false,
    label,
    onChange,
    checked,
    name,
  },
  ref
) {
  const classes = useMemo(() => {
    const vriantsMap = {
      checkbox: {
        checkbox: classNames(CHECKBOX_CLASSES, {
          'brightness-50 hover:cursor-not-allowed': disabled,
        }),
        toggle: '',
        pin: '',
      },
      toggle: {
        checkbox: 'peer sr-only',
        toggle: classNames(
          'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-background-20/70'
        ),
        pin: classNames(
          'absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-all duration-200'
        ),
      },
    };
    return vriantsMap[variant];
  }, [variant, disabled]);

  const isToggle = variant === 'toggle';

  return (
    <div
      className={classNames(
        {
          'text-background-40': disabled,
          'text-background-10': !disabled,
          'border-b border-[var(--material-border-subtle)]': outlined,
        },
        'flex w-full items-center gap-2'
      )}
    >
      <label
        className={classNames(
          'flex w-full items-center gap-3 font-medium text-ui-xs',
          isToggle ? 'min-h-[44px] justify-between py-2' : 'h-[40px]',
          {
            'cursor-pointer': !disabled && !loading,
            'cursor-default': disabled || loading,
            'opacity-50': isToggle && disabled,
          }
        )}
      >
        {isToggle && <span className="min-w-0 flex-1">{label}</span>}
        <input
          ref={ref}
          onChange={onChange}
          checked={checked}
          name={name}
          className={classes.checkbox}
          type="checkbox"
          disabled={disabled || loading}
        />
        {isToggle && (
          <div
            aria-hidden="true"
            className={classNames(classes.toggle, {
              'bg-accent-background-20': checked && !loading,
              'bg-accent-background-20 animate-pulse': loading && !disabled,
              'bg-background-10/[0.14]': !checked && !loading,
            })}
          >
            <div
              className={classNames(classes.pin, {
                'left-[2px]': !checked && !loading,
                'opacity-0': loading,
                'left-[18px]': checked && !loading,
              })}
            />
          </div>
        )}
        {!isToggle && label}
      </label>
    </div>
  );
});

export function CheckBox<T extends FieldValues = FieldValues>({
  label,
  variant = 'checkbox',
  color = 'primary',
  control,
  outlined,
  name,
  loading,
  disabled,
}: {
  label: string;
  control: Control<T>;
  name: FieldPath<T>;
  variant?: 'checkbox' | 'toggle';
  color?: 'primary' | 'secondary' | 'tertiary';
  outlined?: boolean;
  loading?: boolean;
} & React.HTMLProps<HTMLInputElement>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value, ref, name } }) => (
        <CheckboxInternal
          label={label}
          variant={variant}
          color={color}
          outlined={outlined}
          name={name}
          loading={loading}
          disabled={disabled}
          checked={value}
          onChange={onChange}
          ref={ref}
        />
      )}
    />
  );
}
