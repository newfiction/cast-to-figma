#!/bin/bash
# Ensures the unified Cast bridge is running. Idempotent — safe to call repeatedly.
set -euo pipefail

PORT=${CAST_BRIDGE_PORT:-${BRIDGE_PORT:-7777}}
BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$BRIDGE_DIR/.." && pwd)"
LOG="/tmp/figma-bridge.log"
CLI_VERSION="$(node -e "console.log(require('$ROOT_DIR/package.json').version)" 2>/dev/null || true)"

# If the port is occupied by an old Cast bridge, replace it with the unified server.
if lsof -iTCP:"$PORT" -sTCP:LISTEN &>/dev/null; then
  STATUS="$(curl -s "http://127.0.0.1:$PORT/status" 2>/dev/null || true)"
  PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  COMMANDS="$(ps -p ${PIDS//$'\n'/,} -o command= 2>/dev/null || true)"

  if echo "$STATUS" | grep -q 'cast-server'; then
    BRIDGE_VERSION="$(node -e "const s=process.argv[1]; try { const j=JSON.parse(s); console.log(j.bridgeVersion || j.cliVersion || '') } catch (_) {}" "$STATUS" 2>/dev/null || true)"
    if [ -n "$CLI_VERSION" ] && [ "$BRIDGE_VERSION" = "$CLI_VERSION" ]; then
      exit 0
    fi
    kill $PIDS 2>/dev/null || true
    sleep 0.3
  elif echo "$COMMANDS" | grep -q "$BRIDGE_DIR" || echo "$COMMANDS" | grep -q 'node server\.js'; then
    kill $PIDS 2>/dev/null || true
    sleep 0.3
  else
    echo "[bridge] port $PORT is already in use by another process" >&2
    echo "$COMMANDS" >&2
    exit 1
  fi
fi

cd "$BRIDGE_DIR"
if ! node -e "require.resolve('ws')" >/dev/null 2>&1; then
  echo "[bridge] installing production dependencies" >&2
  npm install --omit=dev >&2
fi
CAST_BRIDGE_PORT="$PORT" nohup node cast-server.js >> "$LOG" 2>&1 &
disown

# Wait up to 3s for it to start.
for i in 1 2 3 4 5 6; do
  sleep 0.5
  if curl -s "http://127.0.0.1:$PORT/status" 2>/dev/null | grep -q 'cast-server'; then
    echo "[bridge] started (pid $!, log: $LOG)"
    exit 0
  fi
done

echo "[bridge] failed to start — check $LOG" >&2
exit 1
