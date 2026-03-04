#!/usr/bin/env bash
set -euo pipefail

GATEWAY_PORT="${OPENCLAW_PORT:-18789}"
GATEWAY_LOG="/tmp/openclaw-gateway.log"

echo "Starting OpenClaw gateway on port $GATEWAY_PORT..."

# Check if already running
if curl -sf "http://localhost:$GATEWAY_PORT/health" >/dev/null 2>&1; then
  echo "Gateway already running on port $GATEWAY_PORT."
  exit 0
fi

# Kill any stale process
pkill -9 -f "openclaw-gateway" 2>/dev/null || true
pkill -9 -f "openclaw gateway run" 2>/dev/null || true
sleep 1

# Start gateway in background
nohup openclaw gateway run \
  --bind loopback \
  --port "$GATEWAY_PORT" \
  --force \
  > "$GATEWAY_LOG" 2>&1 &

GATEWAY_PID=$!
echo "Gateway started (PID: $GATEWAY_PID, log: $GATEWAY_LOG)"

# Wait for it to be ready
for i in {1..10}; do
  if curl -sf "http://localhost:$GATEWAY_PORT/health" >/dev/null 2>&1; then
    echo "Gateway is healthy."
    exit 0
  fi
  sleep 1
done

echo "WARNING: Gateway started but health check not yet passing. Check $GATEWAY_LOG"
