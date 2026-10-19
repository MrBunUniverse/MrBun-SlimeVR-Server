import { useOnboarding } from '@/hooks/onboarding';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { USBIcon } from '@/components/commons/icon/UsbIcon';
import { useNavigate } from 'react-router-dom';
import { useLocalization } from '@fluent/react';

export function QuizButton({
  name,
  active,
  icon,
  onClick,
}: {
  active?: boolean;
  name: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  const { l10n } = useLocalization();

  return (
    <div
      onClick={onClick}
      className={classNames(
        'group relative flex flex-col items-center justify-between p-4 sm:p-5 rounded-[20px] transition-all duration-200 cursor-pointer select-none text-center',
        'border',
        active
          ? 'bg-accent-background-20/20 border-accent-background-20 shadow-md shadow-accent-background-20/10'
          : 'bg-background-60/40 dark:bg-background-10/[0.03] border-background-50/50 dark:border-background-10/[0.06] hover:border-background-40 dark:hover:border-background-10/[0.15] hover:bg-background-60/60 dark:hover:bg-background-10/[0.05]'
      )}
    >
      <div className="w-full flex items-center justify-center flex-1 py-2">
        {icon}
      </div>

      <div className="mt-3 flex items-center justify-center min-h-[36px]">
        <span
          className={classNames(
            'text-ui-xs sm:text-ui-xs font-medium leading-snug tracking-tight transition-colors',
            active
              ? 'text-background-10 font-semibold'
              : 'text-background-20 group-hover:text-background-10'
          )}
        >
          {l10n.getString(name)}
        </span>
      </div>
    </div>
  );
}

export function QuizSlimeSetQuestion() {
  const { applyProgress, setSlimeSet, slimeSet } = useOnboarding();
  const nav = useNavigate();
  const { l10n } = useLocalization();

  const fullTitle =
    l10n.getString('onboarding-quiz-slimeset-title') ||
    'What type of trackers are you connecting?';
  const subtitle =
    l10n.getString('onboarding-quiz-slimeset-description') ||
    'If you have multiple sets, you will be asked again later in the process';

  const [typedChars, setTypedChars] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [descVisible, setDescVisible] = useState(false);
  const [section1Visible, setSection1Visible] = useState(false);
  const [section2Visible, setSection2Visible] = useState(false);
  const [isSkipped, setIsSkipped] = useState(false);

  const cleanupRef = useRef<(() => void) | null>(null);

  const isAnimating =
    typedChars < fullTitle.length || !section1Visible || !section2Visible;

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
    setSection1Visible(true);
    setSection2Visible(true);
  }, [fullTitle.length, isAnimating]);

  applyProgress(0.2);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (prefersReducedMotion) {
      setTypedChars(fullTitle.length);
      setCursorVisible(false);
      setDescVisible(true);
      setSection1Visible(true);
      setSection2Visible(true);
      return;
    }

    setTypedChars(0);
    setCursorVisible(true);
    setDescVisible(false);
    setSection1Visible(false);
    setSection2Visible(false);
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

          // Subtitle fades in
          setDescVisible(true);

          // Official trackers pop in
          timeouts.push(
            setTimeout(() => {
              setSection1Visible(true);
            }, 180)
          );

          // DIY/Third-party trackers pop in with staggered delay
          timeouts.push(
            setTimeout(() => {
              setSection2Visible(true);
            }, 360)
          );

          // Terminal cursor blinks for ~1.6s, then fades
          timeouts.push(
            setTimeout(() => {
              setCursorVisible(false);
            }, 1600)
          );
        }
      }, 35);
    }, 120);

    timeouts.push(startTimeout);

    return cleanup;
  }, [fullTitle]);

  const next = (type: typeof slimeSet) => {
    setSlimeSet(type);
    switch (type) {
      case 'butterfly':
      case 'dongle-slime':
        nav('/onboarding/dongle');
        break;
      case 'slime-v1':
      case 'wifi-slime':
        nav('/onboarding/wifi-creds');
        break;
    }
  };

  return (
    <div
      onClick={skipAnimation}
      className={classNames(
        'relative flex flex-col items-center justify-center min-h-full w-full px-4 sm:px-6 py-6 sm:py-8 select-none overflow-hidden',
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

      {/* Main Elevated Glass Card */}
      <div className="relative z-10 flex flex-col max-w-[680px] w-full mx-auto p-6 sm:p-8 rounded-[28px] bg-background-70/70 dark:bg-background-10/[0.02] border border-background-50/50 dark:border-background-10/[0.08] backdrop-blur-xl shadow-xl">
        {/* Header with Terminal-style Title & Subtitle */}
        <div className="flex flex-col items-center text-center">
          <h1 className="font-serif text-ui-lg sm:text-ui-xl font-normal tracking-tight text-background-10 min-h-[40px] flex items-center justify-center text-center">
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
              'mt-2 text-ui-xs text-background-30 leading-relaxed max-w-[500px] ease-out',
              isSkipped
                ? 'transition-all duration-150'
                : 'transition-all duration-700',
              descVisible
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-2 pointer-events-none'
            )}
          >
            {subtitle}
          </p>
        </div>

        {/* Options Grid */}
        <div className="flex flex-col gap-6 mt-6">
          {/* Section 1: Official SlimeVR Trackers */}
          <div
            className={classNames(
              'flex flex-col gap-2.5 ease-out',
              isSkipped
                ? 'transition-all duration-150'
                : 'transition-all duration-500',
              section1Visible
                ? 'opacity-100 translate-y-0 scale-100'
                : 'opacity-0 translate-y-3 scale-[0.98] pointer-events-none'
            )}
          >
            <span className="text-ui-2xs font-semibold uppercase tracking-wider text-background-30 pl-1">
              {l10n.getString('onboarding-quiz-slimeset-official-sets')}
            </span>
            <div className="grid grid-cols-2 gap-4">
              <QuizButton
                active={slimeSet === 'slime-v1'}
                onClick={() => next('slime-v1')}
                icon={
                  <div className="h-28 sm:h-32 w-full flex items-center justify-center p-1.5">
                    <img
                      src="/images/trackers/v1_2_slime.webp"
                      alt="SlimeVR V1.0 & V1.2"
                      className="h-full w-full max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                }
                name="onboarding-quiz-slimeset-answer-regular"
              />
              <QuizButton
                active={slimeSet === 'butterfly'}
                onClick={() => next('butterfly')}
                icon={
                  <div className="h-28 sm:h-32 w-full flex items-center justify-center p-1.5">
                    <img
                      src="/images/trackers/butterfly_slime.webp"
                      alt="Butterfly"
                      className="h-full w-full max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                }
                name="onboarding-quiz-slimeset-answer-butterfly"
              />
            </div>
          </div>

          {/* Section 2: Third-party or DIY Trackers */}
          <div
            className={classNames(
              'flex flex-col gap-2.5 ease-out',
              isSkipped
                ? 'transition-all duration-150'
                : 'transition-all duration-500',
              section2Visible
                ? 'opacity-100 translate-y-0 scale-100'
                : 'opacity-0 translate-y-3 scale-[0.98] pointer-events-none'
            )}
          >
            <span className="text-ui-2xs font-semibold uppercase tracking-wider text-background-30 pl-1">
              {l10n.getString('onboarding-quiz-slimeset-thirdparty-sets')}
            </span>
            <div className="grid grid-cols-2 gap-4">
              <QuizButton
                active={slimeSet === 'wifi-slime'}
                onClick={() => next('wifi-slime')}
                icon={
                  <div className="h-28 sm:h-32 flex items-center justify-center">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-[14px] bg-background-60/60 dark:bg-background-10/[0.04] border border-background-50/50 dark:border-background-10/[0.06] flex items-center justify-center transition-all duration-300 group-hover:scale-105 group-hover:border-accent-background-20/40">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        height="32"
                        viewBox="0 0 24 24"
                        width="32"
                        className="fill-background-20 transition-colors duration-300 group-hover:fill-background-10"
                      >
                        <path d="M0 0h24v24H0z" fill="none" />
                        <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" />
                      </svg>
                    </div>
                  </div>
                }
                name="onboarding-quiz-slimeset-answer-wifi"
              />
              <QuizButton
                active={slimeSet === 'dongle-slime'}
                onClick={() => next('dongle-slime')}
                icon={
                  <div className="h-28 sm:h-32 flex items-center justify-center">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-[14px] bg-background-60/60 dark:bg-background-10/[0.04] border border-background-50/50 dark:border-background-10/[0.06] flex items-center justify-center transition-all duration-300 group-hover:scale-105 group-hover:border-accent-background-20/40">
                      <div className="fill-background-20 transition-colors duration-300 group-hover:fill-background-10">
                        <USBIcon size={32} />
                      </div>
                    </div>
                  </div>
                }
                name="onboarding-quiz-slimeset-answer-dongle"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
