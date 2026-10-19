import { Typography } from './commons/Typography';
import classNames from 'classnames';
import { ResetType } from 'solarxr-protocol';
import {
  BODY_PARTS_GROUPS,
  MountingResetGroup,
  ResetBtnStatus,
  useReset,
  UseResetOptions,
} from '@/hooks/reset';
import { Tooltip } from './commons/Tooltip';
import { useAtomValue } from 'jotai';
import {
  assignedTrackersAtom,
  connectedIMUTrackersAtom,
  sidebarAnimationAtom,
} from '@/store/app-store';
import { useBreakpoint } from '@/hooks/breakpoint';
import { useMemo, useState, useEffect, CSSProperties } from 'react';
import { ResetButtonIcon } from './home/ResetButton';
import { useLocalization } from '@fluent/react';

function ButtonProgress({
  progress,
  status,
}: {
  progress: number;
  status: ResetBtnStatus;
}) {
  return (
    <div
      className={classNames(
        'absolute top-0 left-0 w-0 h-full bg-accent-background-20 opacity-50'
      )}
      style={{
        width: `${progress * 100}%`,
        transition:
          status === 'counting' ? 'width 0.3s ease-out' : 'width 1s linear',
      }}
    />
  );
}

export function BasicResetButton(
  options: UseResetOptions & {
    customName?: string;
    className?: string;
    style?: CSSProperties;
    animKey?: string | number;
    onTrigger?: () => void;
  }
) {
  // Labels show from lg up; below that the tooltip carries the name.
  const { isLg } = useBreakpoint('lg');
  const { l10n } = useLocalization();
  const {
    triggerReset,
    status,
    name: resetName,
    timer,
    progress: resetProress,
    disabled: resetDisabled,
    duration,
    error,
  } = useReset(options);
  const noTrackers = useAtomValue(connectedIMUTrackersAtom).length === 0;
  const disabled = resetDisabled || noTrackers;

  const progress = status === 'counting' ? resetProress / duration : 0;

  const name = options.customName || resetName;

  const skiReset =
    options.type === ResetType.Mounting && options.group === 'default';

  return (
    <Tooltip
      disabled={!error && !noTrackers && isLg}
      content={
        noTrackers ? (
          <Typography textAlign="text-center">
            Connect a tracker first
          </Typography>
        ) : error ? (
          <Typography
            id={error}
            textAlign="text-center"
            color="text-status-critical"
          />
        ) : (
          <Typography textAlign="text-center" id={name} />
        )
      }
      spacing={5}
      preferedDirection={error ? 'bottom' : 'top'}
    >
      <button
        key={
          options.animKey !== undefined ? `btn_${options.animKey}` : undefined
        }
        type="button"
        disabled={disabled}
        aria-label={l10n.getString(name)}
        className={classNames(
          'toolbar-reset-button relative overflow-clip h-9 px-2 rounded-[8px] flex items-center justify-center gap-1.5 font-medium text-ui-2xs transition-all duration-150 select-none will-change-transform lg:px-3.5',
          {
            // Active Button (Claude web aesthetic matching all reset actions)
            'cursor-pointer active:scale-[0.98] bg-background-60 hover:bg-background-70 text-background-10 fill-background-10 border border-[var(--material-border-subtle)]':
              !disabled,
            // Disabled state
            'cursor-not-allowed opacity-40 bg-[var(--material-tertiary)] text-background-30 fill-background-30 border border-transparent':
              disabled,
          },
          options.className
        )}
        style={{
          animationIterationCount: 1,
          ...options.style,
        }}
        onClick={() => {
          if (!disabled) {
            options.onTrigger?.();
            triggerReset();
          }
        }}
      >
        <div
          className={classNames('shrink-0', {
            'animate-spin-ccw': !skiReset && status === 'finished',
            'animate-skiing': skiReset && status === 'finished',
            'opacity-0': status === 'counting',
          })}
          style={{
            animationIterationCount: 1,
          }}
        >
          <ResetButtonIcon {...options} />
        </div>

        <div
          className={classNames('hidden lg:block relative', {
            'opacity-0': status === 'counting',
          })}
        >
          <Typography
            textAlign="text-center"
            className="text-ui-2xs font-medium tracking-tight whitespace-nowrap"
            id={name}
          />
        </div>

        <ButtonProgress progress={progress} status={status} />
        <div
          className={classNames(
            {
              'opacity-0': status !== 'counting',
              'animate-timer-tick': status === 'counting',
            },
            'absolute inset-0 flex items-center justify-center'
          )}
        >
          <Typography className="text-ui-2xs font-bold" textAlign="text-center">
            {timer}
          </Typography>
        </div>
      </button>
    </Tooltip>
  );
}

export function ResetActionsGroup() {
  const assignedTrackers = useAtomValue(assignedTrackersAtom);

  const { groupVisibility } = useMemo(() => {
    const groupVisibility = Object.keys(BODY_PARTS_GROUPS)
      .filter((k) => ['fingers'].includes(k))
      .reduce(
        (curr, key) => {
          const group = key as MountingResetGroup;
          curr[group] = assignedTrackers.some(
            ({ tracker }) =>
              tracker.info?.bodyPart &&
              BODY_PARTS_GROUPS[group].includes(tracker.info?.bodyPart)
          );

          return curr;
        },
        {} as Record<MountingResetGroup, boolean>
      );

    return {
      groupVisibility,
    };
  }, [assignedTrackers]);

  const sidebarAnim = useAtomValue(sidebarAnimationAtom);
  const [activeResetAnim, setActiveResetAnim] = useState<{
    id: string;
    key: number;
  } | null>(null);
  const [lastSidebarKey, setLastSidebarKey] = useState<number | null>(null);
  const [animMode, setAnimMode] = useState<'local' | 'sidebar'>('local');

  useEffect(() => {
    if (sidebarAnim && sidebarAnim.key !== lastSidebarKey) {
      setLastSidebarKey(sidebarAnim.key);
      setAnimMode('sidebar');
    }
  }, [sidebarAnim, lastSidebarKey]);

  const resetOrder = ['full', 'yaw', 'mounting-default', 'mounting-feet'];
  if (groupVisibility['fingers']) {
    resetOrder.push('mounting-fingers');
  }

  const handleTrigger = (id: string) => {
    setAnimMode('local');
    setActiveResetAnim((prev) => ({
      id,
      key: (prev?.key ?? 0) + 1,
    }));
  };

  const selectedIdx = activeResetAnim
    ? resetOrder.indexOf(activeResetAnim.id)
    : -1;

  const getAnimProps = (id: string) => {
    if (animMode === 'sidebar' && sidebarAnim) {
      // Distance from right edge (Table is 0, Card is 1, so reset buttons start at 2)
      const distFromRight = resetOrder.length - 1 - resetOrder.indexOf(id);
      const totalDist = 2 + distFromRight;
      const amp = Math.pow(0.55, totalDist);
      const delay = `${totalDist * 35}ms`;
      const className =
        sidebarAnim.direction === 'left'
          ? 'animate-preset-push-left'
          : 'animate-preset-push-right';
      const style = {
        '--push-amp': amp.toFixed(3),
        animationDelay: delay,
      } as CSSProperties;
      const animKey = `sidebar_${sidebarAnim.direction}_${sidebarAnim.key}_${totalDist}`;
      return { className, style, animKey };
    }

    const idx = resetOrder.indexOf(id);
    const isSelected = activeResetAnim?.id === id;
    const isOtherBouncing =
      activeResetAnim !== null && activeResetAnim.id !== id;
    const isLeftOfSelected = selectedIdx >= 0 && idx < selectedIdx;
    const isRightOfSelected = selectedIdx >= 0 && idx > selectedIdx;
    const distance = selectedIdx >= 0 ? Math.abs(idx - selectedIdx) : 0;
    const bounceAmp =
      distance > 0 ? Math.max(0.2, Math.pow(0.55, distance - 1)) : 1;
    const bounceDelay = `${Math.max(0, (distance - 1) * 35)}ms`;

    const className = isSelected
      ? 'animate-preset-pop'
      : isOtherBouncing && isLeftOfSelected
        ? 'animate-preset-push-left'
        : isOtherBouncing && isRightOfSelected
          ? 'animate-preset-push-right'
          : undefined;

    const style = isOtherBouncing
      ? ({
          '--push-amp': bounceAmp.toFixed(2),
          animationDelay: bounceDelay,
        } as CSSProperties)
      : undefined;

    const animKey = activeResetAnim
      ? `local_${activeResetAnim.id}_${activeResetAnim.key}`
      : undefined;

    return { className, style, animKey };
  };

  return (
    <div className="toolbar-reset-group flex flex-wrap items-center gap-2 select-none">
      <BasicResetButton
        type={ResetType.Full}
        {...getAnimProps('full')}
        onTrigger={() => handleTrigger('full')}
      />
      <BasicResetButton
        type={ResetType.Yaw}
        {...getAnimProps('yaw')}
        onTrigger={() => handleTrigger('yaw')}
      />
      <BasicResetButton
        type={ResetType.Mounting}
        group={'default'}
        customName="toolbar-mounting_calibration-default"
        {...getAnimProps('mounting-default')}
        onTrigger={() => handleTrigger('mounting-default')}
      />
      <BasicResetButton
        type={ResetType.Mounting}
        group={'feet'}
        customName="toolbar-mounting_calibration-feet"
        {...getAnimProps('mounting-feet')}
        onTrigger={() => handleTrigger('mounting-feet')}
      />
      {groupVisibility['fingers'] && (
        <BasicResetButton
          type={ResetType.Mounting}
          group={'fingers'}
          customName="toolbar-mounting_calibration-fingers"
          {...getAnimProps('mounting-fingers')}
          onTrigger={() => handleTrigger('mounting-fingers')}
        />
      )}
    </div>
  );
}

export function Toolbar() {
  return null;
}
