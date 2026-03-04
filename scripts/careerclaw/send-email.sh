#!/usr/bin/env bash
set -euo pipefail

# Send an email via msmtp (lightweight SMTP client)
# Usage: send-email.sh --to EMAIL --subject SUBJECT --body-file FILE [--attach FILE]

TO=""
SUBJECT=""
BODY_FILE=""
ATTACH=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --to) TO="$2"; shift 2 ;;
    --subject) SUBJECT="$2"; shift 2 ;;
    --body-file) BODY_FILE="$2"; shift 2 ;;
    --attach) ATTACH="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$TO" ] || [ -z "$SUBJECT" ] || [ -z "$BODY_FILE" ]; then
  echo "Usage: send-email.sh --to EMAIL --subject SUBJECT --body-file FILE [--attach FILE]"
  exit 1
fi

if [ ! -f "$BODY_FILE" ]; then
  echo "ERROR: Body file not found: $BODY_FILE"
  exit 1
fi

FROM="${PROFILE_EMAIL:-${GMAIL_USER:-your-email@gmail.com}}"
LOG_DIR="$HOME/.careerclaw"
LOG_FILE="$LOG_DIR/email-log.jsonl"
mkdir -p "$LOG_DIR"

# Check for msmtp
if ! command -v msmtp &>/dev/null; then
  echo "ERROR: msmtp not installed. Run: brew install msmtp"
  echo "Then configure ~/.msmtprc (see email-setup.md)"
  # Log the failure
  echo "{\"to\":\"$TO\",\"subject\":\"$SUBJECT\",\"status\":\"failed\",\"error\":\"msmtp not installed\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$LOG_FILE"
  exit 1
fi

# Build email
TMPMAIL=$(mktemp)
{
  echo "From: $FROM"
  echo "To: $TO"
  echo "Subject: $SUBJECT"
  echo "Date: $(date -R)"
  echo "Content-Type: text/plain; charset=utf-8"
  echo ""
  cat "$BODY_FILE"
} > "$TMPMAIL"

# Send
if msmtp --from="$FROM" "$TO" < "$TMPMAIL"; then
  echo "{\"to\":\"$TO\",\"subject\":\"$SUBJECT\",\"status\":\"sent\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$LOG_FILE"
  echo "Email sent to $TO"
  STATUS=0
else
  echo "{\"to\":\"$TO\",\"subject\":\"$SUBJECT\",\"status\":\"failed\",\"error\":\"msmtp failed\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$LOG_FILE"
  echo "ERROR: Failed to send email to $TO"
  STATUS=1
fi

rm -f "$TMPMAIL"
exit $STATUS
