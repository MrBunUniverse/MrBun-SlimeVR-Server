import classNames from 'classnames';
import { Control, Controller, FieldPath, FieldValues } from 'react-hook-form';

export function ThemeSelector<T extends FieldValues = FieldValues>({
  control,
  name,
  value,
  // input props
  disabled,
  colors,
  ...props
}: {
  control: Control<T>;
  name: FieldPath<T>;
  colors: string | undefined;
  value: string;
} & React.HTMLProps<HTMLInputElement>) {
  const themeLabel =
    {
      macos: 'Navy, blue-gray, amber',
      slime: 'Slime',
      'slime-green': 'Slime green',
      'slime-yellow': 'Slime yellow',
      'slime-orange': 'Slime orange',
      'slime-red': 'Slime red',
      dark: 'Dark',
      trans: 'Trans pride',
      asexual: 'Asexual pride',
      snep: 'Snep pride',
    }[String(value)] ?? String(value);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, ref, name, value: checked } }) => (
        <input
          type="radio"
          className={classNames(
            colors,
            'focus:ring-transparent focus:ring-offset-transparent',
            'focus:outline-transparent appearance-none border-4 border-solid',
            'border-transparent checked:!border-accent-background-30 w-16 h-16'
          )}
          style={{
            WebkitTextFillColor: 'transparent',
          }}
          name={name}
          ref={ref}
          onChange={onChange}
          value={value}
          checked={value == checked}
          disabled={disabled}
          aria-label={themeLabel}
          title={themeLabel}
          {...props}
        />
      )}
    />
  );
}
