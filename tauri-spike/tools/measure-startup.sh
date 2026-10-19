#!/bin/bash
# Launch a .app fresh and measure:
#   - time from launch until its window is visible
#   - memory of the app process plus the WebKit helpers it started
#   - whether the process is still alive a few seconds later (crash check)
#
# Accessibility text queries on WKWebView content hang, so the rendered page itself
# is not measured here. Each osascript call is bounded by a watchdog so a hang can't stall the run.
#
# Usage: measure-startup.sh "<path to .app>" "<process name>" [label]
set -u
APP="$1"
PROC="$2"
LABEL="${3:-$PROC}"
WEBKIT_PATTERN="WebKit.WebContent|WebKit.GPU|WebKit.Networking"

now() { python3 -c 'import time; print(time.time())'; }
elapsed() { python3 -c "print(round($2 - $1, 2))"; }

# Run an osascript query with a 5-second watchdog. Prints its output, or nothing on timeout.
bounded_osa() {
  local out
  out=$(mktemp)
  osascript -e "$1" > "$out" 2>/dev/null &
  local pid=$!
  for _ in $(seq 1 50); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null
    rm -f "$out"
    return 1
  fi
  cat "$out"
  rm -f "$out"
}

# PIDs that already exist before the launch, so only processes this launch creates are counted.
before=" $(pgrep -f "$WEBKIT_PATTERN|$PROC" | tr '\n' ' ') "

t0=$(now)
open -n "$APP"

window_ok=0
for _ in $(seq 1 300); do
  if bounded_osa "tell application \"System Events\" to exists window 1 of process \"$PROC\"" | grep -q true; then
    window_ok=1
    break
  fi
  sleep 0.05
done
t_window=$(now)

sleep 4

alive=0
pgrep -f "$PROC" | grep -v -x "$$" >/dev/null 2>&1 && alive=1

total_kb=0
count=0
for pid in $(pgrep -f "$WEBKIT_PATTERN|$PROC"); do
  case "$before" in *" $pid "*) continue ;; esac
  rss=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ')
  total_kb=$((total_kb + ${rss:-0}))
  count=$((count + 1))
done

echo "== $LABEL"
echo "app bundle size: $(du -sh "$APP" | cut -f1)"
if [ "$window_ok" = 1 ]; then
  echo "launch -> window visible: $(elapsed "$t0" "$t_window") s"
else
  echo "launch -> window visible: TIMED OUT (30 s)"
fi
if [ "$alive" = 1 ]; then echo "still running 4 s after window: yes"; else echo "still running 4 s after window: NO (crashed or exited)"; fi
echo "processes started by this launch: $count"
echo "memory (app + WebKit helpers): $((total_kb / 1024)) MB"
echo
