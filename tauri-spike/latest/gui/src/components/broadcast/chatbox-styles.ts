import { useCallback, useState } from 'react';

// Chatbox line styles. To add one: add a key + label + formatter here.
// Streams and some radio tracks report no duration, so formatters get dur=0.

type MusicArgs = { track?: string; artist?: string; pos?: number; dur?: number };

const TITLE_MAX = 60;
const SEGMENTS = 10;

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

const cut = (s: string) =>
  s.length > TITLE_MAX ? `${s.slice(0, TITLE_MAX - 1).trimEnd()}…` : s;

const fill = (progress: number, on: string, off: string) => {
  const n = Math.round(Math.min(1, Math.max(0, progress)) * SEGMENTS);
  return on.repeat(n) + off.repeat(SEGMENTS - n);
};

const knobBar = (progress: number, left: string, knob: string, right: string) => {
  const k = Math.min(SEGMENTS - 1, Math.floor(progress * SEGMENTS));
  return left.repeat(k) + knob + right.repeat(SEGMENTS - 1 - k);
};

export const MUSIC_STYLES = {
  classic: {
    label: 'Classic  ♫ title, 1:25 ━◉── 4:28',
    format: ({ track, artist, pos = 0, dur = 0 }: MusicArgs) => {
      const title = cut([track, artist].filter(Boolean).join(' • '));
      if (dur <= 0) return `♫ ${title}`;
      const p = pos / dur;
      return `♫ ${title}\n${clock(pos)} ${knobBar(p, '━', '◉', '─')} ${clock(dur)}`;
    },
  },
  oneline: {
    label: 'One line  ♫ title 1:25/4:28 ▰▰▱▱',
    format: ({ track, artist, pos = 0, dur = 0 }: MusicArgs) => {
      const title = cut([track, artist].filter(Boolean).join(' • '));
      if (dur <= 0) return `♫ ${title}`;
      return `♫ ${title}  ${clock(pos)}/${clock(dur)} ${fill(pos / dur, '▰', '▱')}`;
    },
  },
  block: {
    label: 'Block bar  ▶ title, ▰▰▰▱▱ 1:25 / 4:28',
    format: ({ track, artist, pos = 0, dur = 0 }: MusicArgs) => {
      const title = cut([track, artist].filter(Boolean).join(' • '));
      if (dur <= 0) return `▶ ${title}`;
      return `▶ ${title}\n${fill(pos / dur, '▰', '▱')} ${clock(pos)} / ${clock(dur)}`;
    },
  },
  remaining: {
    label: 'Countdown  Now playing, ▓▓░░ -3:03',
    format: ({ track, artist, pos = 0, dur = 0 }: MusicArgs) => {
      const lines = [`Now playing: ${cut(track ?? '')}`];
      if (artist) lines.push(artist);
      if (dur > 0) lines.push(`${fill(pos / dur, '▓', '░')} -${clock(dur - pos)}`);
      return lines.join('\n');
    },
  },
  equalizer: {
    label: 'Equalizer  ▂▅▇▅▃ title, shifting bars',
    format: ({ track, artist, pos = 0, dur = 0 }: MusicArgs) => {
      const title = cut([track, artist].filter(Boolean).join(' • '));
      const frames = ['▂▅▇▅▃', '▃▇▅▂▅', '▅▃▂▇▅', '▇▅▃▅▂'];
      const eq = frames[Math.floor(pos / 5) % frames.length];
      if (dur <= 0) return `${eq} ${title}`;
      return `${eq} ${title}\n${clock(pos)} ${knobBar(pos / dur, '─', '◉', '─')} ${clock(dur)}`;
    },
  },
} as const;

export const HEART_STYLES = {
  emoji: { label: '❤️ 71', format: (bpm: number) => `❤️ ${bpm}` },
  glyph: { label: '♥ 71', format: (bpm: number) => `♥ ${bpm}` },
  outline: { label: '♡ 71', format: (bpm: number) => `♡ ${bpm}` },
  pulse: { label: '💓 71 BPM', format: (bpm: number) => `💓 ${bpm} BPM` },
  trailing: { label: '71 BPM ♥', format: (bpm: number) => `${bpm} BPM ♥` },
} as const;

export type MusicStyleKey = keyof typeof MUSIC_STYLES;
export type HeartStyleKey = keyof typeof HEART_STYLES;

/** A string setting remembered in localStorage, restricted to known keys. */
function useStoredChoice<K extends string>(
  storageKey: string,
  allowed: readonly K[],
  fallback: K
): [K, (value: K) => void] {
  const [value, setValue] = useState<K>(() => {
    try {
      const saved = localStorage.getItem(storageKey) as K | null;
      if (saved && allowed.includes(saved)) return saved;
    } catch {
      // ignore
    }
    return fallback;
  });
  const set = useCallback(
    (next: K) => {
      setValue(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // ignore
      }
    },
    [storageKey]
  );
  return [value, set];
}

export const useMusicStyle = () =>
  useStoredChoice<MusicStyleKey>(
    'slimevr-music-style-v1',
    Object.keys(MUSIC_STYLES) as MusicStyleKey[],
    'classic'
  );

export const useHeartStyle = () =>
  useStoredChoice<HeartStyleKey>(
    'slimevr-heart-style-v1',
    Object.keys(HEART_STYLES) as HeartStyleKey[],
    'emoji'
  );
