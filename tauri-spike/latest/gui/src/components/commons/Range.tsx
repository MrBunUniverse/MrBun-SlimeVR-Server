import classNames from 'classnames';
import { Control, Controller, FieldPath, FieldValues } from 'react-hook-form';

export function Range<T extends FieldValues = FieldValues>({
  control,
  name,
  values,
  min,
  max,
  step,
  // input props
  ...props
}: {
  control: Control<T>;
  name: FieldPath<T>;
  max: number;
  min: number;
  step: number;
  values: { value: number; label: string; defaultValue?: boolean }[];
} & React.HTMLProps<HTMLInputElement>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, ref, name, value } }) => (
        <label className="text-ui-2xs font-medium w-full text-center flex items-center flex-col gap-1.5">
          <input
            type="range"
            className="w-[90%] accent-accent-background-20 cursor-pointer h-6 py-[9px] bg-clip-content bg-background-50/50 dark:bg-background-10/10 rounded-full appearance-none focus:outline-none"
            name={name}
            ref={ref}
            value={value}
            onChange={onChange}
            list={`${name}-datalist`}
            min={min}
            max={max}
            step={step}
            {...props}
          />
          <datalist id={`${name}-datalist`} className="">
            {values.map(({ value }, i) => (
              <option key={i}>{value}</option>
            ))}
          </datalist>
          <div className="w-full flex flex-nowrap overflow-clip text-ui-2xs tnum font-medium text-background-30">
            {Array((max - min) / step + 1)
              .fill(0)
              .map((_v, i) => {
                const value = values.find(
                  ({ value }) => i * step + min === value
                );
                return (
                  <span
                    key={i}
                    className={classNames(
                      'flex-1',
                      value?.defaultValue &&
                        'text-accent-background-10 font-semibold'
                    )}
                  >
                    {value?.label}
                  </span>
                );
              })}
          </div>
        </label>
      )}
    />
  );
}
