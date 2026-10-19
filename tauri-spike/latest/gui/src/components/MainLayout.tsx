import classNames from 'classnames';
import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  LegTweaksTmpChangeT,
  LegTweaksTmpClearT,
  RpcMessage,
  SettingsRequestT,
} from 'solarxr-protocol';
import { TopBar } from './TopBar';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import './MainLayout.scss';
import { Toolbar } from './Toolbar';
import { TrackingChecklistMobile } from './tracking-checklist/TrackingChecklist';
import { useTrackingChecklist } from '@/hooks/tracking-checklist';

export function MainLayout({
  children,
  background = true,
  full = false,
  isMobile = undefined,
}: {
  children: ReactNode;
  background?: boolean;
  isMobile?: boolean;
  showToolbarSettings?: boolean;
  full?: boolean;
}) {
  const location = useLocation();
  const { completion } = useTrackingChecklist();
  const { sendRPCPacket } = useWebsocketAPI();
  const [ProportionsLastPageOpen, setProportionsLastPageOpen] = useState(true);

  useEffect(() => {
    sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
  }, []);

  function usePageChanged(callback: () => void) {
    useEffect(() => {
      callback();
    }, [location.pathname]);
  }

  usePageChanged(() => {
    if (location.pathname.includes('body-proportions')) {
      const tempSettings = new LegTweaksTmpChangeT();
      tempSettings.skatingCorrection = false;
      tempSettings.floorClip = false;
      tempSettings.toeSnap = false;
      tempSettings.footPlant = false;

      sendRPCPacket(RpcMessage.LegTweaksTmpChange, tempSettings);
    } else if (ProportionsLastPageOpen) {
      const resetSettings = new LegTweaksTmpClearT();
      resetSettings.skatingCorrection = true;
      resetSettings.floorClip = true;
      resetSettings.toeSnap = true;
      resetSettings.footPlant = true;

      sendRPCPacket(RpcMessage.LegTweaksTmpClear, resetSettings);
    }
    setProportionsLastPageOpen(location.pathname.includes('body-proportions'));
  });

  return (
    <div
      className={classNames('main-layout w-full h-full', {
        'checklist-ok': completion === 'complete',
      })}
    >
      <div style={{ gridArea: 't' }}>
        <TopBar />
      </div>

      <div
        style={{ gridArea: 'c' }}
        className={classNames(
          'overflow-hidden mx-2 my-2 mobile:m-0 min-w-0 min-h-0 h-full',
          'flex flex-col rounded-2xl transition-[background-color,border-radius,box-shadow] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]',
          background && 'glass-panel'
        )}
      >
        {children}
      </div>
      {full && isMobile && completion !== 'complete' && (
        <TrackingChecklistMobile />
      )}
      <div style={{ gridArea: 's' }} className="hidden" />
      {full && (
        <div style={{ gridArea: 'b' }}>
          <Toolbar />
        </div>
      )}
    </div>
  );
}
