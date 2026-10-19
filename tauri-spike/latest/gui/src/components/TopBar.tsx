import { ReactNode, useContext, useState } from 'react';

import { useLocalization } from '@fluent/react';
import { useAtomValue } from 'jotai';
import classNames from 'classnames';
import { GH_REPO, VersionContext } from '@/App';
import { useConfig } from '@/hooks/config';
import { openUrl } from '@/hooks/crossplatform';
import { useElectron } from '@/hooks/electron';
import { useIsMac } from '@/hooks/platform';
import { connectedIMUCountAtom } from '@/store/app-store';
import { ChatboxDropdown } from './broadcast/ChatboxDropdown';
import { QuestDiagnosticsCard } from './home/QuestDiagnosticsCard';
import { DonglePill } from './dongle/DongleStats';
import { CloseIcon } from './commons/icon/CloseIcon';
import { DownloadIcon } from './commons/icon/DownloadIcon';
import { MaximiseIcon } from './commons/icon/MaximiseIcon';
import { MinimiseIcon } from './commons/icon/MinimiseIcon';
import { IconButton } from './commons/IconButton';
import { ProgressBar } from './commons/ProgressBar';
import { HardRebootButton } from './shell/HardRebootButton';
import { ServerRestartButton } from './shell/ServerRestartButton';
import { StatusCluster } from './shell/StatusCluster';
import { ThemeModeToggle } from './shell/ThemeModeToggle';
import { VersionTag } from './shell/VersionTag';
import { TrackersStillOnModal } from './TrackersStillOnModal';
import { TrayOrExitModal } from './TrayOrExitModal';

export function TopBar({
  progress,
  hideStatus,
}: {
  children?: ReactNode;
  progress?: number;
  /** Hides the server status and Broadcast, e.g. on the welcome tab. */
  hideStatus?: boolean;
}) {
  const { l10n } = useLocalization();
  const electron = useElectron();
  const isMac = useIsMac();
  const connectedIMUCount = useAtomValue(connectedIMUCountAtom);
  const { config, setConfig, saveConfig } = useConfig();
  const version = useContext(VersionContext);
  const [showTrayOrExitModal, setShowTrayOrExitModal] = useState(false);
  const [showConnectedTrackersWarning, setConnectedTrackerWarning] =
    useState(false);

  const closeApp = async () => {
    if (!electron.isElectron) return;
    await saveConfig();
    electron.api.close();
  };

  const tryCloseApp = async (dontTray = false) => {
    if (!electron.isElectron) throw 'no electron';

    if (config?.useTray === null) {
      setShowTrayOrExitModal(true);
      return;
    }

    if (config?.useTray && !dontTray) {
      electron.api.hide();
    } else if (config?.connectedTrackersWarning && connectedIMUCount > 0) {
      setConnectedTrackerWarning(true);
    } else {
      await closeApp();
    }
  };

  return (
    <>
      <header className="relative z-[65] flex flex-col">
        <div
          className={classNames(
            // Wraps onto a second line in narrow windows (high zoom) so every button stays visible.
            'z-40 flex min-h-[46px] select-none flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[var(--material-border-subtle)] bg-background-80 py-1.5 pr-3',
            'pl-4'
          )}
          style={{ WebkitAppRegion: 'drag' } as any}
          data-electron-drag-region
        >
          {!hideStatus && (
            <>
              <StatusCluster />
              <ChatboxDropdown variant="top" />
              <QuestDiagnosticsCard />
              <DonglePill />
            </>
          )}

          <div
            className="h-full min-w-0 flex-1"
            style={{ WebkitAppRegion: 'drag' } as any}
            data-electron-drag-region
          />

          <div
            style={{ WebkitAppRegion: 'no-drag' } as any}
            className="flex shrink-0 items-center gap-1"
          >
            {version && electron.isElectron && (
              <IconButton
                label={l10n.getString(
                  'topbar-download-update',
                  null,
                  'Download the latest version'
                )}
                onClick={() => {
                  const url =
                    electron.data().os.type === 'windows'
                      ? 'https://slimevr.dev/download'
                      : `https://github.com/${GH_REPO}/releases/latest`;
                  openUrl(url);
                }}
              >
                <DownloadIcon />
              </IconButton>
            )}
            <VersionTag />
            <ThemeModeToggle />
            <HardRebootButton />
            <ServerRestartButton />

            {electron.isElectron && !isMac && (
              <div className="ml-1 flex items-center gap-1">
                <IconButton
                  label={l10n.getString(
                    'topbar-window-minimize',
                    null,
                    'Minimize window'
                  )}
                  onClick={() => electron.api.minimize()}
                >
                  <MinimiseIcon />
                </IconButton>
                <IconButton
                  label={l10n.getString(
                    'topbar-window-maximize',
                    null,
                    'Maximize window'
                  )}
                  onClick={() => electron.api.toggleMaximize()}
                >
                  <MaximiseIcon />
                </IconButton>
                <IconButton
                  label={l10n.getString(
                    'topbar-window-close',
                    null,
                    'Close window'
                  )}
                  onClick={() => tryCloseApp()}
                >
                  <CloseIcon />
                </IconButton>
              </div>
            )}
          </div>
        </div>
        {progress !== undefined && (
          <div className="mb-2 flex h-6 flex-col justify-center gap-2 border-b border-accent-background-30 px-2">
            <ProgressBar progress={progress} height={3} parts={3} />
          </div>
        )}
      </header>
      {electron.isElectron && (
        <TrayOrExitModal
          isOpen={showTrayOrExitModal}
          accept={async (useTray) => {
            await setConfig({ useTray });
            setShowTrayOrExitModal(false);

            // Doing this in here just in case config doesn't get updated in time
            if (useTray) {
              electron.api.minimize();
              // await invoke('update_tray_text');
            } else if (
              config?.connectedTrackersWarning &&
              connectedIMUCount > 0
            ) {
              setConnectedTrackerWarning(true);
            } else {
              await closeApp();
            }
          }}
          cancel={() => setShowTrayOrExitModal(false)}
        />
      )}
      <TrackersStillOnModal
        isOpen={showConnectedTrackersWarning}
        accept={() => closeApp()}
        cancel={() => {
          setConnectedTrackerWarning(false);
        }}
      />
    </>
  );
}
