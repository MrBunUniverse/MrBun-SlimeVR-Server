import { Localized, useLocalization } from '@fluent/react';
import { useEffect, useRef, useState } from 'react';
import { DefaultValues, useForm } from 'react-hook-form';
import {
  ChangeSettingsRequestT,
  FilteringSettingsT,
  FilteringType,
  LegTweaksSettingsT,
  ModelRatiosT,
  ModelSettingsT,
  ModelTogglesT,
  RpcMessage,
  SettingsRequestT,
  SettingsResponseT,
  SteamVRTrackersSettingT,
  TapDetectionSettingsT,
  HIDSettingsT,
  VelocitySettingsT,
  BodyPart,
} from 'solarxr-protocol';
import { useConfig } from '@/hooks/config';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { useLocaleConfig } from '@/i18n/config';
import { CheckBox } from '@/components/commons/Checkbox';
import { Button } from '@/components/commons/Button';
import { useElectron } from '@/hooks/electron';
import { SteamIcon } from '@/components/commons/icon/SteamIcon';
import { WrenchIcon } from '@/components/commons/icon/WrenchIcons';
import { RecordIcon } from '@/components/commons/icon/RecordIcon';
import { FolderIcon } from '@/components/commons/icon/FolderIcon';
import { NumberSelector } from '@/components/commons/NumberSelector';
import { Radio } from '@/components/commons/Radio';
import { Typography } from '@/components/commons/Typography';
import {
  SettingsPageLayout,
  SettingsPagePaneLayout,
} from '@/components/settings/SettingsPageLayout';
import { HandsWarningModal } from '@/components/settings/HandsWarningModal';
import { MagnetometerToggleSetting } from './MagnetometerToggleSetting';
import {
  defaultStayAlignedSettings,
  StayAlignedSettings,
  StayAlignedSettingsForm,
  serializeStayAlignedSettings,
  deserializeStayAlignedSettings,
} from './components/StayAlignedSettings';
import {
  defaultResetSettings,
  loadResetSettings,
  ResetSettingsForm,
} from '@/hooks/reset-settings';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { isEqual } from '@react-hookz/deep-equal';
import { selectAtom } from 'jotai/utils';
import { Dropdown } from '@/components/commons/Dropdown';
import { ASSIGNMENT_MODES } from '@/components/onboarding/BodyAssignment';

export type SettingsForm = {
  trackers: {
    waist: boolean;
    chest: boolean;
    automaticTrackerToggle: boolean;
    leftFoot: boolean;
    rightFoot: boolean;
    leftKnee: boolean;
    rightKnee: boolean;
    leftElbow: boolean;
    rightElbow: boolean;
    leftHand: boolean;
    rightHand: boolean;
  };
  filtering: {
    type: number;
    amount: number;
  };
  toggles: {
    extendedSpine: boolean;
    extendedPelvis: boolean;
    extendedKnee: boolean;
    forceArmsFromHmd: boolean;
    floorClip: boolean;
    skatingCorrection: boolean;
    toeSnap: boolean;
    footPlant: boolean;
    selfLocalization: boolean;
    usePosition: boolean;
    enforceConstraints: boolean;
    correctConstraints: boolean;
  };
  ratios: {
    imputeWaistFromChestHip: number;
    imputeWaistFromChestLegs: number;
    imputeHipFromChestLegs: number;
    imputeHipFromWaistLegs: number;
    interpHipLegs: number;
    interpKneeTrackerAnkle: number;
    interpKneeAnkle: number;
  };
  tapDetection: {
    mountingResetEnabled: boolean;
    yawResetEnabled: boolean;
    fullResetEnabled: boolean;
    yawResetDelay: number;
    fullResetDelay: number;
    mountingResetDelay: number;
    yawResetTaps: number;
    fullResetTaps: number;
    mountingResetTaps: number;
    numberTrackersOverThreshold: number;
    yawResetTracker: string;
    mountingResetTracker: string;
    fullResetTracker: string;
  };
  legTweaks: {
    correctionStrength: number;
  };
  resetsSettings: ResetSettingsForm;
  stayAligned: StayAlignedSettingsForm;
  hidSettings: {
    trackersOverHID: boolean;
  };
  velocitySettings: {
    sendDerivedVelocity: boolean;
  };
  telemetry: {
    recordTelemetry: boolean;
  };
};

const defaultValues: SettingsForm = {
  trackers: {
    waist: false,
    chest: false,
    automaticTrackerToggle: true,
    leftFoot: false,
    rightFoot: false,
    leftElbow: false,
    rightElbow: false,
    leftHand: false,
    rightHand: false,
    leftKnee: false,
    rightKnee: false,
  },
  toggles: {
    extendedSpine: true,
    extendedPelvis: true,
    extendedKnee: true,
    forceArmsFromHmd: false,
    floorClip: false,
    skatingCorrection: false,
    toeSnap: false,
    footPlant: true,
    selfLocalization: false,
    usePosition: true,
    enforceConstraints: true,
    correctConstraints: true,
  },
  ratios: {
    imputeWaistFromChestHip: 0.3,
    imputeWaistFromChestLegs: 0.2,
    imputeHipFromChestLegs: 0.45,
    imputeHipFromWaistLegs: 0.4,
    interpHipLegs: 0.25,
    interpKneeTrackerAnkle: 0.85,
    interpKneeAnkle: 0.2,
  },
  filtering: { amount: 0.1, type: FilteringType.NONE },
  tapDetection: {
    mountingResetEnabled: false,
    yawResetEnabled: false,
    fullResetEnabled: false,
    yawResetDelay: 0.2,
    fullResetDelay: 1.0,
    mountingResetDelay: 1.0,
    yawResetTaps: 2,
    fullResetTaps: 3,
    mountingResetTaps: 3,
    numberTrackersOverThreshold: 1,
    yawResetTracker: String(BodyPart.CHEST),
    mountingResetTracker: String(BodyPart.RIGHT_UPPER_LEG),
    fullResetTracker: String(BodyPart.LEFT_UPPER_LEG),
  },
  legTweaks: { correctionStrength: 0.3 },
  resetsSettings: defaultResetSettings,
  stayAligned: defaultStayAlignedSettings,
  hidSettings: { trackersOverHID: false },
  velocitySettings: { sendDerivedVelocity: false },
  telemetry: { recordTelemetry: false },
};

/** Full-scale delay of the playback filter types, by server filter id. */
const PLAYBACK_DELAY_MS: Record<number, number> = { 4: 100, 5: 300 };

/** Sets `a.b.c` on a copy of each object along the path, leaving siblings shared. */
function setFormPath(target: object, path: string, value: unknown) {
  const keys = path.split('.');
  let node = target as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    const child = node[key];
    node[key] = Array.isArray(child) ? [...child] : { ...(child as object) };
    node = node[key] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]] = value;
}

const settingsAtom = atom(new SettingsResponseT());
const settingsValueAtom = selectAtom(
  settingsAtom,
  (settings) => settings,
  isEqual
);

export function GeneralSettings() {
  const electron = useElectron();
  const setSettings = useSetAtom(settingsAtom);
  const settings = useAtomValue(settingsValueAtom);
  const { l10n } = useLocalization();
  const { config } = useConfig();
  const { currentLocales } = useLocaleConfig();

  const bodyParts: { value: string; label: string }[] = Object.values(BodyPart)
    .filter((v): v is BodyPart => typeof v === 'number')
    .filter((v) => ASSIGNMENT_MODES['full-body'].includes(v as BodyPart))
    .map((value) => ({
      value: String(value),
      label: l10n.getString(`body_part-${BodyPart[value]}`),
    }));
  const blockHandsWarning = useRef(false);
  // If not null, warning will be shown, and showHandsWarning will
  // hold which hands should be toggled ([leftHand, rightHand])
  const [showHandsWarning, setShowHandsWarning] = useState<
    [boolean, boolean] | null
  >(null);

  const percentageFormat = new Intl.NumberFormat(currentLocales, {
    style: 'percent',
    maximumFractionDigits: 0,
  });
  const secondsFormat = new Intl.NumberFormat(currentLocales, {
    style: 'unit',
    unit: 'second',
    unitDisplay: 'narrow',
    maximumFractionDigits: 2,
  });

  const { sendRPCPacket, useRPCPacket } = useWebsocketAPI();
  const { reset, control, watch, getValues, setValue } = useForm<SettingsForm>({
    defaultValues,
    mode: 'onChange',
    reValidateMode: 'onChange',
  });

  const {
    trackers: { automaticTrackerToggle },
    telemetry,
    filtering: { type: filteringType },
  } = watch();

  const openTelemetryFolder = async () => {
    if (electron.isElectron && electron.api?.openLogsFolder) {
      try {
        await electron.api.openLogsFolder();
      } catch (err) {
        console.error('Failed to open telemetry logs folder:', err);
      }
    }
  };

  useEffect(() => {
    if (
      telemetry?.recordTelemetry !== undefined &&
      typeof window !== 'undefined'
    ) {
      localStorage.setItem(
        'slimevr-telemetry-recording',
        String(telemetry.recordTelemetry)
      );
    }
  }, [telemetry?.recordTelemetry]);

  // `sections` limits the request to the parts of the form that were edited;
  // anything left out is not sent, so the server keeps its own value.
  const onSubmit = (values: SettingsForm, sections?: Set<string>) => {
    const includes = (section: string) => !sections || sections.has(section);
    const settingsReq = new ChangeSettingsRequestT();

    if (values.trackers && includes('trackers')) {
      const trackers = new SteamVRTrackersSettingT();
      trackers.waist = values.trackers.waist;
      trackers.chest = values.trackers.chest;
      trackers.leftFoot = values.trackers.leftFoot;
      trackers.rightFoot = values.trackers.rightFoot;

      trackers.leftKnee = values.trackers.leftKnee;
      trackers.rightKnee = values.trackers.rightKnee;

      trackers.leftElbow = values.trackers.leftElbow;
      trackers.rightElbow = values.trackers.rightElbow;

      trackers.leftHand = values.trackers.leftHand;
      trackers.rightHand = values.trackers.rightHand;

      if (
        !blockHandsWarning.current &&
        !showHandsWarning &&
        !settings.steamVrTrackers?.leftHand &&
        !settings.steamVrTrackers?.rightHand &&
        (trackers.leftHand || trackers.rightHand)
      ) {
        // We have just toggled on one of the hand trackers, show the user a warning
        setShowHandsWarning([trackers.leftHand, trackers.rightHand]);
        trackers.leftHand = false;
        trackers.rightHand = false;
      } else if (
        blockHandsWarning.current &&
        !trackers.leftHand &&
        !trackers.rightHand
      ) {
        // Both hand trackers have just been disabled, make sure the warning shows up
        // again next time the user toggles one back on
        blockHandsWarning.current = false;
      }

      trackers.automaticTrackerToggle = values.trackers.automaticTrackerToggle;
      settingsReq.steamVrTrackers = trackers;
    }

    const modelSettings = new ModelSettingsT();

    if (values.toggles && includes('toggles')) {
      const toggles = new ModelTogglesT();
      toggles.floorClip = values.toggles.floorClip;
      toggles.skatingCorrection = values.toggles.skatingCorrection;
      toggles.extendedKnee = values.toggles.extendedKnee;
      toggles.extendedPelvis = values.toggles.extendedPelvis;
      toggles.extendedSpine = values.toggles.extendedSpine;
      toggles.forceArmsFromHmd = values.toggles.forceArmsFromHmd;
      toggles.toeSnap = values.toggles.toeSnap;
      toggles.footPlant = values.toggles.footPlant;
      toggles.selfLocalization = values.toggles.selfLocalization;
      toggles.usePosition = values.toggles.usePosition;
      toggles.enforceConstraints = values.toggles.enforceConstraints;
      toggles.correctConstraints = values.toggles.correctConstraints;
      modelSettings.toggles = toggles;
    }

    if (values.ratios && includes('ratios')) {
      const ratios = new ModelRatiosT();
      ratios.imputeWaistFromChestHip =
        values.ratios.imputeWaistFromChestHip || -1;
      ratios.imputeWaistFromChestLegs =
        values.ratios.imputeWaistFromChestLegs || -1;
      ratios.imputeHipFromChestLegs =
        values.ratios.imputeHipFromChestLegs || -1;
      ratios.imputeHipFromWaistLegs =
        values.ratios.imputeHipFromWaistLegs || -1;
      ratios.interpHipLegs = values.ratios.interpHipLegs || -1;
      ratios.interpKneeTrackerAnkle =
        values.ratios.interpKneeTrackerAnkle || -1;
      ratios.interpKneeAnkle = values.ratios.interpKneeAnkle || -1;
      modelSettings.ratios = ratios;
    }

    if (values.legTweaks && includes('legTweaks')) {
      const legTweaks = new LegTweaksSettingsT();
      legTweaks.correctionStrength = values.legTweaks.correctionStrength;
      modelSettings.legTweaks = legTweaks;
    }

    if (includes('toggles') || includes('ratios') || includes('legTweaks')) {
      settingsReq.modelSettings = modelSettings;
    }

    if (includes('tapDetection')) {
      const tapDetection = new TapDetectionSettingsT();
      tapDetection.fullResetDelay = values.tapDetection.fullResetDelay;
      tapDetection.fullResetEnabled = values.tapDetection.fullResetEnabled;
      tapDetection.fullResetTaps = values.tapDetection.fullResetTaps;
      tapDetection.yawResetDelay = values.tapDetection.yawResetDelay;
      tapDetection.yawResetEnabled = values.tapDetection.yawResetEnabled;
      tapDetection.yawResetTaps = values.tapDetection.yawResetTaps;
      tapDetection.yawResetTracker = Number(
        values.tapDetection.yawResetTracker
      );
      tapDetection.mountingResetTracker = Number(
        values.tapDetection.mountingResetTracker
      );
      tapDetection.fullResetTracker = Number(
        values.tapDetection.fullResetTracker
      );
      tapDetection.mountingResetEnabled =
        values.tapDetection.mountingResetEnabled;
      tapDetection.mountingResetDelay = values.tapDetection.mountingResetDelay;
      tapDetection.mountingResetTaps = values.tapDetection.mountingResetTaps;
      tapDetection.numberTrackersOverThreshold =
        values.tapDetection.numberTrackersOverThreshold;
      tapDetection.setupMode = false;
      settingsReq.tapDetectionSettings = tapDetection;
    }

    if (includes('filtering')) {
      const filtering = new FilteringSettingsT();
      filtering.type = values.filtering.type;
      filtering.amount = values.filtering.amount;
      settingsReq.filtering = filtering;
    }

    if (includes('stayAligned')) {
      settingsReq.stayAligned = serializeStayAlignedSettings(
        values.stayAligned
      );
    }

    if (includes('hidSettings')) {
      const hidSettings = new HIDSettingsT();
      hidSettings.trackersOverHid = values.hidSettings.trackersOverHID;
      settingsReq.hidSettings = hidSettings;
    }

    if (includes('velocitySettings')) {
      const velocitySettings = new VelocitySettingsT();
      velocitySettings.sendDerivedVelocity =
        values.velocitySettings.sendDerivedVelocity;
      settingsReq.velocitySettings = velocitySettings;
    }

    if (values.resetsSettings && includes('resetsSettings')) {
      settingsReq.resetsSettings = loadResetSettings(values.resetsSettings);
    }

    sendRPCPacket(RpcMessage.ChangeSettingsRequest, settingsReq);
  };

  // An edit is not sent straight from this form, because the form can be out
  // of date (another window, the home screen controls or the server itself may
  // have changed things since it loaded). Each edit is remembered, the server
  // is asked for its current settings, and the edit is applied on top of those.
  const pendingEdits = useRef(new Map<string, unknown>());
  useEffect(() => {
    const subscription = watch((value, { name, type }) => {
      if (type !== 'change' || !name) return;
      pendingEdits.current.set(name, getValues(name));
      sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
  }, []);

  const settingsToFormData = (source: SettingsResponseT) => {
    const formData: DefaultValues<SettingsForm> = {};

    if (source.filtering) {
      formData.filtering = source.filtering;
    }

    if (source.steamVrTrackers) {
      formData.trackers = source.steamVrTrackers;
      if (
        !blockHandsWarning.current &&
        (source.steamVrTrackers.leftHand || source.steamVrTrackers.rightHand)
      ) {
        blockHandsWarning.current = true;
      }
    }

    if (source.modelSettings?.toggles) {
      formData.toggles = Object.keys(source.modelSettings.toggles).reduce(
        (curr, key: string) => ({
          ...curr,
          [key]:
            (source.modelSettings?.toggles &&
              (source.modelSettings.toggles as any)[key]) ||
            false,
        }),
        {}
      );
    }

    if (source.modelSettings?.ratios) {
      formData.ratios = Object.keys(source.modelSettings.ratios).reduce(
        (curr, key: string) => ({
          ...curr,
          [key]:
            (source.modelSettings?.ratios &&
              (source.modelSettings.ratios as any)[key]) ||
            0.0,
        }),
        {}
      );
    }

    if (source.tapDetectionSettings) {
      formData.tapDetection = {
        yawResetEnabled:
          source.tapDetectionSettings.yawResetEnabled ||
          defaultValues.tapDetection.yawResetEnabled,
        fullResetEnabled:
          source.tapDetectionSettings.fullResetEnabled ||
          defaultValues.tapDetection.fullResetEnabled,
        mountingResetEnabled:
          source.tapDetectionSettings.mountingResetEnabled ||
          defaultValues.tapDetection.mountingResetEnabled,
        yawResetDelay:
          source.tapDetectionSettings.yawResetDelay ||
          defaultValues.tapDetection.yawResetDelay,
        fullResetDelay:
          source.tapDetectionSettings.fullResetDelay ||
          defaultValues.tapDetection.fullResetDelay,
        mountingResetDelay:
          source.tapDetectionSettings.mountingResetDelay ||
          defaultValues.tapDetection.mountingResetDelay,
        yawResetTaps:
          source.tapDetectionSettings.yawResetTaps ||
          defaultValues.tapDetection.yawResetTaps,
        fullResetTaps:
          source.tapDetectionSettings.fullResetTaps ||
          defaultValues.tapDetection.fullResetTaps,
        mountingResetTaps:
          source.tapDetectionSettings.mountingResetTaps ||
          defaultValues.tapDetection.mountingResetTaps,
        yawResetTracker: String(
          source.tapDetectionSettings.yawResetTracker ||
            defaultValues.tapDetection.yawResetTracker
        ),
        fullResetTracker: String(
          source.tapDetectionSettings.fullResetTracker ||
            defaultValues.tapDetection.fullResetTracker
        ),
        mountingResetTracker: String(
          source.tapDetectionSettings.mountingResetTracker ||
            defaultValues.tapDetection.mountingResetTracker
        ),
        numberTrackersOverThreshold:
          source.tapDetectionSettings.numberTrackersOverThreshold ||
          defaultValues.tapDetection.numberTrackersOverThreshold,
      };
    }

    if (source.modelSettings?.legTweaks) {
      formData.legTweaks = {
        correctionStrength:
          source.modelSettings.legTweaks.correctionStrength ||
          defaultValues.legTweaks.correctionStrength,
      };
    }

    if (source.resetsSettings) {
      formData.resetsSettings = source.resetsSettings;
    }

    if (source.stayAligned) {
      formData.stayAligned = deserializeStayAlignedSettings(source.stayAligned);
    }

    if (source.hidSettings) {
      formData.hidSettings = {
        trackersOverHID: source.hidSettings.trackersOverHid,
      };
    }

    if (source.velocitySettings) {
      formData.velocitySettings = {
        sendDerivedVelocity: source.velocitySettings.sendDerivedVelocity,
      };
    }

    const storedTelemetry =
      typeof window !== 'undefined'
        ? localStorage.getItem('slimevr-telemetry-recording') === 'true'
        : false;
    formData.telemetry = {
      recordTelemetry: storedTelemetry,
    };

    return formData;
  };

  // Show the last known settings straight away; the request above replaces
  // them as soon as the server answers.
  useEffect(() => {
    reset({ ...getValues(), ...settingsToFormData(settings) });
  }, []);

  useRPCPacket(RpcMessage.SettingsResponse, (response: SettingsResponseT) => {
    setSettings(response);
    const merged = {
      ...getValues(),
      ...settingsToFormData(response),
    } as SettingsForm;

    const edits = pendingEdits.current;
    if (edits.size === 0) {
      reset(merged);
      return;
    }
    pendingEdits.current = new Map();

    const sections = new Set<string>();
    edits.forEach((value, path) => {
      setFormPath(merged, path, value);
      sections.add(path.split('.')[0]);
    });
    reset(merged);
    onSubmit(merged, sections);
  });

  return (
    <SettingsPageLayout>
      <HandsWarningModal
        isOpen={!!showHandsWarning}
        onClose={() => {
          setValue('trackers.leftHand', false);
          setValue('trackers.rightHand', false);
          setShowHandsWarning(null);
        }}
        accept={() => {
          const [leftHand, rightHand] = showHandsWarning!;
          blockHandsWarning.current = true;
          setValue('trackers.leftHand', leftHand);
          setValue('trackers.rightHand', rightHand);
          setShowHandsWarning(null);
        }}
      />
      <form className="flex flex-col gap-2 w-full">
        <SettingsPagePaneLayout icon={<SteamIcon />} id="steamvr">
          <>
            <Typography variant="main-title">
              {l10n.getString('settings-general-steamvr')}
            </Typography>
            <Typography variant="section-title">
              {l10n.getString('settings-general-steamvr-subtitle')}
            </Typography>
            <div className="flex flex-col py-2">
              {l10n
                .getString('settings-general-steamvr-description')
                .split('\n')
                .map((line, i) => (
                  <Typography key={i}>{line}</Typography>
                ))}
            </div>
            <div className="flex flex-col pt-4" />
            <Typography variant="section-title">
              {l10n.getString(
                'settings-general-steamvr-trackers-tracker_toggling'
              )}
            </Typography>
            <div className="flex flex-col pt-2 pb-4">
              {l10n
                .getString(
                  'settings-general-steamvr-trackers-tracker_toggling-description'
                )
                .split('\n')
                .map((line, i) => (
                  <Typography key={i}>{line}</Typography>
                ))}
            </div>
            <CheckBox
              variant="toggle"
              outlined
              control={control}
              name="trackers.automaticTrackerToggle"
              label={l10n.getString(
                'settings-general-steamvr-trackers-tracker_toggling-label'
              )}
            />
            <div className="flex flex-col pt-4" />
            <div className="grid grid-cols-2 gap-x-8">
              <CheckBox
                variant="toggle"
                outlined
                disabled={automaticTrackerToggle}
                control={control}
                name="trackers.chest"
                label={l10n.getString(
                  'settings-general-steamvr-trackers-chest'
                )}
              />
              <CheckBox
                variant="toggle"
                outlined
                disabled={automaticTrackerToggle}
                control={control}
                name="trackers.waist"
                label={l10n.getString(
                  'settings-general-steamvr-trackers-waist'
                )}
              />
              <CheckBox
                variant="toggle"
                outlined
                disabled={automaticTrackerToggle}
                control={control}
                name="trackers.leftKnee"
                label={l10n.getString(
                  'settings-general-steamvr-trackers-left_knee'
                )}
              />
              <CheckBox
                variant="toggle"
                outlined
                disabled={automaticTrackerToggle}
                control={control}
                name="trackers.rightKnee"
                label={l10n.getString(
                  'settings-general-steamvr-trackers-right_knee'
                )}
              />
              <CheckBox
                variant="toggle"
                outlined
                disabled={automaticTrackerToggle}
                control={control}
                name="trackers.leftFoot"
                label={l10n.getString(
                  'settings-general-steamvr-trackers-left_foot'
                )}
              />
              <CheckBox
                variant="toggle"
                outlined
                disabled={automaticTrackerToggle}
                control={control}
                name="trackers.rightFoot"
                label={l10n.getString(
                  'settings-general-steamvr-trackers-right_foot'
                )}
              />
              <CheckBox
                variant="toggle"
                outlined
                disabled={automaticTrackerToggle}
                control={control}
                name="trackers.leftElbow"
                label={l10n.getString(
                  'settings-general-steamvr-trackers-left_elbow'
                )}
              />
              <CheckBox
                variant="toggle"
                outlined
                disabled={automaticTrackerToggle}
                control={control}
                name="trackers.rightElbow"
                label={l10n.getString(
                  'settings-general-steamvr-trackers-right_elbow'
                )}
              />
              <CheckBox
                variant="toggle"
                outlined
                control={control}
                name="trackers.leftHand"
                label={l10n.getString(
                  'settings-general-steamvr-trackers-left_hand'
                )}
              />
              <CheckBox
                variant="toggle"
                outlined
                control={control}
                name="trackers.rightHand"
                label={l10n.getString(
                  'settings-general-steamvr-trackers-right_hand'
                )}
              />
            </div>
          </>
        </SettingsPagePaneLayout>
        <StayAlignedSettings values={getValues()} control={control} />
        <SettingsPagePaneLayout icon={<WrenchIcon />} id="mechanics">
          <>
            <Typography variant="main-title">
              {l10n.getString('settings-general-tracker_mechanics')}
            </Typography>
            <Typography variant="section-title">
              {l10n.getString('settings-general-tracker_mechanics-filtering')}
            </Typography>
            <div className="flex flex-col pt-2 pb-4">
              {l10n
                .getString(
                  'settings-general-tracker_mechanics-filtering-description'
                )
                .split('\n')
                .map((line, i) => (
                  <Typography key={i}>{line}</Typography>
                ))}
            </div>
            <Typography>
              {l10n.getString(
                'settings-general-tracker_mechanics-filtering-type'
              )}
            </Typography>
            <div className="settings-grid gap-3 pt-2">
              <Radio
                control={control}
                name="filtering.type"
                label={l10n.getString(
                  'settings-general-tracker_mechanics-filtering-type-none'
                )}
                description={l10n.getString(
                  'settings-general-tracker_mechanics-filtering-type-none-description'
                )}
                value={FilteringType.NONE.toString()}
              />
              <Radio
                control={control}
                name="filtering.type"
                label={l10n.getString(
                  'settings-general-tracker_mechanics-filtering-type-smoothing'
                )}
                description={l10n.getString(
                  'settings-general-tracker_mechanics-filtering-type-smoothing-description'
                )}
                value={FilteringType.SMOOTHING.toString()}
              />
              <Radio
                control={control}
                name="filtering.type"
                label={l10n.getString(
                  'settings-general-tracker_mechanics-filtering-type-prediction'
                )}
                description={l10n.getString(
                  'settings-general-tracker_mechanics-filtering-type-prediction-description'
                )}
                value={FilteringType.PREDICTION.toString()}
              />
              <Radio
                control={control}
                name="filtering.type"
                label={l10n.getString(
                  'settings-general-tracker_mechanics-filtering-type-adaptive_hybrid'
                )}
                description={l10n.getString(
                  'settings-general-tracker_mechanics-filtering-type-adaptive_hybrid-description'
                )}
                value={(FilteringType.ADAPTIVE_HYBRID ?? 3).toString()}
              />
              <Radio
                control={control}
                name="filtering.type"
                label={l10n.getString(
                  'settings-general-tracker_mechanics-filtering-type-fixed_delay'
                )}
                description={l10n.getString(
                  'settings-general-tracker_mechanics-filtering-type-fixed_delay-description'
                )}
                // Not in the generated protocol enum; the server maps id 4.
                value="4"
              />
              <Radio
                control={control}
                name="filtering.type"
                label={l10n.getString(
                  'settings-general-tracker_mechanics-filtering-type-smooth_playback'
                )}
                description={l10n.getString(
                  'settings-general-tracker_mechanics-filtering-type-smooth_playback-description'
                )}
                // Not in the generated protocol enum; the server maps id 5.
                value="5"
              />
            </div>
            <div className="flex gap-5 pt-5 md:flex-row flex-col">
              <NumberSelector
                control={control}
                name="filtering.amount"
                label={l10n.getString(
                  'settings-general-tracker_mechanics-filtering-amount'
                )}
                valueLabelFormat={(value) => {
                  // The playback filters use Amount as a delay, so show it
                  // in milliseconds: 100 ms and 300 ms at full scale.
                  const delayScale = PLAYBACK_DELAY_MS[Number(filteringType)];
                  return delayScale
                    ? `${Math.round(value * delayScale)} ms`
                    : percentageFormat.format(value);
                }}
                min={0.1}
                max={1.0}
                step={0.1}
              />
            </div>
            <div className="flex gap-5 pt-5 md:flex-row flex-col">
              <NumberSelector
                control={control}
                name="resetsSettings.yawResetSmoothTime"
                label={l10n.getString(
                  'settings-general-tracker_mechanics-yaw-reset-smooth-time'
                )}
                valueLabelFormat={(value) => secondsFormat.format(value)}
                min={0.0}
                max={0.5}
                step={0.05}
              />
            </div>
            <div className="flex flex-col pt-5 pb-3">
              <Typography variant="section-title">
                {l10n.getString('settings-general-dead-tracker-recovery')}
              </Typography>
              <Typography>
                {l10n.getString(
                  'settings-general-dead-tracker-recovery-description'
                )}
              </Typography>
            </div>
            <div className="flex flex-col gap-3">
              <CheckBox
                variant="toggle"
                outlined
                control={control}
                name="resetsSettings.deadTrackerRecoveryEnabled"
                label={l10n.getString(
                  'settings-general-dead-tracker-recovery-enabled'
                )}
              />
              <CheckBox
                variant="toggle"
                outlined
                control={control}
                name="resetsSettings.recoveryChatboxNotifications"
                label={l10n.getString(
                  'settings-general-dead-tracker-recovery-chatbox'
                )}
              />
            </div>
            <div className="flex flex-col pt-5 pb-3">
              <Typography variant="section-title">
                {l10n.getString(
                  'settings-general-tracker_mechanics-save_mounting_reset'
                )}
              </Typography>
              <Localized
                id="settings-general-tracker_mechanics-save_mounting_reset-description"
                elems={{ b: <b /> }}
              >
                <Typography />
              </Localized>
            </div>
            <CheckBox
              variant="toggle"
              outlined
              control={control}
              name="resetsSettings.saveMountingReset"
              label={l10n.getString(
                'settings-general-tracker_mechanics-save_mounting_reset-enabled-label'
              )}
            />
            <MagnetometerToggleSetting
              settingType="general"
              id="mechanics-magnetometer"
            />
            <div className="flex flex-col pt-5 pb-3">
              <Typography variant="section-title">
                {l10n.getString(
                  'settings-general-tracker_mechanics-trackers_over_usb'
                )}
              </Typography>
              <Localized
                id="settings-general-tracker_mechanics-trackers_over_usb-description"
                elems={{ b: <b /> }}
              >
                <Typography />
              </Localized>
            </div>
            <CheckBox
              variant="toggle"
              outlined
              control={control}
              name="hidSettings.trackersOverHID"
              label={l10n.getString(
                'settings-general-tracker_mechanics-trackers_over_usb-enabled-label'
              )}
            />
          </>
        </SettingsPagePaneLayout>
        <SettingsPagePaneLayout icon={<WrenchIcon />} id="fksettings">
          <>
            <Typography variant="main-title">
              {l10n.getString('settings-general-fk_settings')}
            </Typography>
            <div className="flex flex-col pt-2 pb-4 gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Typography variant="section-title">
                  {l10n.getString(
                    'settings-general-fk_settings-leg_tweak-skating_correction'
                  )}
                </Typography>
                <span className="px-2 py-0.5 text-ui-2xs font-medium tracking-wide rounded-full bg-accent-background-20/15 text-accent-background-10 border border-accent-background-20/30">
                  Zero-Slide & Ground Clamp
                </span>
              </div>
              <Typography>
                {l10n.getString(
                  'settings-general-fk_settings-leg_tweak-skating_correction-description'
                )}
              </Typography>
            </div>
            <div className="grid sm:grid-cols-1 gap-2 pb-4">
              <CheckBox
                variant="toggle"
                outlined
                control={control}
                name="toggles.skatingCorrection"
                label={l10n.getString(
                  'settings-general-fk_settings-leg_tweak-skating_correction'
                )}
              />
              <NumberSelector
                control={control}
                name="legTweaks.correctionStrength"
                label={l10n.getString(
                  'settings-general-fk_settings-leg_tweak-skating_correction-amount'
                )}
                valueLabelFormat={(value) => percentageFormat.format(value)}
                min={0.1}
                max={1.0}
                step={0.1}
              />
            </div>

            <div className="flex flex-col pt-2 pb-2">
              <Typography variant="section-title">
                {l10n.getString('settings-general-fk_settings-leg_fk')}
              </Typography>
            </div>
            <div className="grid sm:grid-cols-1 gap-3 pb-3">
              <Typography>
                {l10n.getString(
                  'settings-general-fk_settings-leg_tweak-floor_clip-description'
                )}
              </Typography>
            </div>
            <div className="grid sm:grid-cols-1 gap-2 pb-3">
              <CheckBox
                variant="toggle"
                outlined
                control={control}
                name="toggles.floorClip"
                label={l10n.getString(
                  'settings-general-fk_settings-leg_tweak-floor_clip'
                )}
              />
            </div>
            <div className="flex flex-col pt-2 pb-3">
              <Typography>
                {l10n.getString(
                  'settings-general-fk_settings-leg_tweak-foot_plant-description'
                )}
              </Typography>
            </div>
            <div className="grid sm:grid-cols-1 gap-3 pb-3">
              <CheckBox
                variant="toggle"
                outlined
                control={control}
                name="toggles.footPlant"
                label={l10n.getString(
                  'settings-general-fk_settings-leg_tweak-foot_plant'
                )}
              />
            </div>
            <div className="flex flex-col pt-2 pb-3">
              <Typography>
                {l10n.getString(
                  'settings-general-fk_settings-leg_tweak-toe_snap-description'
                )}
              </Typography>
            </div>
            <div className="grid sm:grid-cols-1 gap-3 pb-3">
              <CheckBox
                variant="toggle"
                outlined
                control={control}
                name="toggles.toeSnap"
                label={l10n.getString(
                  'settings-general-fk_settings-leg_tweak-toe_snap'
                )}
              />
            </div>

            <div className="flex flex-col pt-2 pb-3">
              <Typography variant="section-title">
                {l10n.getString('settings-general-fk_settings-arm_fk')}
              </Typography>
              <Typography>
                {l10n.getString(
                  'settings-general-fk_settings-arm_fk-description'
                )}
              </Typography>
            </div>
            <div className="grid sm:grid-cols-1 pb-3">
              <CheckBox
                variant="toggle"
                outlined
                control={control}
                name="toggles.forceArmsFromHmd"
                label={l10n.getString(
                  'settings-general-fk_settings-arm_fk-force_arms'
                )}
              />
            </div>

            <div className="flex flex-col pt-2">
              <Typography variant="section-title">
                {l10n.getString('settings-general-fk_settings-reset_settings')}
              </Typography>
            </div>
            <div className="flex flex-col pt-2 pb-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-2">
                  <Typography>
                    {l10n.getString(
                      'settings-general-fk_settings-reset_settings-reset_hmd_pitch-description'
                    )}
                  </Typography>
                  <CheckBox
                    variant="toggle"
                    outlined
                    control={control}
                    name="resetsSettings.resetHmdPitch"
                    label={l10n.getString(
                      'settings-general-fk_settings-reset_settings-reset_hmd_pitch'
                    )}
                  />
                </div>
                <div className="flex flex-col gap-2 justify-end">
                  <Typography>
                    {l10n.getString(
                      'settings-general-fk_settings-leg_fk-reset_mounting_feet-description-v1'
                    )}
                  </Typography>
                  <CheckBox
                    variant="toggle"
                    outlined
                    control={control}
                    name="resetsSettings.resetMountingFeet"
                    label={l10n.getString(
                      'settings-general-fk_settings-leg_fk-reset_mounting_feet-v1'
                    )}
                  />
                </div>
              </div>
            </div>

            <div>
              <Typography>
                {l10n.getString(
                  'settings-general-fk_settings-arm_fk-reset_mode-description'
                )}
              </Typography>
              <div className="settings-grid flex-col gap-3 pt-2 pb-3">
                <Radio
                  control={control}
                  name="resetsSettings.armsMountingResetMode"
                  label={l10n.getString(
                    'settings-general-fk_settings-arm_fk-back'
                  )}
                  description={l10n.getString(
                    'settings-general-fk_settings-arm_fk-back-description'
                  )}
                  value={'0'}
                />
                <Radio
                  control={control}
                  name="resetsSettings.armsMountingResetMode"
                  label={l10n.getString(
                    'settings-general-fk_settings-arm_fk-forward'
                  )}
                  description={l10n.getString(
                    'settings-general-fk_settings-arm_fk-forward-description'
                  )}
                  value={'1'}
                />
                <Radio
                  control={control}
                  name="resetsSettings.armsMountingResetMode"
                  label={l10n.getString(
                    'settings-general-fk_settings-arm_fk-tpose_up'
                  )}
                  description={l10n.getString(
                    'settings-general-fk_settings-arm_fk-tpose_up-description'
                  )}
                  value={'2'}
                />
                <Radio
                  control={control}
                  name="resetsSettings.armsMountingResetMode"
                  label={l10n.getString(
                    'settings-general-fk_settings-arm_fk-tpose_down'
                  )}
                  description={l10n.getString(
                    'settings-general-fk_settings-arm_fk-tpose_down-description'
                  )}
                  value={'3'}
                />
              </div>
            </div>

            <div className="flex flex-col pt-2 pb-1">
              <Typography variant="section-title">
                {l10n.getString(
                  'settings-general-fk_settings-enforce_joint_constraints'
                )}
              </Typography>
              <div className="pt-2">
                <Typography>
                  {l10n.getString(
                    'settings-general-fk_settings-enforce_joint_constraints-enforce_constraints-description'
                  )}
                </Typography>
              </div>
            </div>
            <div className="grid sm:grid-cols-1 pb-3">
              <CheckBox
                variant="toggle"
                outlined
                control={control}
                name="toggles.enforceConstraints"
                label={l10n.getString(
                  'settings-general-fk_settings-enforce_joint_constraints-enforce_constraints'
                )}
              />
            </div>

            <div className="flex flex-col pt-2 pb-3">
              <Typography bold>
                {l10n.getString('settings-general-fk_settings-ik')}
              </Typography>
              <Typography color="secondary">
                {l10n.getString(
                  'settings-general-fk_settings-ik-use_position-description'
                )}
              </Typography>
            </div>
            <div className="grid sm:grid-cols-1 pb-3">
              <CheckBox
                variant="toggle"
                outlined
                control={control}
                name="toggles.usePosition"
                label={l10n.getString(
                  'settings-general-fk_settings-ik-use_position'
                )}
              />
            </div>

            <div className="flex flex-col pt-2 pb-1">
              <Typography variant="section-title">
                {l10n.getString(
                  'settings-general-fk_settings-velocity_settings'
                )}
              </Typography>
              <div className="pt-2">
                <Typography>
                  {l10n.getString(
                    'settings-general-fk_settings-velocity_settings-description'
                  )}
                </Typography>
              </div>
            </div>
            <div className="grid sm:grid-cols-1 pb-3">
              <CheckBox
                variant="toggle"
                outlined
                control={control}
                name="velocitySettings.sendDerivedVelocity"
                label={l10n.getString(
                  'settings-general-fk_settings-velocity_settings-send_derived_velocity'
                )}
              />
            </div>

            {config?.debug && (
              <>
                <div className="flex flex-col pt-2 pb-3">
                  <Typography variant="section-title">
                    {l10n.getString(
                      'settings-general-fk_settings-skeleton_settings-toggles'
                    )}
                  </Typography>
                  <Typography>
                    {l10n.getString(
                      'settings-general-fk_settings-skeleton_settings-description'
                    )}
                  </Typography>
                </div>
                <div className="settings-grid gap-3 pb-3">
                  <CheckBox
                    variant="toggle"
                    outlined
                    control={control}
                    name="toggles.extendedSpine"
                    label={l10n.getString(
                      'settings-general-fk_settings-skeleton_settings-extended_spine_model'
                    )}
                  />
                  <CheckBox
                    variant="toggle"
                    outlined
                    control={control}
                    name="toggles.extendedPelvis"
                    label={l10n.getString(
                      'settings-general-fk_settings-skeleton_settings-extended_pelvis_model'
                    )}
                  />
                  <CheckBox
                    variant="toggle"
                    outlined
                    control={control}
                    name="toggles.extendedKnee"
                    label={l10n.getString(
                      'settings-general-fk_settings-skeleton_settings-extended_knees_model'
                    )}
                  />
                </div>
                <div className="flex flex-col">
                  <div className="flex flex-col pt-2 pb-3 gap-2">
                    <Typography variant="section-title">
                      {l10n.getString(
                        'settings-general-fk_settings-skeleton_settings-ratios'
                      )}
                    </Typography>
                    <Typography>
                      {l10n.getString(
                        'settings-general-fk_settings-skeleton_settings-ratios-description'
                      )}
                    </Typography>
                  </div>
                  <div className="settings-grid gap-3 pb-3">
                    <NumberSelector
                      control={control}
                      name="ratios.imputeWaistFromChestHip"
                      label={l10n.getString(
                        'settings-general-fk_settings-skeleton_settings-impute_waist_from_chest_hip'
                      )}
                      valueLabelFormat={(value) =>
                        percentageFormat.format(value)
                      }
                      min={0.0}
                      max={1.0}
                      step={0.05}
                    />
                    <NumberSelector
                      control={control}
                      name="ratios.imputeWaistFromChestLegs"
                      label={l10n.getString(
                        'settings-general-fk_settings-skeleton_settings-impute_waist_from_chest_legs'
                      )}
                      valueLabelFormat={(value) =>
                        percentageFormat.format(value)
                      }
                      min={0.0}
                      max={1.0}
                      step={0.05}
                    />
                    <NumberSelector
                      control={control}
                      name="ratios.imputeHipFromChestLegs"
                      label={l10n.getString(
                        'settings-general-fk_settings-skeleton_settings-impute_hip_from_chest_legs'
                      )}
                      valueLabelFormat={(value) =>
                        percentageFormat.format(value)
                      }
                      min={0.0}
                      max={1.0}
                      step={0.05}
                    />
                    <NumberSelector
                      control={control}
                      name="ratios.imputeHipFromWaistLegs"
                      label={l10n.getString(
                        'settings-general-fk_settings-skeleton_settings-impute_hip_from_waist_legs'
                      )}
                      valueLabelFormat={(value) =>
                        percentageFormat.format(value)
                      }
                      min={0.0}
                      max={1.0}
                      step={0.05}
                    />
                    <NumberSelector
                      control={control}
                      name="ratios.interpHipLegs"
                      label={l10n.getString(
                        'settings-general-fk_settings-skeleton_settings-interp_hip_legs'
                      )}
                      valueLabelFormat={(value) =>
                        percentageFormat.format(value)
                      }
                      min={0.0}
                      max={1.0}
                      step={0.05}
                    />
                    <NumberSelector
                      control={control}
                      name="ratios.interpKneeTrackerAnkle"
                      label={l10n.getString(
                        'settings-general-fk_settings-skeleton_settings-interp_knee_tracker_ankle'
                      )}
                      valueLabelFormat={(value) =>
                        percentageFormat.format(value)
                      }
                      min={0.0}
                      max={1.0}
                      step={0.05}
                    />
                    <NumberSelector
                      control={control}
                      name="ratios.interpKneeAnkle"
                      label={l10n.getString(
                        'settings-general-fk_settings-skeleton_settings-interp_knee_ankle'
                      )}
                      valueLabelFormat={(value) =>
                        percentageFormat.format(value)
                      }
                      min={0.0}
                      max={1.0}
                      step={0.05}
                    />
                  </div>
                </div>
              </>
            )}
            <div className="flex flex-col pt-2 pb-3">
              <Typography variant="section-title">
                {l10n.getString(
                  'settings-general-fk_settings-self_localization-title'
                )}
              </Typography>
              <Typography>
                {l10n.getString(
                  'settings-general-fk_settings-self_localization-description'
                )}
              </Typography>
            </div>
            <div className="grid sm:grid-cols-1 gap3 pb5">
              <CheckBox
                variant="toggle"
                outlined
                control={control}
                name="toggles.selfLocalization"
                label={l10n.getString(
                  'settings-general-fk_settings-self_localization-title'
                )}
              />
            </div>
          </>
        </SettingsPagePaneLayout>

        <SettingsPagePaneLayout icon={<WrenchIcon />} id="gestureControl">
          <>
            <Typography variant="main-title">
              {l10n.getString('settings-general-gesture_control')}
            </Typography>

            <div className="flex flex-col pt-2 pb-4 gap-2">
              <Typography variant="section-title">
                {l10n.getString('settings-general-gesture_control-subtitle')}
              </Typography>
              <Typography>
                {l10n.getString('settings-general-gesture_control-description')}
              </Typography>
            </div>
            <div className="settings-grid [--settings-grid-cols:3] [--settings-grid-min:14rem] gap-3 pb-2">
              {(
                [
                  ['yaw', 'reset-yaw'],
                  ['full', 'reset-full'],
                  ['mounting', 'reset-mounting'],
                ] as const
              ).map(([kind, titleKey]) => (
                <div
                  key={kind}
                  className="flex flex-col gap-3 rounded-[14px] border border-background-50/50 dark:border-background-10/[0.07] bg-background-60/35 dark:bg-background-10/[0.025] px-4 pb-4 pt-1"
                >
                  <CheckBox
                    variant="toggle"
                    outlined
                    control={control}
                    name={`tapDetection.${kind}ResetEnabled`}
                    label={l10n.getString(titleKey)}
                  />
                  <div>
                    <Typography bold>
                      {l10n.getString(
                        `settings-general-gesture_control-${kind}ResetTracker`
                      )}
                    </Typography>
                    <Dropdown
                      display="block"
                      control={control}
                      placeholder={''}
                      name={`tapDetection.${kind}ResetTracker`}
                      items={bodyParts}
                    />
                  </div>
                  <NumberSelector
                    control={control}
                    name={`tapDetection.${kind}ResetDelay`}
                    label={l10n.getString(
                      `settings-general-gesture_control-${kind}ResetDelay`
                    )}
                    valueLabelFormat={(value) => secondsFormat.format(value)}
                    min={0.2}
                    max={3.0}
                    step={0.2}
                  />
                  <NumberSelector
                    control={control}
                    name={`tapDetection.${kind}ResetTaps`}
                    label={l10n.getString(
                      `settings-general-gesture_control-${kind}ResetTaps`
                    )}
                    valueLabelFormat={(value) =>
                      l10n.getString('settings-general-gesture_control-taps', {
                        amount: Math.round(value),
                      })
                    }
                    min={2}
                    max={10}
                    step={1}
                  />
                </div>
              ))}
            </div>
            <div className="grid sm:grid-cols-1 gap-2 pt-2">
              <Typography variant="section-title">
                {l10n.getString(
                  'settings-general-gesture_control-numberTrackersOverThreshold'
                )}
              </Typography>
              <Typography>
                {l10n.getString(
                  'settings-general-gesture_control-numberTrackersOverThreshold-description'
                )}
              </Typography>
              <NumberSelector
                control={control}
                name="tapDetection.numberTrackersOverThreshold"
                label={l10n.getString(
                  'settings-general-gesture_control-numberTrackersOverThreshold'
                )}
                valueLabelFormat={(value) =>
                  l10n.getString('settings-general-gesture_control-trackers', {
                    amount: Math.round(value),
                  })
                }
                min={1}
                max={20}
                step={1}
              />
            </div>
          </>
        </SettingsPagePaneLayout>
        <SettingsPagePaneLayout icon={<RecordIcon />} id="telemetry">
          <>
            <div className="flex justify-between items-center">
              <Typography variant="main-title">
                Session Telemetry & Drift Logging
              </Typography>
              {telemetry?.recordTelemetry && (
                <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-status-critical/20 text-status-critical font-medium animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-status-critical" />
                  Recording Active
                </span>
              )}
            </div>

            <div className="flex flex-col pt-2 pb-4 gap-1">
              <Typography variant="section-title">
                Background Telemetry Export
              </Typography>
              <Typography color="secondary">
                Continuously logs high-rate IMU orientations, angular
                velocities, reset intervals, and learned drift metrics to CSV
                for offline analysis, calibration tuning, or research.
              </Typography>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-background-80 p-4 rounded-lg">
                <div className="flex flex-col gap-1 max-w-[70%]">
                  <Typography bold>Record Tracker Telemetry</Typography>
                  <Typography color="secondary">
                    When enabled, logs per-tracker IMU rotation, drift duration,
                    and learning rates to logs/telemetry/.
                  </Typography>
                </div>
                <CheckBox
                  variant="toggle"
                  outlined
                  control={control}
                  name="telemetry.recordTelemetry"
                  label=""
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 bg-background-80 p-4 rounded-lg">
                <div className="flex flex-col gap-1">
                  <Typography bold>Session Export Directory</Typography>
                  <Typography color="secondary">
                    View generated CSV telemetry files and historical drift
                    session logs.
                  </Typography>
                </div>
                <Button
                  variant="secondary"
                  className="flex items-center gap-2 self-start"
                  onClick={openTelemetryFolder}
                >
                  <FolderIcon />
                  Open Telemetry Folder
                </Button>
              </div>
            </div>
          </>
        </SettingsPagePaneLayout>
      </form>
    </SettingsPageLayout>
  );
}
