import { useLocalization } from '@fluent/react';
import classNames from 'classnames';
import { useAtomValue } from 'jotai';
import { useEffect, useId, useRef, useState } from 'react';
import {
  RpcMessage,
  ServerInfosRequestT,
  ServerInfosResponseT,
} from 'solarxr-protocol';
import { IconButton } from '@/components/commons/IconButton';
import { StatusDot, StatusTone } from '@/components/commons/StatusDot';
import { useOperatingMode } from '@/hooks/operating-mode';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { connectedIMUCountAtom } from '@/store/app-store';
import { QuestTargetIPPill } from './QuestTargetIPPill';
import { RefreshTrackersButton } from './RefreshTrackersButton';

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

/**
 * One place for "is my setup working?": server, mode and trackers at a glance,
 * with the connection details (addresses, standalone switch, scan) in a popover.
 */
export function StatusCluster() {
  const { l10n } = useLocalization();
  const { isConnected, sendRPCPacket, useRPCPacket } = useWebsocketAPI();
  const { isQuestStandalone, toggleMode } = useOperatingMode();
  const trackerCount = useAtomValue(connectedIMUCountAtom);
  const [open, setOpen] = useState(false);
  const [localIp, setLocalIp] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    sendRPCPacket(RpcMessage.ServerInfosRequest, new ServerInfosRequestT());
  }, []);

  useRPCPacket(
    RpcMessage.ServerInfosResponse,
    ({ localIp }: ServerInfosResponseT) => {
      if (localIp) setLocalIp(localIp.toString());
    }
  );

  // Close on outside click or Escape (returning focus to the trigger).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const serverTone: StatusTone = isConnected ? 'ok' : 'critical';
  const serverText = l10n.getString(
    isConnected ? 'status-server-online' : 'status-server-offline',
    null,
    isConnected ? 'Online' : 'Offline'
  );
  const modeText = l10n.getString(
    isQuestStandalone ? 'status-mode-standalone' : 'status-mode-pcvr',
    null,
    isQuestStandalone ? 'Standalone' : 'PC VR'
  );
  const trackersText = l10n.getString(
    'status-trackers',
    { count: trackerCount },
    `${trackerCount} trackers`
  );
  const serverLabel = l10n.getString('status-server', null, 'Server');

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      style={{ WebkitAppRegion: 'no-drag' } as any}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${serverLabel}: ${serverText}. ${modeText}. ${trackersText}. ${l10n.getString('status-cluster-label', null, 'Connection status. Open for details')}`}
        onClick={() => setOpen((value) => !value)}
        className={classNames(
          'flex h-8 items-center gap-4 rounded-[10px] border border-[var(--material-border-subtle)] px-3 text-ui-xs font-medium text-background-10 cursor-pointer select-none',
          open
            ? 'bg-background-10/[0.08]'
            : 'bg-background-10/[0.03] hover:bg-background-10/[0.06]'
        )}
      >
        <StatusDot tone={serverTone} label={`${serverLabel} ${serverText}`} />
        <StatusDot
          tone={isQuestStandalone ? 'ok' : 'idle'}
          label={modeText}
        />
        {/* The tracker count lives once, in the Home toolbar; the open panel still lists it. */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={classNames('text-background-30', open && 'rotate-180')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={l10n.getString(
            'status-details-title',
            null,
            'Connection details'
          )}
          className="absolute left-0 top-[calc(100%+8px)] z-50 flex w-[340px] max-w-[calc(100vw-24px)] flex-col gap-3 rounded-[12px] border border-[var(--material-border-primary)] bg-background-60 p-4 shadow-lg"
        >
          <h2 className="font-serif text-ui-md tracking-tight text-background-10">
            {l10n.getString('status-details-title', null, 'Connection details')}
          </h2>

          <dl className="flex flex-col gap-2 text-ui-xs">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-background-30">{serverLabel}</dt>
              <dd className="text-background-10">
                <StatusDot tone={serverTone} label={serverText} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-background-30">
                {l10n.getString('status-this-mac', null, 'This Mac')}
              </dt>
              <dd className="flex items-center gap-1 tnum text-background-10">
                {localIp ?? '—'}
                {localIp && (
                  <IconButton
                    label={l10n.getString(
                      'status-copy-ip',
                      null,
                      'Copy IP address'
                    )}
                    onClick={() => void navigator.clipboard.writeText(localIp)}
                  >
                    <CopyIcon />
                  </IconButton>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-background-30">
                {l10n.getString('status-quest-target', null, 'Headset address')}
              </dt>
              <dd>
                <QuestTargetIPPill />
              </dd>
            </div>
          </dl>

          <div className="flex items-start justify-between gap-3 rounded-[10px] bg-background-10/[0.04] p-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-ui-xs font-medium text-background-10">
                {l10n.getString(
                  'status-standalone-switch',
                  null,
                  'Standalone mode (VRChat OSC)'
                )}
              </span>
              <span className="text-ui-2xs text-background-30">
                {l10n.getString(
                  isQuestStandalone
                    ? 'status-standalone-help-on'
                    : 'status-standalone-help-off',
                  null,
                  isQuestStandalone
                    ? 'Streams tracking to your headset over OSC.'
                    : 'Tracking goes to SteamVR on this computer.'
                )}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isQuestStandalone}
              aria-label={l10n.getString(
                'status-standalone-switch',
                null,
                'Standalone mode (VRChat OSC)'
              )}
              onClick={toggleMode}
              className={classNames(
                'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border border-[var(--material-border-primary)] cursor-pointer',
                isQuestStandalone ? 'bg-status-success' : 'bg-background-40'
              )}
            >
              <span
                className={classNames(
                  'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm',
                  isQuestStandalone ? 'left-[18px]' : 'left-0.5'
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-ui-xs text-background-30">
              {trackersText}
            </span>
            <RefreshTrackersButton />
          </div>
        </div>
      )}
    </div>
  );
}
