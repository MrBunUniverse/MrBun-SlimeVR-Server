import { useElectron } from './electron';

/** True when running on macOS (Electron or a browser on a Mac). */
export function useIsMac(): boolean {
  const electron = useElectron();
  return (
    (electron.isElectron && electron.data()?.os?.type === 'macos') ||
    (typeof navigator !== 'undefined' && /Mac|Macintosh/i.test(navigator.userAgent))
  );
}
