import { ReactNode } from 'react';

/** Section heading: small uppercase caption, with an optional right-aligned hint. */
export function SettingGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-ui-2xs font-semibold uppercase tracking-[0.08em] text-background-30">
          {title}
        </h3>
        {hint && (
          <span className="tnum text-ui-2xs text-background-40">{hint}</span>
        )}
      </div>
      <div className="flex flex-col divide-y divide-[var(--material-border-subtle)]">
        {children}
      </div>
    </section>
  );
}

/**
 * One setting: label (and optional description) on the left, control or value
 * on the right. Rows share a minimum height so a group keeps a steady rhythm.
 * `stacked` puts the control under the label row and shows `value` beside the
 * label, which suits sliders.
 */
export function SettingRow({
  label,
  description,
  value,
  children,
  stacked = false,
}: {
  label: string;
  description?: string;
  value?: ReactNode;
  children: ReactNode;
  stacked?: boolean;
}) {
  const text = (
    <div className="flex min-w-0 flex-col">
      <span className="text-ui-xs font-medium text-background-10">{label}</span>
      {description && (
        <span className="truncate text-ui-2xs text-background-30">
          {description}
        </span>
      )}
    </div>
  );

  if (stacked) {
    return (
      <div className="flex min-h-[48px] flex-col gap-0.5 py-2.5">
        <div className="flex items-baseline justify-between gap-4">
          {text}
          <span className="tnum text-ui-xs font-medium text-background-20">
            {value}
          </span>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-[48px] items-center justify-between gap-4 py-2.5">
      {text}
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
