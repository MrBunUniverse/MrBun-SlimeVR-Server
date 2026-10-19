import classNames from 'classnames';
import './TrackersTable.scss';
import { IPv4 } from 'ip-num';
import { ReactNode, useMemo } from 'react';
import { useConfig } from '@/hooks/config';
import { useTracker } from '@/hooks/tracker';
import { BodyPartIcon } from '@/components/commons/BodyPartIcon';
import { Typography } from '@/components/commons/Typography';
import { formatVector3 } from '@/utils/formatting';
import { TrackerBattery } from './TrackerBattery';
import { TrackerStatus } from './TrackerStatus';
import { TrackerWifi } from './TrackerWifi';
import { FlatDeviceTracker } from '@/store/app-store';
import { StayAlignedInfo } from '@/components/stay-aligned/StayAlignedInfo';
import { Tooltip } from '@/components/commons/Tooltip';
import { WarningIcon } from '@/components/commons/icon/WarningIcon';
import { FirmwareIcon } from '@/components/commons/FirmwareIcon';
import {
  BodyPart,
  TrackerDataT,
  TrackerStatus as TrackerStatusEnum,
  TrackingChecklistStepT,
} from 'solarxr-protocol';
import {
  highlightedTrackers,
  trackingchecklistIdtoLabel,
  useTrackingChecklist,
} from '@/hooks/tracking-checklist';

const isHMD = ({ tracker }: FlatDeviceTracker) =>
  tracker.info?.isHmd || tracker.info?.bodyPart === BodyPart.HEAD;

const isSlime = ({ device }: FlatDeviceTracker) =>
  device?.hardwareInfo?.manufacturer === 'SlimeVR' ||
  device?.hardwareInfo?.manufacturer === 'HID Device';

const getTrackerName = ({ tracker }: FlatDeviceTracker) =>
  tracker?.info?.customName?.toString() || '';

export function TrackerNameCell({
  tracker,
  warning,
}: {
  tracker: TrackerDataT;
  warning: TrackingChecklistStepT | boolean;
}) {
  const { useName } = useTracker(tracker);

  const name = useName();

  return (
    <div className="tracker-list-name flex items-center gap-3 min-w-0">
      <div className="tracker-list-icon flex shrink-0 justify-center items-center relative">
        {warning && (
          <div className="absolute -left-2 -top-1 text-status-warning ">
            <WarningIcon width={16} />
          </div>
        )}
        <div
          className={classNames(
            'border-[2px] border-opacity-80 rounded-md overflow-clip',
            {
              'border-status-warning': warning,
              'border-transparent': !warning,
            }
          )}
        >
          <BodyPartIcon bodyPart={tracker.info?.bodyPart} width={24} />
        </div>
      </div>
      <div className="flex flex-col flex-grow min-w-0 gap-0.5">
        <span
          className="truncate font-mono text-[13px] font-semibold leading-tight text-background-10"
          title={name.toString()}
        >
          {name}
        </span>
        <TrackerStatus
          status={tracker.status}
          recovery={tracker.recovery}
          bodyPart={tracker.info?.bodyPart}
        />
      </div>
    </div>
  );
}

export function TrackerRotCell({
  tracker,
  precise,
  color,
  referenceAdjusted,
}: {
  tracker: TrackerDataT;
  precise?: boolean;
  color?: string;
  referenceAdjusted?: boolean;
}) {
  const { useRawRotationEulerDegrees, useRefAdjRotationEulerDegrees } =
    useTracker(tracker);

  const rotationRaw = useRawRotationEulerDegrees();
  const rotationRef = useRefAdjRotationEulerDegrees() || rotationRaw;
  const rot = referenceAdjusted ? rotationRef : rotationRaw;

  return (
    <Typography color={color} whitespace="whitespace-nowrap">
      {formatVector3(rot, precise ? 2 : 0)}
    </Typography>
  );
}

function Header({
  name,
  first = false,
  last = false,
  show = true,
}: {
  first?: boolean;
  last?: boolean;
  name: string;
  className?: string;
  show?: boolean;
}) {
  return (
    <div
      className={classNames('text-start px-2 flex items-center', {
        hidden: !show,
        'pl-4': first,
        'pr-4': last,
      })}
    >
      <Typography id={name} whitespace="whitespace-nowrap" />
    </div>
  );
}

function Cell({
  children,
  first = false,
  last = false,
  show = true,
}: {
  children: ReactNode;
  first?: boolean;
  last?: boolean;
  show?: boolean;
}) {
  return (
    <div
      className={classNames(
        'tracker-list-cell px-2 py-2 flex items-center min-w-0',
        {
          hidden: !show,
          'pl-3': first,
          'pr-3': last,
        }
      )}
    >
      {children}
    </div>
  );
}

function Row({
  data,
  highlightedTrackers,
  clickedTracker,
  gridTemplateColumns,
  showType,
  showTemp,
}: {
  data: FlatDeviceTracker;
  highlightedTrackers: highlightedTrackers | undefined;
  clickedTracker: (tracker: TrackerDataT) => void;
  gridTemplateColumns: string;
  showType: boolean;
  showTemp: boolean;
}) {
  const { config } = useConfig();
  const fontColor = config?.devSettings?.highContrast ? 'primary' : 'secondary';
  const moreInfo = config?.devSettings?.moreInfo;

  const { tracker, device } = data;
  const { useVelocity } = useTracker(tracker);
  const velocity = useVelocity();
  const isMoving =
    tracker.status !== TrackerStatusEnum.DISCONNECTED && velocity > 0.18;

  const warning =
    !!highlightedTrackers?.trackers.find(
      (t) =>
        t?.deviceId?.id === tracker.trackerId?.deviceId?.id &&
        t?.trackerNum === tracker.trackerId?.trackerNum
    ) && highlightedTrackers.step;

  return (
    <>
      <div className="relative z-10">
        <div className="absolute top-3 left-3">
          <FirmwareIcon tracker={tracker} device={device} />
        </div>
      </div>
      <Tooltip
        disabled={!warning}
        preferedDirection="top"
        content={
          warning && (
            <div className="flex gap-1 items-center text-status-warning">
              <WarningIcon width={20} />
              <Typography id={trackingchecklistIdtoLabel[warning.id]} />
            </div>
          )
        }
        spacing={-5}
      >
        <>
          <div
            className={classNames('tracker-list-row group grid items-center', {
              'tracker-list-row-moving': isMoving,
            })}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                clickedTracker(tracker);
              }
            }}
            style={{ gridTemplateColumns }}
            onClick={() => clickedTracker(tracker)}
          >
            <Cell first>
              <TrackerNameCell tracker={tracker} warning={warning} />
            </Cell>
            <Cell show={showType}>
              <Typography color={fontColor}>
                {device?.hardwareInfo?.manufacturer || '--'}
              </Typography>
            </Cell>
            <Cell>
              {device?.hardwareStatus?.batteryPctEstimate != null && (
                <TrackerBattery
                  value={device.hardwareStatus.batteryPctEstimate / 100}
                  voltage={device.hardwareStatus.batteryVoltage}
                  runtime={device.hardwareStatus.batteryRuntimeEstimate}
                  disabled={tracker.status === TrackerStatusEnum.DISCONNECTED}
                  moreInfo={config?.devSettings.moreInfo}
                  textColor={fontColor}
                />
              )}
            </Cell>
            <Cell>
              {(device?.hardwareStatus?.rssi != null ||
                device?.hardwareStatus?.ping != null) && (
                <TrackerWifi
                  rssi={device?.hardwareStatus?.rssi}
                  rssiShowNumeric
                  ping={device?.hardwareStatus?.ping}
                  disabled={tracker.status === TrackerStatusEnum.DISCONNECTED}
                  textColor={fontColor}
                  showPacketLoss
                  packetLoss={device.hardwareStatus.packetLoss}
                  packetsLost={device.hardwareStatus.packetsLost}
                  packetsReceived={device.hardwareStatus.packetsReceived}
                />
              )}
            </Cell>
            <Cell>
              {tracker.tps && (
                <Typography color={fontColor}>{tracker.tps}</Typography>
              )}
            </Cell>
            <Cell>
              <TrackerRotCell
                tracker={tracker}
                precise={config?.devSettings?.preciseRotation}
                referenceAdjusted={!config?.devSettings?.rawSlimeRotation}
                color={fontColor}
              />
            </Cell>
            <Cell last={!moreInfo} show={showTemp}>
              {tracker?.temp && tracker?.temp?.temp != 0 && (
                <Typography color={fontColor} whitespace="whitespace-nowrap">
                  {tracker.temp.temp.toFixed(2)}
                </Typography>
              )}
            </Cell>
            <Cell show={moreInfo}>
              {tracker.linearAcceleration && (
                <Typography color={fontColor} whitespace="whitespace-nowrap">
                  {formatVector3(tracker.linearAcceleration, 1)}
                </Typography>
              )}
            </Cell>
            <Cell show={moreInfo}>
              {tracker.position && (
                <Typography color={fontColor} whitespace="whitespace-nowrap">
                  {formatVector3(tracker.position, 2)}
                </Typography>
              )}
            </Cell>
            <Cell show={moreInfo}>
              <StayAlignedInfo color={fontColor} tracker={tracker} />
            </Cell>
            <Cell last={moreInfo} show={moreInfo}>
              <Typography color={fontColor} whitespace="whitespace-nowrap">
                udp://
                {IPv4.fromNumber(
                  device?.hardwareInfo?.ipAddress?.addr || 0
                ).toString()}
              </Typography>
            </Cell>
          </div>
        </>
      </Tooltip>
    </>
  );
}

export function TrackersTable({
  flatTrackers,
  clickedTracker,
}: {
  clickedTracker: (tracker: TrackerDataT) => void;
  flatTrackers: FlatDeviceTracker[];
}) {
  const { config } = useConfig();
  const { highlightedTrackers } = useTrackingChecklist();

  const filteringEnabled =
    config?.debug && config?.devSettings?.filterSlimesAndHMD;
  const sortingEnabled = config?.debug && config?.devSettings?.sortByName;

  const filteredSortedTrackers = useMemo(() => {
    const list = filteringEnabled
      ? flatTrackers.filter((t) => isHMD(t) || isSlime(t))
      : flatTrackers;

    if (sortingEnabled) {
      list.sort((a, b) => getTrackerName(a).localeCompare(getTrackerName(b)));
    }
    return list;
  }, [flatTrackers, filteringEnabled, sortingEnabled]);

  const moreInfo = config?.devSettings?.moreInfo;

  // Columns no tracker has data for (often Type and Temp) are left out.
  const showType = filteredSortedTrackers.some(
    ({ device }) => !!device?.hardwareInfo?.manufacturer
  );
  const showTemp = filteredSortedTrackers.some(
    ({ tracker }) => !!tracker.temp?.temp
  );

  const gridTemplateColumns = useMemo(() => {
    const cols = [
      'minmax(11rem, 1.6fr)', // Name
      ...(showType ? ['6rem'] : []), // Type
      '6.5rem', // Battery
      '7.5rem', // Ping and signal
      '3.5rem', // TPS
      config?.devSettings?.preciseRotation ? '9rem' : '7rem', // Rotation
      ...(showTemp ? ['4.5rem'] : []), // Temp
    ];

    if (moreInfo) {
      cols.push('9rem'); // Linear Acc
      cols.push('9rem'); // Position
      cols.push('9rem'); // Stay Aligned
      cols.push('11rem'); // URL
    }

    return cols.join(' ');
  }, [config?.devSettings?.preciseRotation, moreInfo, showType, showTemp]);

  return (
    <div className="tracker-list w-full overflow-x-auto p-2">
      <div className="min-w-fit">
        <div
          className="tracker-list-header grid items-center mb-2"
          style={{ gridTemplateColumns }}
        >
          <Header name={'tracker-table-column-name'} first />
          <Header name={'tracker-table-column-type'} show={showType} />
          <Header name={'tracker-table-column-battery'} />
          <Header name={'tracker-table-column-ping'} />
          <Header name={'tracker-table-column-tps'} />
          <Header name={'tracker-table-column-rotation'} />
          <Header
            name={'tracker-table-column-temperature'}
            last={!moreInfo}
            show={showTemp}
          />
          <Header
            name={'tracker-table-column-linear-acceleration'}
            show={moreInfo}
          />
          <Header name={'tracker-table-column-position'} show={moreInfo} />
          <Header name={'tracker-table-column-stay_aligned'} show={moreInfo} />
          <Header
            name={'tracker-table-column-url'}
            show={moreInfo}
            last={moreInfo}
          />
        </div>
        <div className="tracker-list-body flex flex-col">
          {filteredSortedTrackers.map((data, index) => (
            <div
              key={`${data.device?.id?.id ?? 'dev'}_${data.tracker.trackerId?.trackerNum ?? index}_${index}`}
              style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }}
              className={classNames(
                'w-full',
                index % 2 === 0
                  ? 'animate-tracker-slide-left'
                  : 'animate-tracker-slide-right'
              )}
            >
              <Row
                clickedTracker={clickedTracker}
                data={data}
                highlightedTrackers={highlightedTrackers}
                gridTemplateColumns={gridTemplateColumns}
                showType={showType}
                showTemp={showTemp}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
