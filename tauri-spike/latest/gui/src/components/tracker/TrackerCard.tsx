import { useConfig } from '@/hooks/config';
import { MouseEventHandler } from 'react';
import {
  DeviceDataT,
  TrackerDataT,
  TrackerStatus as TrackerStatusEnum,
  TrackingChecklistStepT,
} from 'solarxr-protocol';
import { Typography } from '@/components/commons/Typography';
import { TrackerBattery } from './TrackerBattery';
import { TrackerWifi } from './TrackerWifi';
import { TrackerStatus } from './TrackerStatus';
import classNames from 'classnames';
import { useTracker } from '@/hooks/tracker';
import { BodyPartIcon } from '@/components/commons/BodyPartIcon';
import { Tooltip } from '@/components/commons/Tooltip';
import { FirmwareIcon } from '@/components/commons/FirmwareIcon';
import { WarningIcon } from '@/components/commons/icon/WarningIcon';
import { trackingchecklistIdtoLabel } from '@/hooks/tracking-checklist';

function TrackerBig({
  device,
  tracker,
  velocity = 0,
}: {
  tracker: TrackerDataT;
  device?: DeviceDataT;
  velocity?: number;
}) {
  const { config } = useConfig();

  const { useName } = useTracker(tracker);

  const trackerName = useName();

  return (
    <div className="flex flex-col justify-center rounded-md py-3 pr-4 pl-4 w-full gap-2 box-border my-8 px-6 h-32">
      <div
        className={classNames(
          'flex justify-center fill-background-10 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          velocity > 0.18 && 'scale-105 text-accent-background-10'
        )}
      >
        <BodyPartIcon bodyPart={tracker.info?.bodyPart} />
      </div>
      <div className="flex justify-center">
        <Typography
          bold
          truncate
          className={classNames(
            'transition-colors duration-200',
            velocity > 0.18 ? 'text-accent-background-10' : 'text-background-10'
          )}
        >
          {trackerName}
        </Typography>
      </div>
      <div className="flex justify-center">
        <TrackerStatus
          status={tracker.status}
          recovery={tracker.recovery}
          bodyPart={tracker.info?.bodyPart}
        />
      </div>
      <div className="min-h-9 flex text-default justify-center gap-5 flex-wrap items-center">
        {device && device.hardwareStatus && (
          <>
            {device.hardwareStatus.batteryPctEstimate != null && (
              <TrackerBattery
                voltage={device.hardwareStatus.batteryVoltage}
                value={device.hardwareStatus.batteryPctEstimate / 100}
                runtime={device.hardwareStatus.batteryRuntimeEstimate}
                disabled={tracker.status === TrackerStatusEnum.DISCONNECTED}
                moreInfo={true}
              />
            )}
            <div className="flex gap-2">
              {(device.hardwareStatus.rssi != null ||
                device.hardwareStatus.ping != null) && (
                <TrackerWifi
                  rssi={device.hardwareStatus.rssi}
                  rssiShowNumeric={config?.debug}
                  ping={device.hardwareStatus.ping}
                  disabled={tracker.status === TrackerStatusEnum.DISCONNECTED}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TrackerSmol({
  device,
  tracker,
  warning,
  velocity = 0,
}: {
  tracker: TrackerDataT;
  device?: DeviceDataT;
  warning?: TrackingChecklistStepT | boolean;
  velocity?: number;
}) {
  const { useName } = useTracker(tracker);

  const trackerName = useName();

  return (
    <div className="flex rounded-md py-3 px-4 w-full gap-4 h-[70px]">
      <div className="flex flex-col justify-center items-center fill-background-10 relative">
        {warning && (
          <div className="absolute -right-2 -bottom-3 text-status-warning ">
            <WarningIcon width={20} />
          </div>
        )}
        <div
          className={classNames(
            'border rounded-[8px] overflow-clip transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            {
              'border-status-warning': warning && velocity <= 0.18,
              'border-background-10/10': !warning && velocity <= 0.18,
              'border-accent-background-20/70 shadow-[0_0_12px_-2px_rgba(217,119,87,0.4)] scale-105 bg-accent-background-20/10':
                velocity > 0.18,
            }
          )}
        >
          <BodyPartIcon bodyPart={tracker.info?.bodyPart} width={38} />
        </div>
      </div>

      <div
        className={classNames(
          'flex flex-col flex-grow justify-center gap-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          velocity > 0.18 && 'translate-x-0.5'
        )}
      >
        <Typography
          bold
          truncate
          variant="section-title"
          className={classNames(
            'transition-colors duration-200',
            velocity > 0.18 ? 'text-accent-background-10' : 'text-background-10'
          )}
        >
          {trackerName}
        </Typography>
        <TrackerStatus
          status={tracker.status}
          recovery={tracker.recovery}
          bodyPart={tracker.info?.bodyPart}
        />
      </div>
      {device && device.hardwareStatus && (
        <>
          <div className="flex flex-col justify-center items-center">
            {device.hardwareStatus.batteryPctEstimate != null && (
              <TrackerBattery
                voltage={device.hardwareStatus.batteryVoltage}
                value={device.hardwareStatus.batteryPctEstimate / 100}
                runtime={device.hardwareStatus.batteryRuntimeEstimate}
                disabled={tracker.status === TrackerStatusEnum.DISCONNECTED}
              />
            )}
          </div>
          <div className="flex flex-col justify-center items-center">
            {(device.hardwareStatus.rssi != null ||
              device.hardwareStatus.ping != null) && (
              <TrackerWifi
                rssi={device.hardwareStatus.rssi}
                ping={device.hardwareStatus.ping}
                disabled={tracker.status === TrackerStatusEnum.DISCONNECTED}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function TrackerCard({
  tracker,
  device,
  smol = false,
  interactable = false,
  outlined = false,
  onClick,
  bg = 'bg-background-60',
  shakeHighlight = true,
  warning = false,
  showUpdates = false,
}: {
  tracker: TrackerDataT;
  device?: DeviceDataT;
  smol?: boolean;
  interactable?: boolean;
  outlined?: boolean;
  bg?: string;
  shakeHighlight?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
  warning?: TrackingChecklistStepT | boolean;
  showUpdates?: boolean;
}) {
  const { useVelocity } = useTracker(tracker);
  const velocity = useVelocity();

  return (
    <div className="relative">
      <div
        onClick={onClick}
        className={classNames(
          'rounded-2xl overflow-hidden transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] select-none',
          interactable &&
            'glass-interactive cursor-pointer active:scale-[0.985] active:duration-150',
          outlined && 'outline outline-2 outline-accent-background-20/50',
          !bg || bg === 'bg-background-60' ? 'card-surface' : bg,
          shakeHighlight &&
            velocity > 0.18 &&
            'border-accent-background-20/60 shadow-[0_0_18px_-2px_rgba(217,119,87,0.35)]'
        )}
      >
        {smol && (
          <Tooltip
            preferedDirection="top"
            disabled={!warning}
            spacing={5}
            content={
              typeof warning === 'object' && (
                <div className="flex gap-1 items-center text-status-warning">
                  <WarningIcon width={20} />
                  <Typography id={trackingchecklistIdtoLabel[warning.id]} />
                </div>
              )
            }
          >
            <TrackerSmol
              tracker={tracker}
              device={device}
              warning={warning}
              velocity={velocity}
            />
          </Tooltip>
        )}
        {!smol && (
          <TrackerBig tracker={tracker} device={device} velocity={velocity} />
        )}
      </div>
      {showUpdates && <FirmwareIcon tracker={tracker} device={device} />}
    </div>
  );
}
