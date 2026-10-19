import classNames from 'classnames';
import { forwardRef, MouseEvent, useMemo, useState } from 'react';
import {
  Control,
  Controller,
  FieldError,
  FieldPath,
  FieldValues,
  UseControllerProps,
} from 'react-hook-form';
import { EyeIcon } from './icon/EyeIcon';
import { Typography } from './Typography';

interface InputProps {
  variant?: 'primary' | 'secondary' | 'tertiary';
  label?: string;
  name: string;
}

export const InputInside = forwardRef<
  HTMLInputElement,
  {
    variant?: 'primary' | 'secondary' | 'tertiary';
    label?: string;
    error?: FieldError;
    autocomplete?: boolean | string;
  } & Partial<React.HTMLProps<HTMLInputElement>>
>(function AppInput(
  {
    type,
    placeholder,
    label,
    disabled,
    autocomplete,
    name,
    onChange,
    value,
    error,
    variant = 'primary',
  },
  ref
) {
  const [forceText, setForceText] = useState(false);

  const togglePassword = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setForceText(!forceText);
  };

  const classes = useMemo(() => {
    const variantsMap = {
      primary: classNames({
        'placeholder:text-background-30 placeholder:not-italic placeholder:font-normal bg-background-60/50 backdrop-blur-md border border-background-50/60 dark:border-background-10/10':
          !disabled,
        'text-background-30 placeholder:text-background-30 border-background-50/30 bg-background-70/30 cursor-not-allowed':
          disabled,
      }),
      secondary: classNames({
        'placeholder:text-background-30 placeholder:not-italic placeholder:font-normal bg-background-50/50 backdrop-blur-md border border-background-50/60 dark:border-background-10/10':
          !disabled,
        'text-background-40 placeholder:text-background-40 border-background-50/30 bg-background-70/30 cursor-not-allowed':
          disabled,
      }),
      tertiary: classNames({
        'placeholder:text-background-30 placeholder:not-italic placeholder:font-normal bg-background-40/50 backdrop-blur-md border border-background-50/60 dark:border-background-10/10':
          !disabled,
        'text-background-30 placeholder:text-background-30 border-background-50/30 bg-background-70/30 cursor-not-allowed':
          disabled,
      }),
    };

    return classNames(
      variantsMap[variant],
      'w-full min-h-[40px] z-10 rounded-[12px] px-3.5 py-2',
      'focus:outline-none focus:border-accent-background-20 focus:ring-2 focus:ring-accent-background-30/25 focus-visible:outline-none',
      'text-ui-xs text-background-10 relative transition-all duration-150 shadow-2xs',
      error &&
        'border-status-critical focus:border-status-critical focus:ring-status-critical/30'
    );
  }, [variant, disabled, error]);

  const computedValue = disabled
    ? placeholder
    : value !== undefined
      ? value
      : '';

  return (
    <label className="flex flex-col gap-1">
      {label && <Typography>{label}</Typography>}
      <div className="relative w-full">
        <input
          type={forceText ? 'text' : type}
          className={classNames(classes, {
            'pr-10 sentry-mask': type === 'password',
          })}
          placeholder={placeholder || undefined}
          autoComplete={autocomplete ? 'off' : 'on'}
          onChange={onChange}
          name={name}
          value={computedValue} // Do we want that behaviour ?
          disabled={disabled}
          ref={ref}
        />
        {type === 'password' && (
          <div
            className="fill-background-10 absolute inset-y-0 right-0 pr-6 z-10 my-auto w-[16px] h-[16px] cursor-pointer"
            onClick={togglePassword}
          >
            <EyeIcon width={16} closed={forceText} />
          </div>
        )}
        {error?.message && (
          <div className="absolute top-[38px] z-0 pt-1.5 bg-background-70 px-1 w-full rounded-b-md text-status-critical">
            {error.message}
          </div>
        )}
      </div>
    </label>
  );
});

export const Input = <T extends FieldValues = FieldValues>({
  type = 'text',
  control,
  name,
  placeholder,
  label,
  autocomplete = false,
  disabled,
  variant = 'primary',
  rules,
}: {
  rules?: UseControllerProps<T, FieldPath<T>>['rules'];
  control: Control<T>;
  name: FieldPath<T>;
  autocomplete?: boolean | string;
} & Omit<InputProps, 'name'> &
  Partial<React.HTMLProps<HTMLInputElement>>) => {
  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({
        field: { onChange, value, ref, name },
        fieldState: { error },
      }) => (
        <InputInside
          type={type}
          autocomplete={autocomplete}
          label={label}
          placeholder={placeholder}
          variant={variant}
          value={value}
          disabled={disabled}
          error={error}
          onChange={onChange}
          ref={ref}
          name={name}
        />
      )}
    />
  );
};
