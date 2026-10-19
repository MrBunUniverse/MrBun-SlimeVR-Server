import { useTrackingChecklist } from '@/hooks/tracking-checklist';
import { TrackingChecklist } from './tracking-checklist/TrackingChecklist';
import {
  PreviewContext,
  SkeletonVisualizerWidget,
} from './widgets/SkeletonVisualizerWidget';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { Typography } from './commons/Typography';
import { useLocaleConfig } from '@/i18n/config';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import {
  RpcMessage,
  SkeletonConfigRequestT,
  SkeletonConfigResponseT,
} from 'solarxr-protocol';
import { Tooltip } from './commons/Tooltip';
import { Vector3 } from 'three';
import { RecordIcon } from './commons/icon/RecordIcon';
import { PauseIcon } from './commons/icon/PauseIcon';
import { HumanIcon } from './commons/icon/HumanIcon';
import { EyeIcon } from './commons/icon/EyeIcon';
import { useConfig } from '@/hooks/config';
import { useBHV } from '@/hooks/bvh';
import { usePauseTracking } from '@/hooks/pause-tracking';
import { PlayIcon } from './commons/icon/PlayIcon';
import { Rotate360Icon } from './commons/icon/Rotate360Icon';
import { useLocalization } from '@fluent/react';

export function PreviewControls({
  open,
  isOrbiting = false,
  onToggleOrbit,
  isFraming = false,
  onToggleFrame,
}: {
  open: boolean;
  isOrbiting?: boolean;
  onToggleOrbit?: () => void;
  isFraming?: boolean;
  onToggleFrame?: () => void;
}) {
  const [userHeight, setUserHeight] = useState('');
  const { l10n } = useLocalization();
  const { currentLocales } = useLocaleConfig();
  const { useRPCPacket, sendRPCPacket } = useWebsocketAPI();

  const {
    state: bvhState,
    toggle: toggleBVH,
    available: bvhAvailable,
  } = useBHV();
  const { paused, toggle: toggleTracking } = usePauseTracking();

  const { cmFormat } = useMemo(() => {
    const cmFormat = Intl.NumberFormat(currentLocales, {
      style: 'unit',
      unit: 'centimeter',
      maximumFractionDigits: 1,
    });
    return { cmFormat };
  }, [currentLocales]);
  useRPCPacket(
    RpcMessage.SkeletonConfigResponse,
    (data: SkeletonConfigResponseT) => {
      if (data.userHeight)
        setUserHeight(cmFormat.format((data.userHeight * 100) / 0.936));
    }
  );

  useEffect(() => {
    sendRPCPacket(
      RpcMessage.SkeletonConfigRequest,
      new SkeletonConfigRequestT()
    );
  }, []);

  return (
    <>
      <Tooltip
        preferedDirection="bottom"
        content={
          <Typography id="onboarding-manual_proportions-estimated_height" />
        }
      >
        <div
          className={classNames(
            'h-10 bg-background-60 p-4 flex items-center rounded-lg justify-center cursor-help w-fit top-2 left-2 absolute',
            {
              'opacity-0': !open,
              'opacity-100': open,
            }
          )}
        >
          <Typography variant="section-title">
            {userHeight && (
              <span className="mr-1.5 font-sans font-normal text-background-30">
                Height
              </span>
            )}
            {userHeight}
          </Typography>
        </div>
      </Tooltip>
      <div className="absolute bottom-0 w-full px-2 pb-3 flex justify-center">
        <div className="flex max-w-full flex-wrap justify-center bg-background-80 bg-opacity-70 rounded-lg gap-1 px-2 py-1.5 items-center fill-background-10">
          {bvhAvailable && (
            <button
              type="button"
              aria-label={l10n.getString(
                bvhState === 'idle'
                  ? 'bvh-start_recording'
                  : 'bvh-stop_recording'
              )}
              aria-pressed={bvhState !== 'idle'}
              title={l10n.getString(
                bvhState === 'idle'
                  ? 'bvh-start_recording'
                  : 'bvh-stop_recording'
              )}
              className={classNames(
                'flex min-h-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-ui-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20',
                bvhState !== 'idle'
                  ? 'bg-status-critical/20 text-status-critical'
                  : 'hover:bg-background-60'
              )}
              onClick={() => toggleBVH()}
            >
              {bvhState === 'idle' && <RecordIcon width={16} />}
              {bvhState !== 'idle' && (
                <div className="h-4 w-4 rounded-full bg-status-critical animate-pulse" />
              )}
              <span>
                {l10n.getString(
                  bvhState === 'idle'
                    ? 'bvh-start_recording'
                    : 'bvh-stop_recording'
                )}
              </span>
            </button>
          )}
          <button
            type="button"
            aria-label={l10n.getString(
              paused ? 'tracking-paused' : 'tracking-unpaused'
            )}
            aria-pressed={paused}
            title={l10n.getString(
              paused ? 'tracking-paused' : 'tracking-unpaused'
            )}
            className={classNames(
              'flex min-h-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-ui-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20',
              paused
                ? 'bg-accent-background-20/20 text-accent-background-10'
                : 'bg-background-60 hover:bg-background-50'
            )}
            onClick={() => toggleTracking()}
          >
            {!paused && <PauseIcon width={16} />}
            {paused && <PlayIcon width={16} />}
            <span>
              {l10n.getString(paused ? 'tracking-paused' : 'tracking-unpaused')}
            </span>
          </button>
          {onToggleOrbit && (
            <button
              type="button"
              aria-label={l10n.getString(
                isOrbiting ? 'preview-auto_orbit_stop' : 'preview-auto_orbit'
              )}
              aria-pressed={isOrbiting}
              title={l10n.getString(
                isOrbiting ? 'preview-auto_orbit_stop' : 'preview-auto_orbit'
              )}
              className={classNames(
                'flex min-h-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-ui-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20',
                isOrbiting
                  ? 'bg-accent-background-20/20 text-accent-background-10'
                  : 'hover:bg-background-60 text-background-10'
              )}
              onClick={() => onToggleOrbit()}
            >
              <div
                className={classNames('flex items-center justify-center', {
                  'animate-[spin_4s_linear_infinite]': isOrbiting,
                })}
              >
                <Rotate360Icon width={16} />
              </div>
              <span>
                {l10n.getString(
                  isOrbiting ? 'preview-auto_orbit_stop' : 'preview-auto_orbit'
                )}
              </span>
            </button>
          )}
          {onToggleFrame && (
            <button
              type="button"
              aria-pressed={isFraming}
              title={
                isFraming
                  ? 'Auto-frame is on: the camera follows the whole body. Turn off to zoom by hand.'
                  : 'Auto-frame: keep the whole body in view'
              }
              className={classNames(
                'flex min-h-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-ui-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20',
                isFraming
                  ? 'bg-accent-background-20/20 text-accent-background-10'
                  : 'hover:bg-background-60 text-background-10'
              )}
              onClick={() => onToggleFrame()}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
                <circle cx="12" cy="9" r="1.6" />
                <path d="M12 11v4M9.5 13h5M12 15l-2 2.5M12 15l2 2.5" />
              </svg>
              <span>Auto-frame</span>
            </button>
          )}
          <button
            type="button"
            disabled
            aria-label={l10n.getString('preview-mocap_mode_soon')}
            title={l10n.getString('preview-mocap_mode_soon')}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-ui-2xs font-medium text-background-40 opacity-60 cursor-not-allowed"
          >
            <HumanIcon width={16} />
            <span>{l10n.getString('preview-mocap_mode_soon')}</span>
          </button>
        </div>
      </div>
    </>
  );
}

function PreviewSection({
  open,
  onResetPreviewWidth,
}: {
  open: boolean;
  onResetPreviewWidth?: () => void;
}) {
  const { l10n } = useLocalization();
  const { config, setConfig } = useConfig();
  const [renderDisabled, setRenderDisabled] = useState(
    !config?.skeletonPreview
  );
  const disabledRender = renderDisabled || !open;
  const [isOrbiting, setIsOrbiting] = useState(false);
  const [isFraming, setIsFraming] = useState(true);
  const previewContextRef = useRef<PreviewContext | null>(null);

  const toggleRender = () => {
    setConfig({ skeletonPreview: renderDisabled });
  };

  const handleToggleOrbit = () => {
    if (!previewContextRef.current) return;
    const newState = previewContextRef.current.toggleAutoOrbit();
    setIsOrbiting(newState);
  };

  const handleToggleFrame = () => {
    if (!previewContextRef.current) return;
    setIsFraming(previewContextRef.current.toggleAutoFrame());
  };

  useLayoutEffect(() => {
    // need useLayoutEffect to make sure that the state is corect before the first render of the skeleton
    setRenderDisabled(!config?.skeletonPreview);
  }, [config]);

  return (
    <div
      className={classNames(
        'transition-opacity duration-500 delay-500 h-full relative',
        {
          'opacity-0': !open,
          'opacity-100': open,
        }
      )}
    >
      <SkeletonVisualizerWidget
        disabled={disabledRender}
        toggleDisabled={() => toggleRender()}
        onInit={(context) => {
          previewContextRef.current = context;
          context.addView({
            left: 0,
            bottom: 0,
            width: 1,
            height: 1,
            position: new Vector3(3, 2.5, -3),
            onHeightChange(v, newHeight) {
              v.controls.target.set(0, newHeight / 2.2, 0.1);
              const scale = Math.max(1, newHeight) / 1.3;
              v.camera.zoom = 1 / scale;
            },
          });
        }}
      />
      <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
        <button
          type="button"
          aria-label={l10n.getString(
            renderDisabled ? 'preview-enable_render' : 'preview-disable_render'
          )}
          aria-pressed={!renderDisabled}
          title={l10n.getString(
            renderDisabled ? 'preview-enable_render' : 'preview-disable_render'
          )}
          className="flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full bg-background-60 fill-background-10 hover:bg-background-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20"
          onClick={() => toggleRender()}
        >
          <EyeIcon width={18} closed={!renderDisabled} />
        </button>
        {onResetPreviewWidth && (
          <button
            type="button"
            aria-label={l10n.getString('home-reset-preview-width')}
            title={l10n.getString('home-reset-preview-width')}
            className="flex min-h-9 min-w-9 items-center justify-center rounded-full bg-background-60 text-background-20 transition-colors hover:bg-background-50 hover:text-background-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20"
            onClick={onResetPreviewWidth}
          >
            {/* A width arrow: the circular arrow already means "reset" in the toolbar. */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 12h16M7.5 8.5 4 12l3.5 3.5M16.5 8.5 20 12l-3.5 3.5" />
            </svg>
          </button>
        )}
      </div>
      <PreviewControls
        open={open}
        isOrbiting={isOrbiting}
        onToggleOrbit={handleToggleOrbit}
        isFraming={isFraming}
        onToggleFrame={handleToggleFrame}
      />
    </div>
  );
}

type InspectorTab = 'preview' | 'checklist';

/**
 * Docked inspector for Home: a Preview tab (live skeleton) and a Checklist tab
 * (setup steps). Opens on the checklist while setup is incomplete.
 */
export function Sidebar({
  onResetPreviewWidth,
}: {
  onResetPreviewWidth?: () => void;
}) {
  const { l10n } = useLocalization();
  const { completion } = useTrackingChecklist();
  const [tab, setTab] = useState<InspectorTab>(
    completion === 'incomplete' ? 'checklist' : 'preview'
  );
  const tabRefs = useRef<Record<InspectorTab, HTMLButtonElement | null>>({
    preview: null,
    checklist: null,
  });
  const needsAttention =
    completion === 'incomplete' || completion === 'partial';

  // Follow the checklist state: jump to it when it breaks, back to the preview
  // when setup completes.
  useEffect(() => {
    if (completion === 'complete') setTab('preview');
    else if (completion === 'incomplete') setTab('checklist');
  }, [completion]);

  const tabs: { id: InspectorTab; label: string }[] = [
    {
      id: 'preview',
      label: l10n.getString('inspector-tab-preview', null, 'Preview'),
    },
    {
      id: 'checklist',
      label: l10n.getString('inspector-tab-checklist', null, 'Checklist'),
    },
  ];

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
            tabs.length;
    setTab(tabs[next].id);
    tabRefs.current[tabs[next].id]?.focus();
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      role="region"
      aria-label={l10n.getString(
        'inspector-label',
        null,
        'Skeleton preview and setup checklist'
      )}
    >
      <div
        role="tablist"
        aria-label={l10n.getString(
          'inspector-label',
          null,
          'Skeleton preview and setup checklist'
        )}
        className="flex shrink-0 gap-1 border-b border-[var(--material-border-subtle)] px-2 pt-2"
      >
        {tabs.map((item, index) => {
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              ref={(el) => (tabRefs.current[item.id] = el)}
              id={`inspector-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`inspector-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={classNames(
                '-mb-px flex h-9 items-center gap-2 rounded-t-[8px] border-b-2 px-3 text-ui-xs font-medium cursor-pointer select-none',
                selected
                  ? 'border-accent-background-20 text-background-10'
                  : 'border-transparent text-background-30 hover:text-background-10'
              )}
            >
              {item.label}
              {item.id === 'checklist' && needsAttention && (
                <span
                  className="h-2 w-2 rounded-full bg-status-warning"
                  role="img"
                  aria-label={l10n.getString(
                    'inspector-checklist-attention',
                    null,
                    'Needs attention'
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        id="inspector-panel-preview"
        role="tabpanel"
        aria-labelledby="inspector-tab-preview"
        hidden={tab !== 'preview'}
        className="min-h-0 flex-1"
      >
        {tab === 'preview' && (
          <PreviewSection open onResetPreviewWidth={onResetPreviewWidth} />
        )}
      </div>
      <div
        id="inspector-panel-checklist"
        role="tabpanel"
        aria-labelledby="inspector-tab-checklist"
        hidden={tab !== 'checklist'}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {tab === 'checklist' && (
          <TrackingChecklist
            closable={false}
            closed={false}
            closing={false}
            toggleClosed={() => undefined}
          />
        )}
      </div>
    </div>
  );
}
