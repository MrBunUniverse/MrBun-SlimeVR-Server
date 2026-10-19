import { useLocalization } from '@fluent/react';
import { useOnboarding } from '@/hooks/onboarding';
import { Button } from '@/components/commons/Button';
import { SlimeVRIcon } from '@/components/commons/icon/SimevrIcon';
import { PixelIcon } from '@/components/commons/PixelIcon';
import { PawEars } from '@/components/commons/PawEars';
import { isPawTheme, useConfig } from '@/hooks/config';
import { LangSelector } from '@/components/commons/LangSelector';
import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';

export function HomePage() {
  const nav = useNavigate();
  const { l10n } = useLocalization();
  const { applyProgress, onboardingStarted } = useOnboarding();
  const { config } = useConfig();
  const bun = isPawTheme(config?.theme);

  const fullTitle =
    l10n.getString('onboarding-home') || 'Welcome to SJ-SlimeVR';

  const [typedChars, setTypedChars] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [descVisible, setDescVisible] = useState(false);
  const [btnVisible, setBtnVisible] = useState(false);
  const [isSkipped, setIsSkipped] = useState(false);

  const cleanupRef = useRef<(() => void) | null>(null);

  const isAnimating = typedChars < fullTitle.length || !btnVisible;

  const skipAnimation = useCallback(() => {
    if (!isAnimating) return;
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    setIsSkipped(true);
    setTypedChars(fullTitle.length);
    setCursorVisible(false);
    setDescVisible(true);
    setBtnVisible(true);
  }, [fullTitle.length, isAnimating]);

  applyProgress(0.1);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (prefersReducedMotion) {
      setTypedChars(fullTitle.length);
      setCursorVisible(false);
      setDescVisible(true);
      setBtnVisible(true);
      return;
    }

    setTypedChars(0);
    setCursorVisible(true);
    setDescVisible(false);
    setBtnVisible(false);
    setIsSkipped(false);

    let charIdx = 0;
    let typingInterval: NodeJS.Timeout | null = null;
    const timeouts: NodeJS.Timeout[] = [];

    const cleanup = () => {
      if (typingInterval) clearInterval(typingInterval);
      timeouts.forEach(clearTimeout);
    };
    cleanupRef.current = cleanup;

    const startTimeout = setTimeout(() => {
      typingInterval = setInterval(() => {
        charIdx += 1;
        setTypedChars(charIdx);

        if (charIdx >= fullTitle.length) {
          if (typingInterval) clearInterval(typingInterval);

          // Typing done: fade in description immediately
          setDescVisible(true);

          // Button appears smoothly with staggered motion
          timeouts.push(
            setTimeout(() => {
              setBtnVisible(true);
            }, 240)
          );

          // Terminal cursor blinks for ~1.6s, then fades
          timeouts.push(
            setTimeout(() => {
              setCursorVisible(false);
            }, 1600)
          );
        }
      }, 40);
    }, 120);

    timeouts.push(startTimeout);

    return cleanup;
  }, [fullTitle]);

  const start = () => {
    onboardingStarted();
    nav('/onboarding/quiz/slime-set');
  };

  return (
    <div
      onClick={skipAnimation}
      className={classNames(
        'relative flex flex-col items-center justify-center h-full w-full px-6 text-center select-none overflow-hidden',
        isAnimating && 'cursor-pointer'
      )}
    >
      {/* Subtle Technical Gridlines Background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-25 animate-grid-drift"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(140, 130, 118, 0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(140, 130, 118, 0.12) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      {/* Hero Content Card */}
      <div className="relative z-10 flex flex-col items-center max-w-[560px] mx-auto p-8 sm:p-10 rounded-[24px] bg-background-70/70 dark:bg-background-10/[0.02] border border-background-50/50 dark:border-background-10/[0.08] backdrop-blur-xl shadow-xl">
        <div className="relative mb-4 animate-slime-breathe welcome-logo-trail flex items-center justify-center">
          <PawEars cell={64 / 36} on="logo" />
          {/* Bun: the stylised pixel logo, a little bigger than the vector one. */}
          {bun ? (
            <PixelIcon size={64} grid={36}>
              <SlimeVRIcon width={48} height={27} />
            </PixelIcon>
          ) : (
            <SlimeVRIcon />
          )}
        </div>

        <h1 className="font-serif text-ui-xl sm:text-ui-xl font-normal tracking-tight text-background-10 min-h-[44px] flex items-center justify-center">
          <span>{fullTitle.slice(0, typedChars)}</span>
          {cursorVisible && (
            <span
              className="inline-block w-[3px] sm:w-[3.5px] h-[0.78em] bg-accent-background-20 ml-1.5 align-middle animate-terminal-cursor select-none rounded-[0.5px]"
              aria-hidden="true"
            />
          )}
        </h1>

        <p
          className={classNames(
            'mt-2.5 text-ui-xs text-background-30 leading-relaxed max-w-[420px] ease-out',
            isSkipped
              ? 'transition-all duration-150'
              : 'transition-all duration-700',
            descVisible
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-2 pointer-events-none'
          )}
        >
          Configure your network, mount your trackers, and stream spatial motion
          data with real-time zero-drift compensation.
        </p>

        <div className="mt-8 flex items-center gap-3">
          <Button
            variant="primary"
            onClick={start}
            className={classNames(
              'px-6 py-2.5 rounded-full font-medium text-ui-xs shadow-sm active:scale-[0.98] ease-out',
              isSkipped
                ? 'transition-all duration-150'
                : 'transition-all duration-500',
              btnVisible
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-2.5 pointer-events-none'
            )}
          >
            {l10n.getString('onboarding-home-start')} →
          </Button>
        </div>
      </div>

      <div className="absolute right-4 bottom-4 z-50">
        <LangSelector />
      </div>
    </div>
  );
}
