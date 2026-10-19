import { useLocalization } from '@fluent/react';
import classNames from 'classnames';
import { IPv4 } from 'ip-num';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import {
  AdaptiveDriftAction,
  AdaptiveDriftFreezeReason,
  AdaptiveDriftControlRequestT,
  AdaptiveDriftMode,
  AssignTrackerRequestT,
  BoardType,
  BodyPart,
  ClearDriftCompensationRequestT,
  ForgetDeviceRequestT,
  ImuType,
  MagnetometerStatus,
  RpcMessage,
  TrackerDataType,
} from 'solarxr-protocol';
import { useDebouncedEffect } from '@/hooks/timeout';
import { useTrackerFromId } from '@/hooks/tracker';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import {
  MountingOrientationDegreesToQuatT,
  QuaternionFromQuatT,
  rotationToQuatMap,
  similarQuaternions,
} from '@/maths/quaternion';
import { ArrowLink } from '@/components/commons/ArrowLink';
import { BodyPartIcon } from '@/components/commons/BodyPartIcon';
import { Button } from '@/components/commons/Button';
import { Dropdown, DropdownItem } from '@/components/commons/Dropdown';
import { WarningIcon } from '@/components/commons/icon/WarningIcon';
import { Input } from '@/components/commons/Input';
import { Typography } from '@/components/commons/Typography';
import { MountingSelectionMenu } from '@/components/onboarding/pages/mounting/MountingSelectionMenu';
import { IMUVisualizerWidget } from '@/components/widgets/IMUVisualizerWidget';
import { SingleTrackerBodyAssignmentMenu } from './SingleTrackerBodyAssignmentMenu';
import { TrackerCard } from './TrackerCard';
import { Quaternion } from 'three';
import { useAppContext } from '@/hooks/app';
import { MagnetometerToggleSetting } from '@/components/settings/pages/MagnetometerToggleSetting';
import { useSetAtom } from 'jotai';
import { ignoredTrackersAtom } from '@/store/app-store';
import { checkForUpdate } from '@/hooks/firmware-update';
import { Tooltip } from '@/components/commons/Tooltip';

const IMU_PROFILE_ITEMS: DropdownItem[] = [
  { value: 'auto', label: 'Auto-Detect' },
  { value: 'mpu6050', label: 'MPU6050 (Extreme Drift)' },
  { value: 'bmi160', label: 'BMI160 (High Drift)' },
  { value: 'lsm6_icm', label: 'LSM6 / ICM (Medium Drift)' },
  { value: 'bno085', label: 'BNO085 (Zero Drift)' },
];

const rotationsLabels: [Quaternion, string][] = [
  [rotationToQuatMap.BACK, 'tracker-rotation-back'],
  [rotationToQuatMap.FRONT, 'tracker-rotation-front'],
  [rotationToQuatMap.LEFT, 'tracker-rotation-left'],
  [rotationToQuatMap.RIGHT, 'tracker-rotation-right'],
  [rotationToQuatMap.BACK_LEFT, 'tracker-rotation-back_left'],
  [rotationToQuatMap.BACK_RIGHT, 'tracker-rotation-back_right'],
  [rotationToQuatMap.FRONT_LEFT, 'tracker-rotation-front_left'],
  [rotationToQuatMap.FRONT_RIGHT, 'tracker-rotation-front_right'],
];

export function TrackerSettingsPage() {
  const { l10n } = useLocalization();

  const { sendRPCPacket } = useWebsocketAPI();
  const [selectRotation, setSelectRotation] = useState<boolean>(false);
  const [selectBodypart, setSelectBodypart] = useState<boolean>(false);
  const { trackernum, deviceid } = useParams<{
    trackernum: string;
    deviceid: string;
  }>();
  const tracker = useTrackerFromId(trackernum, deviceid);
  const [driftCorrectionEnabled, setDriftCorrectionEnabled] = useState(
    tracker?.tracker.info?.allowDriftCompensation ?? false
  );
  const { control, watch, reset, handleSubmit } = useForm<{
    trackerName: string | null;
    imuProfileOverride: string;
  }>({
    defaultValues: {
      trackerName: null,
      imuProfileOverride: 'auto',
    },
    reValidateMode: 'onSubmit',
  });
  const setIgnoredTracker = useSetAtom(ignoredTrackersAtom);
  const { trackerName, imuProfileOverride } = watch();

  useEffect(() => {
    setDriftCorrectionEnabled(
      tracker?.tracker.info?.allowDriftCompensation ?? false
    );
  }, [
    tracker?.tracker.trackerId?.deviceId?.id,
    tracker?.tracker.trackerId?.trackerNum,
    tracker?.tracker.info?.allowDriftCompensation,
  ]);

  const onDirectionSelected = (mountingOrientationDegrees: Quaternion) => {
    if (!tracker) return;

    const assignreq = new AssignTrackerRequestT();

    assignreq.mountingOrientation = MountingOrientationDegreesToQuatT(
      mountingOrientationDegrees
    );
    assignreq.bodyPosition = tracker?.tracker.info?.bodyPart || BodyPart.NONE;
    assignreq.trackerId = tracker?.tracker.trackerId;
    assignreq.allowDriftCompensation = driftCorrectionEnabled;
    assignreq.imuProfileOverride = imuProfileOverride;
    sendRPCPacket(RpcMessage.AssignTrackerRequest, assignreq);
    setSelectRotation(false);
  };

  const onRoleSelected = (role: BodyPart) => {
    if (!tracker) return;

    const assignreq = new AssignTrackerRequestT();
    assignreq.bodyPosition = role;
    assignreq.trackerId = tracker?.tracker.trackerId;
    assignreq.allowDriftCompensation = driftCorrectionEnabled;
    assignreq.imuProfileOverride = imuProfileOverride;
    sendRPCPacket(RpcMessage.AssignTrackerRequest, assignreq);
    setSelectBodypart(false);
  };

  const currRotation = useMemo(() => {
    return QuaternionFromQuatT(tracker?.tracker.info?.mountingOrientation);
  }, [tracker?.tracker.info?.mountingOrientation]);

  const updateTrackerSettings = () => {
    if (!tracker) return;
    const assignreq = new AssignTrackerRequestT();
    assignreq.bodyPosition = tracker?.tracker.info?.bodyPart || BodyPart.NONE;
    assignreq.mountingOrientation = currRotation
      ? MountingOrientationDegreesToQuatT(currRotation)
      : null;

    assignreq.displayName = trackerName ?? null;
    assignreq.trackerId = tracker?.tracker.trackerId;
    assignreq.allowDriftCompensation = driftCorrectionEnabled;
    assignreq.imuProfileOverride = imuProfileOverride;
    sendRPCPacket(RpcMessage.AssignTrackerRequest, assignreq);
  };

  const onSettingsSubmit = () => {
    updateTrackerSettings();
  };

  useDebouncedEffect(
    () => updateTrackerSettings(),
    [trackerName, imuProfileOverride, driftCorrectionEnabled],
    500
  );

  const handleResetLearnedDrift = () => {
    sendRPCPacket(
      RpcMessage.ClearDriftCompensationRequest,
      new ClearDriftCompensationRequestT(tracker?.tracker.trackerId)
    );
  };

  const sendAdaptiveDriftAction = (action: AdaptiveDriftAction) => {
    sendRPCPacket(
      RpcMessage.AdaptiveDriftControlRequest,
      new AdaptiveDriftControlRequestT(
        tracker?.tracker.trackerId ?? null,
        action
      )
    );
  };

  const adaptiveState = tracker?.tracker.adaptiveDrift;
  const filterHealth = tracker?.tracker.filterHealth;
  const adaptiveMode = adaptiveState
    ? AdaptiveDriftMode[adaptiveState.mode]
    : '--';
  const adaptivePaused =
    adaptiveState?.mode === AdaptiveDriftMode.DISABLED &&
    adaptiveState.freezeReason === AdaptiveDriftFreezeReason.PAUSED;
  const adaptiveCorrectionEnabled = driftCorrectionEnabled;

  const learnedDriftDisplay = useMemo(() => {
    const learnedRate = tracker?.tracker.info?.learnedDriftRateDegPerMin;
    return learnedRate === undefined
      ? '--'
      : `±${Math.abs(learnedRate).toFixed(2)}°/min`;
  }, [tracker?.tracker.info?.learnedDriftRateDegPerMin]);

  useEffect(() => {
    const serverProfile = tracker?.tracker.info?.imuProfileOverride;
    reset({
      trackerName: tracker?.tracker.info?.customName as string | null,
      imuProfileOverride:
        typeof serverProfile === 'string' ? serverProfile : 'auto',
    });
  }, [
    tracker?.tracker.info?.customName,
    tracker?.tracker.info?.imuProfileOverride,
    reset,
  ]);

  const boardType = useMemo(() => {
    if (tracker?.device?.hardwareInfo?.officialBoardType) {
      return l10n.getString(
        'board_type-' +
          BoardType[
            tracker?.device?.hardwareInfo?.officialBoardType ??
              BoardType.UNKNOWN
          ]
      );
    } else if (tracker?.device?.hardwareInfo?.boardType) {
      return tracker?.device?.hardwareInfo?.boardType;
    } else {
      return '--';
    }
  }, [
    tracker?.device?.hardwareInfo?.officialBoardType,
    tracker?.device?.hardwareInfo?.boardType,
    l10n,
  ]);

  const macAddress = useMemo(() => {
    if (
      /(?:[a-zA-Z\d]{2}:){5}[a-zA-Z\d]{2}/.test(
        (tracker?.device?.hardwareInfo?.hardwareIdentifier as string | null) ??
          ''
      )
    ) {
      return tracker?.device?.hardwareInfo?.hardwareIdentifier as string;
    }
    return null;
  }, [tracker?.device?.hardwareInfo?.hardwareIdentifier]);

  const { currentFirmwareRelease } = useAppContext();

  const needUpdate =
    currentFirmwareRelease &&
    tracker?.device?.hardwareInfo &&
    checkForUpdate(currentFirmwareRelease, tracker?.device);
  const updateUnavailable = needUpdate === null;

  const [isFirmwareCollapsed, setIsFirmwareCollapsed] = useState(() => {
    return (
      localStorage.getItem('slimevr-tracker-firmware-collapsed') === 'true'
    );
  });
  const [isManufacturerCollapsed, setIsManufacturerCollapsed] = useState(() => {
    return (
      localStorage.getItem('slimevr-tracker-manufacturer-collapsed') === 'true'
    );
  });

  return (
    <form
      className="h-full overflow-y-auto animate-tracker-settings-in"
      onSubmit={handleSubmit(onSettingsSubmit)}
    >
      <SingleTrackerBodyAssignmentMenu
        isOpen={selectBodypart}
        onClose={() => setSelectBodypart(false)}
        onRoleSelected={onRoleSelected}
      />
      <MountingSelectionMenu
        bodyPart={tracker?.tracker.info?.bodyPart}
        currRotation={currRotation}
        isOpen={selectRotation}
        onClose={() => setSelectRotation(false)}
        onDirectionSelected={onDirectionSelected}
      />
      <div className="flex gap-2 max-md:flex-wrap md:flex-row xs:flex-col mobile:flex-col">
        <div className="flex flex-col w-full md:max-w-xs gap-2 animate-tracker-settings-left">
          {tracker && (
            <TrackerCard
              bg="bg-background-70"
              device={tracker?.device}
              tracker={tracker?.tracker}
              shakeHighlight={false}
            />
          )}
          {tracker?.device?.hardwareInfo?.hardwareIdentifier != 'Unknown' && (
            <div className="flex flex-col bg-background-70 p-3 rounded-lg gap-2">
              <div
                className="flex items-center justify-between cursor-pointer select-none py-0.5"
                onClick={() => {
                  setIsFirmwareCollapsed(!isFirmwareCollapsed);
                  localStorage.setItem(
                    'slimevr-tracker-firmware-collapsed',
                    String(!isFirmwareCollapsed)
                  );
                }}
              >
                <Typography
                  variant="section-title"
                  id="tracker-settings-update-title"
                >
                  Firmware version
                </Typography>
                <button
                  type="button"
                  className="text-background-30 hover:text-background-10 transition-colors p-0.5 rounded cursor-pointer"
                  aria-label={
                    isFirmwareCollapsed
                      ? 'Expand Firmware Version'
                      : 'Collapse Firmware Version'
                  }
                >
                  <svg
                    className={classNames(
                      'w-4 h-4 transition-transform duration-200',
                      isFirmwareCollapsed ? '-rotate-90' : 'rotate-0'
                    )}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </div>

              {!isFirmwareCollapsed && (
                <>
                  <div className="flex gap-2 flex-col">
                    <div className="flex justify-between gap-2">
                      <Typography id="tracker-settings-build-date" />
                      <Typography
                        whitespace="whitespace-pre-wrap"
                        textAlign="text-end"
                      >
                        {tracker?.device?.hardwareInfo?.firmwareDate || '--'}
                      </Typography>
                    </div>
                    <div className="flex justify-between gap-2">
                      <Typography id="tracker-settings-current-version" />
                      <Typography
                        whitespace="whitespace-pre-wrap"
                        textAlign="text-end"
                      >
                        {tracker?.device?.hardwareInfo?.firmwareVersion
                          ? `v${tracker?.device?.hardwareInfo?.firmwareVersion}`
                          : '--'}
                      </Typography>
                    </div>
                    {!!tracker?.device?.hardwareInfo?.officialBoardType && (
                      <div className="flex justify-between gap-2">
                        <Typography id="tracker-settings-latest-version" />
                        {!updateUnavailable && (
                          <>
                            {currentFirmwareRelease && (
                              <Typography
                                color={
                                  needUpdate === 'updated'
                                    ? undefined
                                    : 'text-accent-background-10'
                                }
                                textAlign="text-end"
                                whitespace="whitespace-pre-wrap"
                              >
                                {currentFirmwareRelease.name}
                              </Typography>
                            )}
                          </>
                        )}
                        {updateUnavailable && (
                          <Typography id="tracker-settings-update-unavailable-v2">
                            No releases found
                          </Typography>
                        )}
                      </div>
                    )}
                  </div>
                  {!updateUnavailable && (
                    <Tooltip
                      preferedDirection="top"
                      disabled={
                        needUpdate === 'can-update' || needUpdate === 'updated'
                      }
                      content={
                        <>
                          {needUpdate === 'unavailable' && (
                            <Typography id="tracker-settings-update-incompatible" />
                          )}
                          {needUpdate === 'blocked' && (
                            // This happens only if no update is available and or the user is not in the current stagged
                            <Typography id="tracker-settings-update-blocked" />
                          )}
                          {needUpdate === 'low-battery' &&
                            currentFirmwareRelease && (
                              <Typography id="tracker-settings-update-low-battery" />
                            )}
                        </>
                      }
                    >
                      <Button
                        variant={
                          needUpdate === 'can-update' ? 'primary' : 'secondary'
                        }
                        disabled={needUpdate !== 'can-update'}
                        to="/firmware-update"
                        id={
                          needUpdate === 'updated'
                            ? 'tracker-settings-update-up_to_date'
                            : 'tracker-settings-update'
                        }
                      />
                    </Tooltip>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex flex-col bg-background-70 p-3 rounded-lg gap-2 overflow-x-auto">
            <div
              className="flex items-center justify-between cursor-pointer select-none py-0.5"
              onClick={() => {
                setIsManufacturerCollapsed(!isManufacturerCollapsed);
                localStorage.setItem(
                  'slimevr-tracker-manufacturer-collapsed',
                  String(!isManufacturerCollapsed)
                );
              }}
            >
              <Typography variant="section-title">
                {l10n.getString('tracker-infos-manufacturer')}
              </Typography>
              <button
                type="button"
                className="text-background-30 hover:text-background-10 transition-colors p-0.5 rounded cursor-pointer"
                aria-label={
                  isManufacturerCollapsed
                    ? 'Expand Manufacturer Details'
                    : 'Collapse Manufacturer Details'
                }
              >
                <svg
                  className={classNames(
                    'w-4 h-4 transition-transform duration-200',
                    isManufacturerCollapsed ? '-rotate-90' : 'rotate-0'
                  )}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>

            {!isManufacturerCollapsed && (
              <div className="flex flex-col gap-2">
                {tracker?.device?.hardwareInfo?.manufacturer && (
                  <div className="flex justify-between">
                    <Typography>
                      {l10n.getString('tracker-infos-manufacturer')}
                    </Typography>
                    <Typography>
                      {tracker?.device?.hardwareInfo?.manufacturer}
                    </Typography>
                  </div>
                )}
                <div className="flex justify-between">
                  <Typography>
                    {l10n.getString('tracker-infos-display_name')}
                  </Typography>
                  <Typography>{tracker?.tracker.info?.displayName}</Typography>
                </div>
                <div className="flex justify-between">
                  <Typography>
                    {l10n.getString('tracker-infos-custom_name')}
                  </Typography>
                  <Typography sentry-mask>
                    {tracker?.tracker.info?.customName || '--'}
                  </Typography>
                </div>
                <div className="flex justify-between">
                  <Typography>{l10n.getString('tracker-infos-url')}</Typography>
                  <Typography>
                    {tracker?.device?.hardwareInfo?.ipAddress?.addr
                      ? `udp://${IPv4.fromNumber(
                          tracker?.device?.hardwareInfo?.ipAddress?.addr || 0
                        ).toString()}`
                      : '--'}
                  </Typography>
                </div>
                <div className="flex justify-between">
                  <Typography>
                    {l10n.getString('tracker-infos-hardware_identifier')}
                  </Typography>
                  <Typography>
                    {tracker?.device?.hardwareInfo?.hardwareIdentifier || '--'}
                  </Typography>
                </div>
                <div className="flex justify-between">
                  <Typography>
                    {l10n.getString('tracker-infos-data_support')}
                  </Typography>
                  <Typography>
                    {tracker?.tracker.info?.dataSupport
                      ? TrackerDataType[tracker?.tracker.info?.dataSupport]
                      : '--'}
                  </Typography>
                </div>
                <div className="flex justify-between">
                  <Typography>{l10n.getString('tracker-infos-imu')}</Typography>
                  <Typography>
                    {tracker?.tracker.info?.imuType
                      ? ImuType[tracker?.tracker.info?.imuType]
                      : '--'}
                  </Typography>
                </div>
                <div className="flex justify-between">
                  <Typography>
                    {l10n.getString('tracker-infos-board_type')}
                  </Typography>
                  <Typography>{boardType}</Typography>
                </div>
                <div className="flex justify-between">
                  <Typography>
                    {l10n.getString('tracker-infos-magnetometer')}
                  </Typography>
                  <Typography>
                    {tracker?.tracker.info?.magnetometer === undefined
                      ? '--'
                      : l10n.getString('tracker-infos-magnetometer-status-v1', {
                          status:
                            MagnetometerStatus[
                              tracker.tracker.info.magnetometer
                            ],
                        })}
                  </Typography>
                </div>
                <div className="flex justify-between">
                  <Typography>
                    {l10n.getString('tracker-infos-network_version')}
                  </Typography>
                  <Typography>
                    {tracker?.device?.hardwareInfo?.networkProtocolVersion ||
                      '--'}
                  </Typography>
                </div>
                {tracker?.device?.hardwareStatus?.packetsReceived !== null && (
                  <>
                    <div className="flex justify-between">
                      <Typography>
                        {l10n.getString('tracker-infos-packet_loss')}
                      </Typography>
                      <Typography>
                        {(
                          (tracker?.device?.hardwareStatus?.packetLoss ?? 0) *
                          100
                        ).toFixed(0)}
                        %
                      </Typography>
                    </div>
                    <div className="flex justify-between">
                      <Typography>
                        {l10n.getString('tracker-infos-packets_lost')}
                      </Typography>
                      <Typography>
                        {tracker?.device?.hardwareStatus?.packetsLost ?? '0'}
                      </Typography>
                    </div>
                    <div className="flex justify-between">
                      <Typography>
                        {l10n.getString('tracker-infos-packets_received')}
                      </Typography>
                      <Typography>
                        {tracker?.device?.hardwareStatus?.packetsReceived ??
                          '0'}
                      </Typography>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {tracker?.tracker && (
            <IMUVisualizerWidget tracker={tracker?.tracker} />
          )}
        </div>
        <div className="flex flex-col flex-grow bg-background-70 rounded-lg p-5 gap-3 animate-tracker-settings-right">
          <ArrowLink to="/">
            {l10n.getString('tracker-settings-back')}
          </ArrowLink>
          <Typography variant="main-title">
            {l10n.getString('tracker-settings-title')}
          </Typography>
          <div className="flex flex-col gap-2 w-full mt-3">
            <Typography variant="section-title">
              {l10n.getString('tracker-settings-assignment_section')}
            </Typography>
            <Typography>
              {l10n.getString(
                'tracker-settings-assignment_section-description'
              )}
            </Typography>
            <div className="flex justify-between bg-background-80 w-full p-3 rounded-lg">
              <div className="flex gap-3 items-center fill-background-10">
                {tracker?.tracker.info?.bodyPart !== BodyPart.NONE && (
                  <BodyPartIcon bodyPart={tracker?.tracker.info?.bodyPart} />
                )}
                {tracker?.tracker.info?.bodyPart === BodyPart.NONE && (
                  <WarningIcon className="fill-status-warning" />
                )}
                <Typography
                  color={classNames({
                    'text-status-warning':
                      tracker?.tracker.info?.bodyPart === BodyPart.NONE,
                  })}
                >
                  {l10n.getString(
                    'body_part-' +
                      BodyPart[tracker?.tracker.info?.bodyPart || BodyPart.NONE]
                  )}
                </Typography>
              </div>
              <div className="flex">
                <Button
                  variant="secondary"
                  onClick={() => setSelectBodypart(true)}
                >
                  {l10n.getString('tracker-settings-assignment_section-edit')}
                </Button>
              </div>
            </div>
          </div>
          {tracker?.tracker.info?.isImu && (
            <div className="flex flex-col gap-2 w-full mt-3">
              <Typography variant="section-title">
                {l10n.getString('tracker-settings-mounting_section')}
              </Typography>
              <Typography>
                {l10n.getString(
                  'tracker-settings-mounting_section-description'
                )}
              </Typography>
              <div className="flex justify-between bg-background-80 w-full p-3 rounded-lg">
                <div className="flex gap-3 items-center">
                  <BodyPartIcon bodyPart={BodyPart.NONE} />
                  <Typography>
                    {l10n.getString(
                      (rotationsLabels.find((q) =>
                        similarQuaternions(q[0], currRotation)
                      ) || [])[1] || 'tracker-rotation-custom'
                    ) +
                      (tracker?.tracker.info?.mountingResetOrientation &&
                      !similarQuaternions(
                        QuaternionFromQuatT(
                          tracker.tracker.info.mountingResetOrientation
                        ),
                        new Quaternion()
                      )
                        ? ` ${l10n.getString('tracker-rotation-overriden')}`
                        : '')}
                  </Typography>
                </div>
                <div className="flex">
                  <Button
                    variant="secondary"
                    onClick={() => setSelectRotation(true)}
                  >
                    {l10n.getString('tracker-settings-mounting_section-edit')}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {tracker?.tracker.info?.isImu &&
            tracker?.tracker.info?.magnetometer !==
              MagnetometerStatus.NOT_SUPPORTED && (
              <MagnetometerToggleSetting
                settingType="tracker"
                trackerNum={tracker.tracker.trackerId?.trackerNum}
                deviceId={tracker.tracker.trackerId?.deviceId?.id}
              />
            )}
          {tracker?.tracker.info?.isImu && (
            <details className="w-full mt-3 group">
              <summary className="cursor-pointer select-none list-none flex items-center justify-between rounded-lg bg-background-80 px-4 py-3">
                <Typography variant="section-title">Experimental</Typography>
                <span className="text-xs text-background-30">
                  Drift auto-learning is switched off
                </span>
              </summary>
              <div className="flex flex-col gap-3 w-full mt-2 bg-background-80 p-4 rounded-lg">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <Typography variant="section-title">
                      Adaptive Profile & Drift Memory
                    </Typography>
                    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-accent-background-20/20 border border-accent-background-20/40 text-background-10 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-background-30 shrink-0" />
                      Off
                    </span>
                  </div>
                  <Typography color="secondary">
                    Learns persistent drift rates per IMU across sessions and
                    applies startup baseline compensation.
                  </Typography>
                </div>

                <div className="grid md:grid-cols-2 gap-3 pt-1">
                  <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                    <Typography color="secondary">Detected IMU</Typography>
                    <Typography bold>
                      {tracker?.tracker.info?.imuType !== undefined
                        ? ImuType[tracker.tracker.info.imuType]
                        : '--'}
                    </Typography>
                  </div>
                  <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                    <Typography color="secondary">
                      Learned Drift Rate
                    </Typography>
                    <Typography bold className="text-accent-background-10">
                      {learnedDriftDisplay}
                    </Typography>
                  </div>
                </div>

                <div className="grid md:grid-cols-4 gap-3 pt-1">
                  <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                    <Typography color="secondary">Learner State</Typography>
                    <Typography bold>{adaptiveMode}</Typography>
                  </div>
                  <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                    <Typography color="secondary">Confidence</Typography>
                    <Typography bold>
                      {adaptiveState
                        ? `${Math.round(adaptiveState.confidence * 100)}%`
                        : '--'}
                    </Typography>
                  </div>
                  <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                    <Typography color="secondary">Input</Typography>
                    <Typography bold>
                      {filterHealth
                        ? `${filterHealth.inputRateHz.toFixed(1)} Hz`
                        : '--'}
                    </Typography>
                  </div>
                  <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                    <Typography color="secondary">Jitter</Typography>
                    <Typography bold>
                      {filterHealth
                        ? `${filterHealth.packetJitterMs.toFixed(1)} ms`
                        : '--'}
                    </Typography>
                  </div>
                  <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                    <Typography color="secondary">Stable Window</Typography>
                    <Typography bold>
                      {adaptiveState
                        ? `${Math.round(Number(adaptiveState.stableDurationMs) / 1000)} s`
                        : '--'}
                    </Typography>
                  </div>
                  <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                    <Typography color="secondary">
                      Applied Correction
                    </Typography>
                    <Typography bold>
                      {adaptiveState
                        ? `${adaptiveState.appliedCorrectionDeg.toFixed(2)}°`
                        : '--'}
                    </Typography>
                  </div>
                </div>

                <div className="flex flex-col gap-1 pt-1">
                  <Typography bold>Profile Override</Typography>
                  <Dropdown
                    display="block"
                    control={control}
                    name="imuProfileOverride"
                    placeholder="Select Profile"
                    items={IMU_PROFILE_ITEMS}
                  />
                </div>

                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <Button
                    variant="secondary"
                    className="self-start text-xs !py-1.5"
                    onClick={() => {
                      const enabled = !adaptiveCorrectionEnabled;
                      setDriftCorrectionEnabled(enabled);
                      sendAdaptiveDriftAction(
                        enabled
                          ? AdaptiveDriftAction.ENABLE_CORRECTION
                          : AdaptiveDriftAction.DISABLE_CORRECTION
                      );
                    }}
                  >
                    {adaptiveCorrectionEnabled
                      ? 'Disable Correction'
                      : 'Enable Correction'}
                  </Button>
                  <Button
                    variant="secondary"
                    className="self-start text-xs !py-1.5"
                    onClick={() =>
                      sendAdaptiveDriftAction(
                        adaptivePaused
                          ? AdaptiveDriftAction.RESUME_LEARNING
                          : AdaptiveDriftAction.PAUSE_LEARNING
                      )
                    }
                  >
                    {adaptivePaused ? 'Resume Learning' : 'Pause Learning'}
                  </Button>
                  <Button
                    variant="secondary"
                    className="self-start text-xs !py-1.5"
                    onClick={() =>
                      sendAdaptiveDriftAction(
                        AdaptiveDriftAction.RESTORE_PREVIOUS_MODEL
                      )
                    }
                  >
                    Restore Previous
                  </Button>
                  <Button
                    variant="secondary"
                    className="self-start text-xs !py-1.5"
                    onClick={handleResetLearnedDrift}
                  >
                    Reset Learned Drift
                  </Button>
                </div>
              </div>
            </details>
          )}
          <div className="flex flex-col gap-2 w-full mt-3 sentry-mask">
            <Typography variant="section-title">
              {l10n.getString('tracker-settings-name_section')}
            </Typography>
            <Typography>
              {l10n.getString('tracker-settings-name_section-description')}
            </Typography>
            <Input
              placeholder={l10n.getString(
                'tracker-settings-name_section-placeholder'
              )}
              type="text"
              name="trackerName"
              control={control}
              autocomplete="off"
              rules={undefined}
              label={l10n.getString('tracker-settings-name_section-label')}
            />
          </div>
          {macAddress && (
            <div className="flex flex-col gap-2 w-full mt-3">
              <Typography variant="section-title">
                {l10n.getString('tracker-settings-forget')}
              </Typography>
              <Typography>
                {l10n.getString('tracker-settings-forget-description')}
              </Typography>
              <Button
                variant="secondary"
                className="!bg-status-critical self-start"
                onClick={() => {
                  sendRPCPacket(
                    RpcMessage.ForgetDeviceRequest,
                    new ForgetDeviceRequestT(macAddress)
                  );
                  setIgnoredTracker((state) => {
                    state.add(macAddress);
                    return state;
                  });
                }}
              >
                {l10n.getString('tracker-settings-forget-label')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
