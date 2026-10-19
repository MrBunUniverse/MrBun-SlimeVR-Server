import { useConfig } from '@/hooks/config';
import { Localized, LocalizedProps } from '@fluent/react';
import classNames from 'classnames';
import { createElement, ReactNode, useMemo } from 'react';

export function Typography({
  variant = 'standard',
  bold = false,
  color = 'primary',
  whitespace = 'whitespace-normal',
  children,
  italic = false,
  truncate = false,
  textAlign,
  sentryMask = false,
  className,
  id,
  attrs,
  elems,
  vars,
}: {
  variant?:
    | 'main-title'
    | 'section-title'
    | 'standard'
    | 'vr-accessible'
    | 'mobile-title';
  bold?: boolean;
  italic?: boolean;
  truncate?: boolean;
  block?: boolean;
  color?: 'primary' | 'secondary' | string;
  whitespace?:
    | 'whitespace-normal'
    | 'whitespace-nowrap'
    | 'whitespace-pre'
    | 'whitespace-pre-line'
    | 'whitespace-pre-wrap';
  textAlign?:
    | 'text-left'
    | 'text-center'
    | 'text-right'
    | 'text-justify'
    | 'text-start'
    | 'text-end';
  className?: string;
  children?: ReactNode;
  sentryMask?: boolean;
  id?: string;
} & Omit<LocalizedProps, 'id'>) {
  const tag = useMemo(() => {
    const tags = {
      'main-title': 'h1',
      'section-title': 'h2',
      'mobile-title': 'h1',
      standard: 'p',
      'vr-accessible': 'p',
    };
    return tags[variant];
  }, [variant]);
  const { config } = useConfig();

  const element = createElement(
    tag,
    {
      className: classNames([
        'transition-colors',
        variant === 'mobile-title' &&
          'xs:text-main-title mobile:text-section-title font-serif font-normal tracking-tight',
        variant === 'main-title' &&
          'text-main-title font-serif font-normal tracking-tight',
        variant === 'section-title' &&
          'text-section-title font-serif font-medium tracking-tight',
        variant === 'standard' &&
          (bold
            ? 'text-standard-bold font-sans font-semibold tracking-tight'
            : 'text-standard font-sans font-normal leading-relaxed'),
        variant === 'vr-accessible' &&
          (bold
            ? 'text-vr-accesible-bold font-sans font-semibold tracking-tight'
            : 'text-vr-accesible font-sans font-normal'),
        color === 'primary' && 'text-background-10',
        color === 'secondary' &&
          'text-background-30 font-sans font-normal leading-relaxed',
        typeof color === 'string' && color,
        whitespace,
        textAlign,
        italic && 'italic',
        truncate && 'leading-[1.2rem] text-ellipsis',
        truncate && (config?.textSize ?? 12) > 12 && 'line-clamp-1',
        truncate && (config?.textSize ?? 12) <= 12 && 'line-clamp-2',
        sentryMask && 'sentry-mask',
        className,
      ]),
    },
    children || id || []
  );

  if (id) {
    return (
      <Localized id={id} attrs={attrs} elems={elems} vars={vars}>
        {element}
      </Localized>
    );
  }

  return element;
}
