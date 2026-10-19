#!/bin/bash
# Usage: measure.sh <path-to-.app> <process-name-pattern> <label>
# Launches a .app's binary directly, waits for startup, then sums RSS of all matching processes.
APP="$1"
PATTERN="$2"
LABEL="$3"

BIN=$(ls "$APP/Contents/MacOS/" | head -1)
echo "== $LABEL"
echo "app size (du): $(du -sh "$APP" | cut -f1)"
echo "app size (bytes): $(du -sk "$APP" | cut -f1) KB"

start=$(python3 -c 'import time;print(time.time())')
"$APP/Contents/MacOS/$BIN" >/dev/null 2>&1 &
pid=$!

# Wait until a process matching the pattern appears, then until its RSS stops changing (roughly "settled").
for i in $(seq 1 60); do
  if pgrep -f "$PATTERN" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
first_seen=$(python3 -c 'import time;print(time.time())')
echo "time to first process (s): $(python3 -c "print(round($first_seen-$start,2))")"

sleep 8
total=0
for p in $(pgrep -f "$PATTERN"); do
  rss=$(ps -o rss= -p "$p" 2>/dev/null | tr -d ' ')
  total=$((total + ${rss:-0}))
done
echo "total RSS after 8s (MB): $((total / 1024))"
echo "process count: $(pgrep -f "$PATTERN" | wc -l | tr -d ' ')"

# Clean up
pkill -f "$PATTERN" 2>/dev/null
wait $pid 2>/dev/null
echo
