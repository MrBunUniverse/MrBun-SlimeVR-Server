import { useMemo } from 'react';
import { AssignMode, useConfig } from './config';
import { useLocalization } from '@fluent/react';
import { useAtomValue } from 'jotai';
import { connectedIMUTrackersAtom } from '@/store/app-store';

export interface TrackerPreset {
  id: string;
  mode: AssignMode;
  name: string;
  description: string;
  targetCount: number;
}

export const PRESET_DEFINITIONS: {
  mode: AssignMode;
  count: number;
  labelKey: string;
  defaultName: string;
  defaultDesc: string;
}[] = [
  {
    mode: AssignMode.LowerBody,
    count: 5,
    labelKey: 'lower-body',
    defaultName: 'Lower-Body Set',
    defaultDesc: 'Minimum for VR full-body tracking',
  },
  {
    mode: AssignMode.Core,
    count: 6,
    labelKey: 'core',
    defaultName: 'Core Set',
    defaultDesc: '+ Enhanced spine tracking',
  },
  {
    mode: AssignMode.EnhancedCore,
    count: 8,
    labelKey: 'enhanced-core',
    defaultName: 'Enhanced Core Set',
    defaultDesc: '+ Foot rotation',
  },
  {
    mode: AssignMode.FullBody,
    count: 10,
    labelKey: 'full-body',
    defaultName: 'Full-Body Set',
    defaultDesc: '+ Elbow tracking',
  },
  {
    mode: AssignMode.All,
    count: 20,
    labelKey: 'all',
    defaultName: 'All Trackers',
    defaultDesc: 'All available tracker assignments',
  },
];

export function useTrackerPresets() {
  const { config, setConfig } = useConfig();
  const { l10n } = useLocalization();
  const connectedTrackers = useAtomValue(connectedIMUTrackersAtom);

  const presets: TrackerPreset[] = useMemo(() => {
    return PRESET_DEFINITIONS.map((def) => {
      const name = l10n
        ? l10n.getString('onboarding-assign_trackers-option-label', {
            mode: def.labelKey,
          }) || def.defaultName
        : def.defaultName;
      const description = l10n
        ? l10n.getString('onboarding-assign_trackers-option-description', {
            mode: def.labelKey,
          }) || def.defaultDesc
        : def.defaultDesc;

      return {
        id: def.mode,
        mode: def.mode,
        name,
        description,
        targetCount: def.count,
      };
    });
  }, [l10n]);

  // Determine active preset mode:
  // If config.assignMode is set, use it; otherwise pick preferred based on connected tracker count or fallback to LowerBody
  const activeMode: AssignMode = useMemo(() => {
    if (config?.assignMode) return config.assignMode;
    const found = PRESET_DEFINITIONS.find(
      (def) => def.count >= connectedTrackers.length
    );
    return found ? found.mode : AssignMode.LowerBody;
  }, [config?.assignMode, connectedTrackers.length]);

  const activePreset = useMemo(() => {
    return presets.find((p) => p.mode === activeMode) || presets[0];
  }, [presets, activeMode]);

  const setActivePresetId = (idOrMode: string | AssignMode) => {
    const target = PRESET_DEFINITIONS.find(
      (def) => def.mode === idOrMode || def.labelKey === idOrMode
    );
    if (target) {
      setConfig({ assignMode: target.mode });
    }
  };

  return {
    presets,
    activePreset,
    activePresetId: activeMode,
    setActivePresetId,
  };
}
