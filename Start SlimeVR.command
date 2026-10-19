#!/bin/bash
# Double-click to start SlimeVR: the server, the USB dongle bridge (if the ESP32 is
# plugged in) and the Spike app with live reload. Close this window or press Ctrl+C
# to stop everything this window started. Anything already running is left alone.

ROOT="$(cd "$(dirname "$0")" && pwd)"
SPIKE="$ROOT/tauri-spike"
BRIDGE="$ROOT/tools/esp32-dongle/bridge.py"
PYTHON=/Library/Frameworks/Python.framework/Versions/3.14/bin/python3 # has pyserial
LOGS="$HOME/Library/Logs/SlimeVR-launcher"
mkdir -p "$LOGS"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

set -m # each background job gets its own process group, so stopping it stops its children too
started=()
cleanup() {
	trap - EXIT INT TERM HUP
	echo
	echo "Stopping SlimeVR..."
	for pid in "${started[@]}"; do kill -- "-$pid" 2>/dev/null; done
	wait 2>/dev/null
	exit 0
}
trap cleanup EXIT INT TERM HUP

echo "SlimeVR — logs in $LOGS"

# 1. Server, from this checkout (the only build that matches your config).
if lsof -nP -iTCP:21110 -sTCP:LISTEN >/dev/null 2>&1; then
	echo "Server: already running, leaving it as is."
else
	cp "$HOME/Library/Application Support/dev.slimevr.SlimeVR/vrconfig.yml" "$LOGS/vrconfig.backup.yml" 2>/dev/null
	(cd "$ROOT" && exec java -Xmx128M -jar server/desktop/build/libs/slimevr.jar run) >"$LOGS/server.log" 2>&1 &
	started+=($!)
	echo -n "Server: starting"
	for _ in $(seq 60); do
		lsof -nP -iTCP:21110 -sTCP:LISTEN >/dev/null 2>&1 && break
		sleep 1
		echo -n "."
	done
	if ! lsof -nP -iTCP:21110 -sTCP:LISTEN >/dev/null 2>&1; then
		echo " failed. Last lines of the log:"
		tail -20 "$LOGS/server.log"
		read -rp "Press Enter to close..."
		exit 1
	fi
	echo " up."
fi

# 2. USB dongle bridge.
DONGLE=$(ls /dev/cu.usbserial* /dev/cu.usbmodem* 2>/dev/null | head -1)
if pgrep -f "esp32-dongle/bridge.py|python.* -u bridge.py" >/dev/null; then
	echo "Dongle: bridge already running, leaving it as is."
elif [ -z "$DONGLE" ]; then
	echo "Dongle: not plugged in, skipping. Trackers on normal Wi-Fi can still connect."
else
	"$PYTHON" -u "$BRIDGE" --port "$DONGLE" >"$LOGS/bridge.log" 2>&1 &
	started+=($!)
	bridge_started=1
	echo "Dongle: bridge started on $DONGLE."
fi

# 3. Spike app with live reload.
if pgrep -f "slimevr-tauri-spike" >/dev/null; then
	echo "Spike: already open."
elif [ -d "$SPIKE" ]; then
	# Storage cleanups have deleted these before; reinstall instead of failing silently.
	[ -d "$SPIKE/node_modules" ] || { echo "Spike: installing app tools..."; (cd "$SPIKE" && npm ci) >"$LOGS/spike-install.log" 2>&1; }
	[ -d "$SPIKE/latest/node_modules" ] || { echo "Spike: installing GUI packages..."; (cd "$SPIKE/latest" && pnpm install --frozen-lockfile) >>"$LOGS/spike-install.log" 2>&1; }
	(cd "$SPIKE" && exec npx tauri dev --config '{"build":{"devUrl":"http://localhost:5173","beforeDevCommand":{"script":"pnpm exec vite --port 5173 --strictPort","cwd":"../latest/gui","wait":false}},"app":{"security":{"devCsp":null}}}') >"$LOGS/spike.log" 2>&1 &
	started+=($!)
	echo "Spike: opening (first start after a reboot can take a minute)."
else
	echo "Spike: not found at $SPIKE, skipping."
fi

if [ ${#started[@]} -eq 0 ]; then
	echo "Everything was already running."
	read -rp "Press Enter to close..."
	exit 0
fi

echo
echo "Running. Close this window or press Ctrl+C to stop."
# Show the dongle's 10-second tracker summary while running.
if [ -n "$bridge_started" ]; then
	tail -n0 -F "$LOGS/bridge.log" 2>/dev/null | grep --line-buffered -E "^trackers:" &
	started+=($!)
fi
wait
# Only reached if everything this window started exited on its own.
echo "Everything stopped by itself. Last lines of the logs:"
for f in server bridge spike; do [ -f "$LOGS/$f.log" ] && { echo "== $f.log"; tail -5 "$LOGS/$f.log"; }; done
read -rp "Press Enter to close..."
