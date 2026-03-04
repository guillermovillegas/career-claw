#!/usr/bin/env bash
# Common setup for all CareerClaw scripts

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAREERCLAW_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Ensure PATH includes nvm/pnpm for cron execution
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null
export PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$HOME/Library/pnpm:$PATH"

# Load CareerClaw environment (Supabase creds, API keys, rate limits)
if [ -f "$CAREERCLAW_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$CAREERCLAW_ROOT/.env"
  set +a
fi

# Load profile.json fields into shell variables via jq (requires jq)
PROFILE_JSON="$CAREERCLAW_ROOT/config/profile.json"
if [ -f "$PROFILE_JSON" ] && command -v jq &>/dev/null; then
  PROFILE_FIRST_NAME=$(jq -r '.personal.first_name' "$PROFILE_JSON")
  PROFILE_LAST_NAME=$(jq -r '.personal.last_name' "$PROFILE_JSON")
  PROFILE_FULL_NAME="${PROFILE_FIRST_NAME} ${PROFILE_LAST_NAME}"
  PROFILE_EMAIL=$(jq -r '.personal.email' "$PROFILE_JSON")
  PROFILE_LOCATION=$(jq -r '.personal.location' "$PROFILE_JSON")
  PROFILE_TECH_STACK=$(jq -r '.tech_stack // "TypeScript, React, Python"' "$PROFILE_JSON")
  PROFILE_RESUME=$(jq -r '.professional.resume_filename // "resume.pdf"' "$PROFILE_JSON")
  PROFILE_BACKGROUND=$(jq -r '.cover_letter.background_bullets // [] | map("- " + .) | join("\n")' "$PROFILE_JSON")
  PROFILE_ROLE_GUIDE=$(jq -r '.cover_letter.role_matching // [] | map("- " + .) | join("\n")' "$PROFILE_JSON")
else
  echo "WARNING: config/profile.json not found or jq not installed. Using defaults." >&2
  PROFILE_FULL_NAME="Your Name"
  PROFILE_TECH_STACK="TypeScript, React, Python"
  PROFILE_RESUME="resume.pdf"
fi

# Use the project's openclaw (dev version with latest model support)
# Each script invocation gets a unique session to avoid lock conflicts
openclaw_agent() {
  local session_id="careerclaw-$(date +%s)-$$-$RANDOM"
  cd "$CAREERCLAW_ROOT" && pnpm openclaw agent --session-id "$session_id" --local "$@"
}

# Flush the write queue to Supabase (runs OUTSIDE the OC plugin sandbox).
# The plugin sandbox blocks outbound POST/PATCH, so writes queue locally.
# This is a no-op if the queue is empty.
flush_queue() {
  local QUEUE_FILE="$HOME/.careerclaw/write-queue.jsonl"
  local PROCESSOR="$CAREERCLAW_ROOT/extensions/jobclaw-tracker/scripts/process-queue.sh"

  [ -f "$QUEUE_FILE" ] || return 0

  local pending
  pending=$(wc -l < "$QUEUE_FILE" | tr -d ' ')
  [ "$pending" -gt 0 ] || return 0

  echo "  Flushing $pending queued write(s)..."
  bash "$PROCESSOR"
}

# Get row count for a table (returns just the number, no decoration)
db_count() {
  local table="${1:-jobs}"
  curl -s "${JOBCLAW_SUPABASE_URL}/rest/v1/${table}?select=id" \
    -H "apikey: ${JOBCLAW_SUPABASE_KEY}" \
    -H "Authorization: Bearer ${JOBCLAW_SUPABASE_KEY}" \
    -H "Prefer: count=exact" \
    -D - -o /dev/null 2>/dev/null | grep -i 'content-range' | sed 's/.*\///' | tr -d '[:space:]'
}

# Queue an email for sending (processed by process-emails.sh)
email_queue() {
  local to="$1" subject="$2" body="$3"
  local QUEUE_DIR="$HOME/.careerclaw"
  mkdir -p "$QUEUE_DIR"
  local id="email-$(date +%s)-$$-$RANDOM"
  node -e "process.stdout.write(JSON.stringify({id:'$id',to:'$to',subject:$(node -e "process.stdout.write(JSON.stringify('$subject'))"),body:$(node -e "process.stdout.write(JSON.stringify('$body'))"),timestamp:new Date().toISOString()})+'\n')" >> "$QUEUE_DIR/email-queue.jsonl"
}

# Process queued emails
flush_emails() {
  local PROCESSOR="$SCRIPT_DIR/process-emails.sh"
  local QUEUE_FILE="$HOME/.careerclaw/email-queue.jsonl"
  [ -f "$QUEUE_FILE" ] || return 0
  bash "$PROCESSOR"
}

# Write an automation log entry directly to Supabase (no agent needed).
# Usage: log_run ACTION_TYPE PLATFORM SUCCESS DETAILS_JSON [ERROR_MSG] [EXEC_MS]
# Example: log_run "job_search" "linkedin" true '{"found":12}' "" 45000
log_run() {
  local action_type="${1:-job_search}"
  local platform="${2:-}"
  local success="${3:-true}"
  local details="${4:-{\}}"
  local error_msg="${5:-}"
  local exec_ms="${6:-}"

  local payload
  payload=$(node -e "
    const p = {
      action_type: $(node -e "process.stdout.write(JSON.stringify('$action_type'))"),
      platform: $(node -e "process.stdout.write(JSON.stringify('$platform' || null))"),
      success: $success,
      details: $details,
    };
    if ('$error_msg') p.error_message = '$error_msg';
    if ('$exec_ms') p.execution_time_ms = parseInt('$exec_ms');
    process.stdout.write(JSON.stringify(p));
  ")

  local http_code
  http_code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "${JOBCLAW_SUPABASE_URL}/rest/v1/automation_logs" \
    -H "apikey: ${JOBCLAW_SUPABASE_KEY}" \
    -H "Authorization: Bearer ${JOBCLAW_SUPABASE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$payload")

  if [ "$http_code" = "201" ]; then
    echo "  Logged automation run (${action_type}/${platform})"
  else
    echo "  WARNING: automation log failed (HTTP ${http_code})" >&2
  fi
}
