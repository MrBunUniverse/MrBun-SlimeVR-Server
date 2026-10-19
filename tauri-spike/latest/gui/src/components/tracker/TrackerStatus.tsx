import classNames from 'classnames';
import { useMemo } from 'react';
import {
  BodyPart,
  ResetRequestT,
  ResetType,
  RpcMessage,
  TrackerRecoveryT,
  TrackerStatus as TrackerStatusEnum,
} from 'solarxr-protocol';
import { Typography } from '@/components/commons/Typography';
import { useLocalization } from '@fluent/react';
import { useWebsocketAPI } from '@/hooks/websocket-api';

// Keep rendering safe when an older generated protocol package is present.
// These values are append-only protocol enum values and match tracker.fbs.
const TrackerRecoveryState = {
  NONE: 0,
  BRIDGING_GAP: 1,
  COMPENSATING: 2,
  WAITING_FOR_STILLNESS: 3,
  VALIDATING: 4,
  BLENDING: 5,
  NEEDS_RESET: 6,
} as const;

const statusLabelMap: { [key: number]: string } = {
  [TrackerStatusEnum.NONE]: 'tracker-status-none',
  [TrackerStatusEnum.BUSY]: 'tracker-status-busy',
  [TrackerStatusEnum.ERROR]: 'tracker-status-error',
  [TrackerStatusEnum.DISCONNECTED]: 'tracker-status-disconnected',
  [TrackerStatusEnum.OCCLUDED]: 'tracker-status-occluded',
  [TrackerStatusEnum.OK]: 'tracker-status-ok',
  [TrackerStatusEnum.TIMED_OUT]: 'tracker-status-timed_out',
};

const statusClassMap: { [key: number]: string } = {
  [TrackerStatusEnum.NONE]: 'bg-background-30',
  [TrackerStatusEnum.BUSY]: 'bg-status-warning',
  [TrackerStatusEnum.ERROR]: 'bg-status-critical',
  [TrackerStatusEnum.DISCONNECTED]: 'bg-background-30',
  [TrackerStatusEnum.OCCLUDED]: 'bg-status-warning',
  [TrackerStatusEnum.OK]: 'bg-status-success',
  [TrackerStatusEnum.TIMED_OUT]: 'bg-status-warning',
};

const recoveryLabelMap: Record<number, string> = {
  [TrackerRecoveryState.BRIDGING_GAP]: 'tracker-recovery-compensating',
  [TrackerRecoveryState.COMPENSATING]: 'tracker-recovery-compensating',
  [TrackerRecoveryState.WAITING_FOR_STILLNESS]: 'tracker-recovery-hold-still',
  [TrackerRecoveryState.VALIDATING]: 'tracker-recovery-validating',
  [TrackerRecoveryState.BLENDING]: 'tracker-recovery-recovered',
  [TrackerRecoveryState.NEEDS_RESET]: 'tracker-recovery-needs-reset',
};

export function TrackerStatus({
  status,
  recovery,
  bodyPart,
}: {
  status: number;
  recovery?: TrackerRecoveryT | null;
  bodyPart?: BodyPart;
}) {
  const { l10n } = useLocalization();
  const { sendRPCPacket } = useWebsocketAPI();

  const recoveryActive =
    recovery && recovery.state !== TrackerRecoveryState.NONE;
  const recoveryLabel = recoveryActive
    ? recoveryLabelMap[recovery.state]
    : undefined;

  const statusClass = useMemo(() => statusClassMap[status], [status]);
  const statusLabel = useMemo(
    () => recoveryLabel || statusLabelMap[status],
    [recoveryLabel, status]
  );

  const resetTracker = () => {
    if (bodyPart == null) return;
    const req = new ResetRequestT();
    req.resetType = ResetType.Full;
    req.bodyParts = [bodyPart];
    sendRPCPacket(RpcMessage.ResetRequest, req);
  };

  return (
    <div className="flex items-center gap-1.5 glass-pill px-2 py-0.5 text-ui-2xs font-medium">
      <div
        className={classNames('w-1.5 h-1.5 rounded-full shrink-0', statusClass)}
      />
      <Typography
        whitespace="whitespace-nowrap"
        className="text-ui-2xs leading-tight"
      >
        {l10n.getString(statusLabel)}
        {recovery?.state === TrackerRecoveryState.WAITING_FOR_STILLNESS &&
          ` ${Math.round(recovery.progress * 100)}%`}
      </Typography>
      {recovery?.state === TrackerRecoveryState.NEEDS_RESET &&
        bodyPart != null && (
          <button
            type="button"
            className="ml-1 underline underline-offset-2"
            onClick={(event) => {
              event.stopPropagation();
              resetTracker();
            }}
          >
            {l10n.getString('tracker-recovery-reset-action')}
          </button>
        )}
    </div>
  );
}
