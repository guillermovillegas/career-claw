#!/usr/bin/env bash
set -euo pipefail

# Process the email queue - sends queued emails via send-email.sh
# Pattern mirrors process-queue.sh (DB writes)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
QUEUE_DIR="$HOME/.careerclaw"
QUEUE_FILE="$QUEUE_DIR/email-queue.jsonl"
PROCESSED_FILE="$QUEUE_DIR/email-processed.jsonl"

if [ ! -f "$QUEUE_FILE" ]; then
  exit 0  # Nothing to process
fi

TEMP_QUEUE=$(mktemp)
REMAINING=0
PROCESSED=0

while IFS= read -r line; do
  [ -z "$line" ] && continue

  TO=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.to)")
  SUBJECT=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.subject)")
  BODY=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.body)")
  QID=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.id||'unknown')")

  # Write body to temp file
  TMPBODY=$(mktemp)
  echo "$BODY" > "$TMPBODY"

  if bash "$SCRIPT_DIR/send-email.sh" --to "$TO" --subject "$SUBJECT" --body-file "$TMPBODY"; then
    PROCESSED=$((PROCESSED + 1))
    echo "{\"id\":\"$QID\",\"to\":\"$TO\",\"status\":\"sent\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$PROCESSED_FILE"
  else
    echo "$line" >> "$TEMP_QUEUE"
    REMAINING=$((REMAINING + 1))
  fi

  rm -f "$TMPBODY"
done < "$QUEUE_FILE"

if [ "$REMAINING" -gt 0 ]; then
  mv "$TEMP_QUEUE" "$QUEUE_FILE"
else
  rm -f "$TEMP_QUEUE" "$QUEUE_FILE"
fi

echo "Emails processed: $PROCESSED sent, $REMAINING remaining"
