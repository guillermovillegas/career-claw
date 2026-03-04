#!/usr/bin/env bash
# Process the CareerClaw write queue.
# Reads entries from ~/.careerclaw/write-queue.jsonl and POSTs them to Supabase.
# This script runs OUTSIDE the OC plugin sandbox so curl works correctly.

set -euo pipefail

QUEUE_DIR="$HOME/.careerclaw"
QUEUE_FILE="$QUEUE_DIR/write-queue.jsonl"
PROCESSED_FILE="$QUEUE_DIR/processed-queue.jsonl"

# Load env if available
CAREERCLAW_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
if [ -f "$CAREERCLAW_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$CAREERCLAW_ROOT/.env"
  set +a
fi

SUPABASE_URL="${JOBCLAW_SUPABASE_URL:-}"
SUPABASE_KEY="${JOBCLAW_SUPABASE_KEY:-}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
  echo "ERROR: Missing JOBCLAW_SUPABASE_URL or JOBCLAW_SUPABASE_KEY" >&2
  exit 1
fi

if [ ! -f "$QUEUE_FILE" ]; then
  exit 0  # Nothing to process
fi

# Process each line
TEMP_QUEUE=$(mktemp)
REMAINING=0
PROCESSED=0

while IFS= read -r line; do
  # Skip empty lines
  [ -z "$line" ] && continue

  # Extract fields using node (JSON parsing in bash is painful)
  OP=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.op)")
  TABLE=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.table)")
  DATA=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(d.data))")
  FILTERS=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.filters||'')")
  QID=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.id)")

  if [ "$OP" = "insert" ]; then
    # Deduplication: for the jobs table, skip if a row with the same company+title already exists.
    if [ "$TABLE" = "jobs" ]; then
      COMPANY=$(echo "$DATA" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(encodeURIComponent(d.company||''))")
      TITLE=$(echo "$DATA" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(encodeURIComponent(d.title||''))")
      EXISTING=$(curl -s -o /dev/null -w '%{http_code}' \
        "${SUPABASE_URL}/rest/v1/jobs?company=eq.${COMPANY}&title=eq.${TITLE}&select=id&limit=1" \
        -H "apikey: ${SUPABASE_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_KEY}" \
        -H "Prefer: count=exact")
      CONTENT_RANGE=$(curl -s -D - -o /dev/null \
        "${SUPABASE_URL}/rest/v1/jobs?company=eq.${COMPANY}&title=eq.${TITLE}&select=id&limit=1" \
        -H "apikey: ${SUPABASE_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_KEY}" \
        -H "Prefer: count=exact" 2>/dev/null | grep -i content-range | sed 's/.*\///' | tr -d '[:space:]')
      if [ "${CONTENT_RANGE:-0}" != "0" ] && [ -n "$CONTENT_RANGE" ]; then
        PROCESSED=$((PROCESSED + 1))
        echo "{\"id\":\"$QID\",\"status\":\"skipped_duplicate\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$PROCESSED_FILE"
        continue
      fi
    fi

    # Write data to temp file for curl
    TMPDATA=$(mktemp)
    echo "$DATA" > "$TMPDATA"

    HTTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${SUPABASE_URL}/rest/v1/${TABLE}" \
      -H "apikey: ${SUPABASE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "@${TMPDATA}")

    rm -f "$TMPDATA"

    if [ "$HTTP_STATUS" = "201" ]; then
      PROCESSED=$((PROCESSED + 1))
      echo "{\"id\":\"$QID\",\"status\":\"processed\",\"httpStatus\":$HTTP_STATUS,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$PROCESSED_FILE"
    else
      # Keep failed entries for retry
      echo "$line" >> "$TEMP_QUEUE"
      REMAINING=$((REMAINING + 1))
    fi

  elif [ "$OP" = "update" ]; then
    TMPDATA=$(mktemp)
    echo "$DATA" > "$TMPDATA"

    STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "${SUPABASE_URL}/rest/v1/${TABLE}?${FILTERS}" \
      -H "apikey: ${SUPABASE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "@${TMPDATA}")

    rm -f "$TMPDATA"

    if [ "$STATUS" = "200" ] || [ "$STATUS" = "204" ]; then
      PROCESSED=$((PROCESSED + 1))
      echo "{\"id\":\"$QID\",\"status\":\"processed\",\"httpStatus\":$STATUS,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$PROCESSED_FILE"
    else
      echo "$line" >> "$TEMP_QUEUE"
      REMAINING=$((REMAINING + 1))
    fi
  fi

done < "$QUEUE_FILE"

# Replace queue with remaining entries
if [ "$REMAINING" -gt 0 ]; then
  mv "$TEMP_QUEUE" "$QUEUE_FILE"
else
  rm -f "$TEMP_QUEUE" "$QUEUE_FILE"
fi

echo "Queue processed: $PROCESSED OK, $REMAINING remaining"
