#!/usr/bin/env bash
# qa-daily.sh — Daily QA pass for CareerClaw pipeline.
# Run after daily-search.sh / direct-apply.mjs to catch quality issues.
#
# Weekly mode (--weekly): full URL liveness scan + auto-fix.
# Usage: bash scripts/careerclaw/qa-daily.sh [--weekly]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

WEEKLY=false
for arg in "$@"; do
  if [ "$arg" = "--weekly" ]; then
    WEEKLY=true
  fi
done

TODAY=$(date +%Y-%m-%d)
START_TIME=$SECONDS

echo "=== CareerClaw Daily QA — $TODAY ==="
echo ""

CRITICAL=0

# ─── Step 1: QA Audit ─────────────────────────────────────────────────────────
echo "--- Step 1: QA Audit ---"

if [ "$WEEKLY" = true ]; then
  echo "Running weekly audit (with URL checks and auto-fix)..."
  node "$SCRIPT_DIR/qa-audit.mjs" --check-urls --fix --verbose --limit 500 || CRITICAL=1
else
  echo "Running daily audit (quick mode)..."
  node "$SCRIPT_DIR/qa-audit.mjs" --limit 500 || CRITICAL=1
fi

echo ""

# ─── Step 2: Email Response Tracking ──────────────────────────────────────────
echo "--- Step 2: Email Response Tracking ---"

if [ -n "${GMAIL_USER:-}" ] && [ -n "${GMAIL_APP_PASSWORD:-}" ]; then
  node "$SCRIPT_DIR/track-email-responses.mjs" --since "$TODAY" || {
    echo "WARNING: Email tracking failed (non-fatal)"
  }
else
  echo "SKIP: GMAIL_USER / GMAIL_APP_PASSWORD not set"
fi

echo ""

# ─── Step 3: Fix bad cover letters (only if audit found critical issues) ──────
if [ "$CRITICAL" -ne 0 ]; then
  echo "--- Step 3: Fix Cover Letters (triggered by audit issues) ---"
  node "$SCRIPT_DIR/fix-cover-letters.mjs" --status interested --limit 20 || {
    echo "WARNING: Cover letter fix failed (non-fatal)"
  }
  echo ""
fi

# ─── Log automation run ──────────────────────────────────────────────────────
ELAPSED=$(( SECONDS - START_TIME ))
ELAPSED_MS=$(( ELAPSED * 1000 ))

MODE="daily"
if [ "$WEEKLY" = true ]; then
  MODE="weekly"
fi

log_run "profile_update" "qa-audit" "$([ $CRITICAL -eq 0 ] && echo true || echo false)" \
  "{\"mode\":\"$MODE\",\"critical\":$CRITICAL,\"date\":\"$TODAY\"}" \
  "" \
  "$ELAPSED_MS"

echo ""
echo "=== QA Complete (${ELAPSED}s) ==="
if [ "$CRITICAL" -ne 0 ]; then
  echo "WARNING: Critical issues were found. Review the audit output above."
fi
