import { useState, useCallback, useMemo } from 'react';
import { useHeartRate } from './adaptive-bpm';
import { DEFAULT_PROFILE, HeartProfile } from '@/utils/adaptive-bpm';

const STORAGE_KEY_ENABLED = 'slimevr-fake-bpm-enabled';
// Left over from the removed fixed presets; cleared so it can't come back.
const OLD_STORAGE_KEYS = ['slimevr-fake-bpm-preset', 'slimevr-fake-bpm-show-situation'];
const STORAGE_KEY_PROFILE = 'slimevr-fake-bpm-profile';

function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Settings just won't persist
  }
}

function loadProfile(): HeartProfile {
  for (const key of OLD_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing saved
    }
  }
  try {
    const saved = JSON.parse(stored(STORAGE_KEY_PROFILE) ?? 'null');
    if (Number.isFinite(saved?.restingBpm) && Number.isFinite(saved?.age)) return saved;
  } catch {
    // fall through to the default
  }
  return DEFAULT_PROFILE;
}

export function useFakeBpm() {
  const [enabled, setEnabledState] = useState(() => stored(STORAGE_KEY_ENABLED) === 'true');
  const [profile, setProfileState] = useState(loadProfile);

  const heart = useHeartRate(enabled, profile);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    store(STORAGE_KEY_ENABLED, String(next));
  }, []);

  const setProfile = useCallback((next: HeartProfile) => {
    const clean = {
      restingBpm: Math.round(Math.min(100, Math.max(40, next.restingBpm))),
      age: Math.round(Math.min(90, Math.max(10, next.age))),
    };
    setProfileState(clean);
    store(STORAGE_KEY_PROFILE, JSON.stringify(clean));
  }, []);

  const bpm = heart.bpm;
  const zone =
    bpm < profile.restingBpm + 2
      ? 'resting'
      : bpm < profile.restingBpm + 20
        ? 'normal'
        : bpm < 208 - 0.7 * profile.age - 50
          ? 'elevated'
          : 'cardio';

  const formattedBpmText = useMemo(
    () => (enabled && heart.available ? `❤️ ${bpm}` : ''),
    [enabled, heart.available, bpm]
  );

  return {
    enabled,
    setEnabled,
    profile,
    setProfile,
    currentBpm: bpm,
    history: heart.history,
    available: heart.available,
    adaptive: heart,
    zone,
    activityLabel: heart.activity,
    formattedBpmText,
  };
}
