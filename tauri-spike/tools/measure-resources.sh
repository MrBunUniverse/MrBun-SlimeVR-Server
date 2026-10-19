#!/bin/bash
# Measures GPU, CPU, and RAM for the SlimeVR spike and the server, for comparing against PERFORMANCE_BASELINE.md.
#
# Usage: measure-resources.sh "<scenario label>" [seconds=30]
#
# - GPU: system-wide "Device Utilization %" from ioreg (no admin rights). Other apps affect it.
# - CPU: per-interval values from `top` (the first top sample is skipped, since it is not an interval).
# - RAM: resident memory from `top`.
# - Spike processes: the app plus the WebKit helpers that started with it (macOS launches the helpers,
#   so they don't have the app as their parent). Matched by start time, within 30 s of the app's start.
# - Server: the `slimevr.jar` java process, if one is running.
set -u
LABEL="${1:-scenario}"
SECONDS_TOTAL="${2:-30}"
INTERVAL=5
COUNT=$(( SECONDS_TOTAL / INTERVAL ))
[ "$COUNT" -lt 2 ] && COUNT=2
TMP=$(mktemp -d)

# Spike-owned PIDs: the app and WebKit helpers started within 30 s of it.
SPIKE_PIDS=$(/usr/bin/python3 - <<'EOF'
import subprocess, datetime
rows = subprocess.run(['ps', '-axo', 'pid,lstart,comm'], capture_output=True, text=True).stdout.splitlines()[1:]
fmt = '%a %b %d %H:%M:%S %Y'
parsed = []
for line in rows:
    p = line.split(None, 6)
    if len(p) < 7:
        continue
    parsed.append((p[0], datetime.datetime.strptime(' '.join(p[1:6]), fmt), p[6]))
app = [r for r in parsed if 'slimevr-tauri-spike' in r[2]]
if not app:
    print('')
else:
    t0 = app[0][1]
    pids = [r[0] for r in parsed if ('WebKit' in r[2] or 'slimevr-tauri-spike' in r[2]) and abs((r[1] - t0).total_seconds()) < 30]
    print(','.join(pids))
EOF
)
SERVER_PID=$(pgrep -f "slimevr.jar run" | head -1)
# PID 0 is kernel_task, so never use it as a placeholder. With the spike closed, watch only the server.
WATCH="${SPIKE_PIDS}${SERVER_PID:+${SPIKE_PIDS:+,}$SERVER_PID}"

# GPU samples, one per second, running alongside top.
(
  for _ in $(/usr/bin/seq 1 "$SECONDS_TOTAL"); do
    /usr/sbin/ioreg -r -d 1 -c IOAccelerator 2>/dev/null | /usr/bin/grep -o -E '"Device Utilization %"=[0-9]+' | /usr/bin/head -1
    /bin/sleep 1
  done > "$TMP/gpu.txt"
) &
GPU_PID=$!

/usr/bin/top -l $(( COUNT + 1 )) -s "$INTERVAL" -stats pid,cpu,mem,command > "$TMP/top.txt" 2>/dev/null
wait "$GPU_PID"

/usr/bin/python3 - "$TMP" "$LABEL" "$WATCH" "$SERVER_PID" <<'EOF'
import re, sys, statistics
tmp, label, watch, server_pid = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
watch_set = set(p for p in watch.split(',') if p)
gpu = [float(x) for x in re.findall(r'=(\d+)', open(f'{tmp}/gpu.txt').read())]
blocks = re.split(r'\nPID\s+%CPU', '\n' + open(f'{tmp}/top.txt').read())[2:]  # skip the first sample

def parse_mem(text):
    m = re.match(r'([\d.]+)([KMG])', text)
    if not m:
        return 0.0
    value, unit = float(m.group(1)), m.group(2)
    return value / 1024 if unit == 'K' else value * 1024 if unit == 'G' else value

spike_cpu, server_cpu, spike_mem, server_mem = [], [], [], []
for block in blocks:
    spike_c = spike_m = server_c = server_m = 0.0
    for line in block.splitlines()[1:]:
        m = re.match(r'\s*(\d+)\s+([\d.]+)\s+(\S+)\s+(.+?)\s*$', line)
        if not m or m.group(1) not in watch_set:
            continue
        pid, cpu, mem = m.group(1), float(m.group(2)), parse_mem(m.group(3))
        if server_pid and pid == server_pid:
            server_c += cpu
            server_m += mem
        else:
            spike_c += cpu
            spike_m += mem
    spike_cpu.append(spike_c)
    spike_mem.append(spike_m)
    if server_pid:
        server_cpu.append(server_c)
        server_mem.append(server_m)

def avg(xs):
    return statistics.mean(xs) if xs else float('nan')

print(f'== {label}')
print(f'GPU (system-wide): avg {avg(gpu):.1f}%, peak {max(gpu) if gpu else float("nan"):.0f}% over {len(gpu)} samples')
print(f'Spike CPU: avg {avg(spike_cpu):.1f}%, peak {max(spike_cpu) if spike_cpu else float("nan"):.1f}%')
print(f'Spike RAM: avg {avg(spike_mem):.0f} MB')
if server_pid:
    print(f'Server CPU: avg {avg(server_cpu):.1f}%, peak {max(server_cpu):.1f}%')
    print(f'Server RAM: avg {avg(server_mem):.0f} MB')
else:
    print('Server: not running')
EOF
rm -rf "$TMP"
