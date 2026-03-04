#!/usr/bin/env bash
set -euo pipefail

GATEWAY_PORT="${OPENCLAW_PORT:-18789}"

echo "Stopping OpenClaw gateway..."

pkill -f "openclaw gateway run" 2>/dev/null && echo "Gateway stopped." || true
pkill -f "openclaw-gateway" 2>/dev/null || true

# Verify it's actually stopped
sleep 1
if curl -sf "http://localhost:$GATEWAY_PORT/health" >/dev/null 2>&1; then
  echo "WARNING: Gateway still responding. Force killing..."
  lsof -ti :"$GATEWAY_PORT" | xargs kill -9 2>/dev/null || true
  echo "Done."
else
  echo "Gateway is not running."
fi
