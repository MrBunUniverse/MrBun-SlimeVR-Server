import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';
import { StatusDot } from '@/components/commons/StatusDot';

// The dongle bridge (tools/esp32-dongle/bridge.py) serves its stats here.
const STATS_URL = 'http://127.0.0.1:6970';

interface DongleTracker {
  id: number;
  ip: string;
  pps: number;
  total: number;
  age_ms: number;
  gap_max_ms: number;
  rtt_min: number | null;
  rtt_avg: number | null;
  rtt_max: number | null;
  hiccups: number;
  spikes: number;
}

interface DongleEvent {
  t: number;
  tracker: number;
  kind: 'hiccup' | 'spike';
  ms: number;
}

interface DongleSnapshot {
  time: number;
  port: string;
  baud: number;
  up: number;
  down: number;
  bad_frames: number;
  link_in: number;
  esp32: Record<string, number | string>;
  trackers: DongleTracker[];
  events: DongleEvent[];
}

/** Polls the bridge twice a second; null when the bridge is not running. */
export function useDongleStats() {
  const [snap, setSnap] = useState<DongleSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(STATS_URL, { cache: 'no-store' });
        const data = await res.json();
        if (alive) setSnap(data.time ? data : null);
      } catch {
        if (alive) setSnap(null);
      }
    };
    poll();
    const id = setInterval(poll, 500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return snap;
}

/** Header pill that opens the dongle stats as a popup, like Broadcast (same classes, so the same look and placement).
 *  The dot shows whether the bridge is reachable. Closes on an outside click or Esc. */
export function DonglePill() {
  const snap = useDongleStats();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(58);

  // Sits just under the pill, which moves down when the top bar wraps in narrow windows.
  useEffect(() => {
    if (!open) return;
    const place = () => setTop((rootRef.current?.getBoundingClientRect().bottom ?? 50) + 8);
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      rootRef.current?.querySelector('button')?.focus();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={classNames(
        'chatbox-control chatbox-control--top relative flex shrink-0 items-center',
        open && 'chatbox-control--open'
      )}
      style={{ WebkitAppRegion: 'no-drag' } as any}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="ESP32 dongle stats"
        className={classNames(
          'flex h-8 cursor-pointer select-none items-center gap-2 rounded-[10px] border border-[var(--material-border-subtle)] px-3 text-ui-xs font-medium',
          open
            ? 'bg-accent-background-20/[0.12] text-accent-background-10'
            : 'text-background-10 hover:bg-background-10/[0.06]'
        )}
      >
        <StatusDot
          tone={snap ? 'ok' : 'idle'}
          label={snap ? `Dongle ${snap.trackers.length}` : 'Dongle'}
        />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="ESP32 dongle stats"
          className="chatbox-panel chatbox-panel--open"
          style={{
            // Pinned inside the window at any zoom; the body scrolls when it is taller.
            position: 'fixed',
            top,
            right: 10,
            left: 'auto',
            width: 'min(560px, calc(100vw - 20px))',
            maxHeight: `calc(100dvh - ${top + 10}px)`,
          }}
        >
          <div className="chatbox-header flex items-center">
            <span className="chatbox-title text-background-10">
              ESP32 dongle
            </span>
          </div>
          <div className="chatbox-body flex min-h-0 flex-1 flex-col">
            <DongleStatsPanel snap={snap} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] bg-background-70 px-3 py-2.5">
      <span className="text-ui-2xs text-background-30">{label}</span>
      <span className={classNames('tnum text-ui-md font-medium', bad ? 'text-status-critical' : 'text-background-10')}>
        {value}
      </span>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'warning' | 'critical' }) {
  return (
    <div className="min-w-0">
      <dt className="text-ui-2xs text-background-30">{label}</dt>
      <dd className={classNames(tone === 'critical' && 'text-status-critical', tone === 'warning' && 'text-status-warning', !tone && 'text-background-10')}>
        {value}
      </dd>
    </div>
  );
}

const ms = (v: number | null) => (v === null ? '–' : `${v} ms`);

function DongleStatsPanel({ snap }: { snap: DongleSnapshot | null }) {
  if (!snap)
    return (
      <div className="text-background-20">
        <StatusDot tone="warn" label="Dongle bridge not running" />
        <p className="mt-3 text-ui-xs">
          Start <code>tools/esp32-dongle/bridge.py</code>; it serves live stats on {STATS_URL}.
        </p>
      </div>
    );

  const esp = snap.esp32;
  const now = snap.time;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <StatusDot tone="ok" label={`${snap.port} @ ${snap.baud}`} />
        <span className="text-ui-xs text-background-30">updates every 0.5 s</span>
      </div>

      {/* Fills the popup's width, not the window's. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
        <Stat label="Link load (ESP32 → Mac)" value={`${snap.link_in}%`} bad={snap.link_in > 60} />
        <Stat label="Packets up" value={String(snap.up)} />
        <Stat label="Packets down" value={String(snap.down)} />
        <Stat label="Bad frames" value={String(snap.bad_frames)} />
        <Stat label="Dropped (ESP32)" value={String(esp.dropped ?? '–')} bad={Number(esp.dropped) > 0} />
        <Stat label="Clients on ESP32" value={String(esp.clients ?? '–')} />
        <Stat label="Wi-Fi RTT avg/max" value={String(esp.wifi_rtt_ms ?? '–')} />
        <Stat label="ESP32 free heap" value={esp.heap ? `${Math.round(Number(esp.heap) / 1024)} KB` : '–'} />
      </div>

      <div className="flex flex-col gap-2">
        {snap.trackers.map((t) => (
          <div key={t.ip} className="rounded-[10px] bg-background-70 px-3 py-2.5">
            <div className="mb-1.5 text-ui-xs font-medium text-background-10">Tracker .{t.id}</div>
            <dl className="tnum grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-x-3 gap-y-1.5 text-ui-xs">
              <Metric label="Packets/s" value={String(t.pps)} />
              <Metric label="Last seen" value={`${ms(t.age_ms)} ago`} tone={t.age_ms > 750 ? 'critical' : undefined} />
              <Metric label="Longest gap" value={ms(t.gap_max_ms)} tone={t.gap_max_ms > 750 ? 'warning' : undefined} />
              <Metric label="RTT min/avg/max" value={t.rtt_avg === null ? '–' : `${t.rtt_min}/${t.rtt_avg}/${t.rtt_max} ms`} />
              <Metric label="Spikes >100ms" value={String(t.spikes)} />
              <Metric label="Hiccups >750ms" value={String(t.hiccups)} />
            </dl>
          </div>
        ))}
        {snap.trackers.length === 0 && (
          <div className="rounded-[10px] bg-background-70 px-3 py-2.5 text-ui-xs text-background-30">No tracker has sent a packet yet.</div>
        )}
      </div>

      <div className="rounded-[10px] bg-background-70 p-4">
        <div className="mb-2 text-ui-xs text-background-30">Recent spikes and hiccups</div>
        {snap.events.length === 0 && <div className="text-ui-xs text-background-20">None yet.</div>}
        <ul className="tnum flex flex-col gap-1 text-ui-xs text-background-10">
          {[...snap.events].reverse().map((e, i) => (
            <li key={i}>
              {Math.max(0, Math.round(now - e.t))} s ago · tracker .{e.tracker} ·{' '}
              {e.kind === 'spike' ? `ping spike ${e.ms} ms` : `silent for ${e.ms} ms`}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
