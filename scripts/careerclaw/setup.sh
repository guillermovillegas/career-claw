#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CAREERCLAW_CONFIG="$ROOT_DIR/openclaw.careerclaw.json"

echo "=== CareerClaw Setup ==="

# 1. Install pnpm deps
echo "[1/8] Installing dependencies..."
cd "$ROOT_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# 2. Install himalaya (email CLI)
echo "[2/8] Checking himalaya..."
if ! command -v himalaya &>/dev/null; then
  echo "  Installing himalaya..."
  brew install himalaya 2>/dev/null || {
    echo "  WARNING: Could not install himalaya. Install manually: brew install himalaya"
  }
else
  echo "  himalaya already installed."
fi

# 3. Supabase project check
echo "[3/8] Checking Supabase CLI..."
if command -v supabase &>/dev/null; then
  echo "  Supabase CLI found. Run migrations manually:"
  echo "  supabase db push --project-ref <your-project-ref>"
else
  echo "  WARNING: Supabase CLI not found. Install: brew install supabase/tap/supabase"
fi

# 4. Run migrations info
echo "[4/8] Migrations ready at:"
echo "  $ROOT_DIR/supabase/migrations/001_careerclaw_schema.sql"
echo "  $ROOT_DIR/supabase/migrations/002_add_constraints.sql"

# 5. Install extension deps
echo "[5/8] Installing extension dependencies..."
cd "$ROOT_DIR/extensions/jobclaw-tracker"
pnpm install 2>/dev/null || npm install
cd "$ROOT_DIR/extensions/jobclaw-apply"
pnpm install 2>/dev/null || npm install
cd "$ROOT_DIR"

# 6. Verify CareerClaw config (decoupled from SunrAI)
echo "[6/8] Verifying CareerClaw config..."
if [ -f "$CAREERCLAW_CONFIG" ]; then
  echo "  CareerClaw config found at: $CAREERCLAW_CONFIG"
  echo "  OPENCLAW_CONFIG_PATH set in .env (decoupled from global/SunrAI config)"
else
  echo "  WARNING: $CAREERCLAW_CONFIG not found. CareerClaw config is missing."
  echo "  This should have been created during Phase 2 setup."
fi

# Verify .env has the config path
if grep -q "OPENCLAW_CONFIG_PATH" "$ROOT_DIR/.env" 2>/dev/null; then
  echo "  .env points to CareerClaw-specific config."
else
  echo "  WARNING: OPENCLAW_CONFIG_PATH not set in .env. Adding it now."
  echo "OPENCLAW_CONFIG_PATH=$CAREERCLAW_CONFIG" >> "$ROOT_DIR/.env"
fi

# 7. Start gateway
echo "[7/8] Starting gateway..."
"$SCRIPT_DIR/start.sh"

# 8. Smoke test
echo "[8/8] Running smoke test..."
sleep 2
if curl -sf "http://localhost:18789/health" >/dev/null 2>&1; then
  echo "  Gateway is healthy."
else
  echo "  WARNING: Gateway health check failed. Check logs."
fi

echo ""
echo "=== CareerClaw Setup Complete ==="
echo ""
echo "Next steps:"
echo "  ./scripts/careerclaw/status.sh        # Check database status"
echo "  ./scripts/careerclaw/daily-search.sh   # Run daily job search"
echo "  ./scripts/careerclaw/apply.sh <url>    # Apply to a specific job"
