import { useEffect, useRef, useState } from 'react';
import {
  RpcMessage,
  ChangeSettingsRequestT,
  SettingsRequestT,
  SettingsResponseT,
  VRCOSCSettingsT,
  OSCSettingsT,
} from 'solarxr-protocol';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { Typography } from '@/components/commons/Typography';
import classNames from 'classnames';
import { Tooltip } from '@/components/commons/Tooltip';

export function QuestTargetIPPill() {
  const { sendRPCPacket, useRPCPacket } = useWebsocketAPI();
  const [questIp, setQuestIp] = useState<string>('192.168.0.106');
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
  }, []);

  useRPCPacket(RpcMessage.SettingsResponse, (settings: SettingsResponseT) => {
    if (settings.vrcOsc?.oscSettings?.address) {
      setQuestIp(settings.vrcOsc.oscSettings.address.toString());
    }
  });

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputValue(questIp);
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  };

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (trimmed && trimmed !== questIp) {
      setQuestIp(trimmed);
      const settings = new ChangeSettingsRequestT();
      const vrcOsc = new VRCOSCSettingsT();
      const oscSettings = new OSCSettingsT();
      oscSettings.enabled = true;
      oscSettings.address = trimmed;
      oscSettings.portOut = 9000;
      oscSettings.portIn = 9001;
      vrcOsc.oscSettings = oscSettings;
      vrcOsc.oscqueryEnabled = true;
      settings.vrcOsc = vrcOsc;
      sendRPCPacket(RpcMessage.ChangeSettingsRequest, settings);

      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div
        style={{ WebkitAppRegion: 'no-drag' } as any}
        className="flex items-center gap-1 bg-background-80 border border-status-success/50 rounded-lg px-1.5 py-0.5 shadow-md"
      >
        <span className="text-ui-2xs uppercase font-bold text-status-success">
          Quest:
        </span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="w-28 bg-transparent text-ui-2xs font-mono font-semibold text-background-10 focus:outline-none border-b border-status-success px-1 py-0"
          placeholder="192.168.0.xxx"
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="text-ui-2xs px-1.5 py-0.5 rounded bg-status-success text-white font-medium hover:bg-status-success transition-colors cursor-pointer"
        >
          Set
        </button>
      </div>
    );
  }

  return (
    <Tooltip
      preferedDirection="bottom"
      spacing={6}
      content={
        <Typography className="text-ui-2xs font-medium">
          Click to change Quest / VRChat target network address (Currently:{' '}
          {questIp})
        </Typography>
      }
    >
      <div
        style={{ WebkitAppRegion: 'no-drag' } as any}
        onClick={handleStartEdit}
        className={classNames(
          'apple-interactive flex items-center gap-1.5 text-ui-2xs tnum font-medium rounded-[8px] px-2.5 py-1 cursor-pointer select-none',
          saved
            ? 'border-status-success/40 text-status-success'
            : 'text-background-20 hover:text-background-10'
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-status-success shrink-0" />
        <span className="text-ui-2xs uppercase font-semibold text-background-30 tracking-wide">
          Quest:
        </span>
        <span className="font-medium text-background-10">{questIp}</span>
      </div>
    </Tooltip>
  );
}
