import { useState } from 'react';
import { RpcMessage, HeartbeatRequestT } from 'solarxr-protocol';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { Typography } from '@/components/commons/Typography';
import classNames from 'classnames';
import { Tooltip } from '@/components/commons/Tooltip';

export function RefreshTrackersButton() {
  const { sendRPCPacket } = useWebsocketAPI();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (refreshing) return;
    setRefreshing(true);
    sendRPCPacket(RpcMessage.HeartbeatRequest, new HeartbeatRequestT());
    setTimeout(() => {
      setRefreshing(false);
    }, 1200);
  };

  return (
    <Tooltip
      preferedDirection="bottom"
      spacing={6}
      content={
        <Typography className="text-ui-2xs font-medium">
          Scan for Trackers: Broadcast discovery probe without resetting
          calibrations
        </Typography>
      }
    >
      <button
        type="button"
        style={{ WebkitAppRegion: 'no-drag' } as any}
        onClick={handleRefresh}
        disabled={refreshing}
        className={classNames(
          'apple-interactive flex items-center gap-1.5 text-ui-2xs tnum font-medium rounded-[8px] px-2.5 py-1 cursor-pointer select-none',
          refreshing
            ? 'border-accent-background-20/50 text-[#EB8E70]'
            : 'text-background-20 hover:text-background-10'
        )}
      >
        <svg
          className={classNames(
            'w-3.5 h-3.5',
            refreshing && 'animate-spin text-accent-background-10'
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        <span>{refreshing ? 'Scanning...' : 'Scan'}</span>
      </button>
    </Tooltip>
  );
}
