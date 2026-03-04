#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

CHECK_ONLY=false
if [ "${1:-}" = "--check-only" ]; then
  CHECK_ONLY=true
fi

echo "=== CareerClaw Follow-Up ==="
echo "Date: $(date '+%Y-%m-%d %H:%M')"
echo "Mode: $( $CHECK_ONLY && echo 'Check only (no actions)' || echo 'Draft + log follow-ups' )"
echo ""

# Step 1: Get overdue follow-ups from the tracker
echo "Querying overdue follow-ups..."
FOLLOWUPS_OUTPUT=$(openclaw_agent --message "$(cat <<'PROMPT'
Use the jobclaw tool with action=list_followups (no data needed).
Return ONLY the raw JSON result, no commentary. I need the overdue_followups and due_sequences arrays.
PROMPT
)" 2>&1) || true

echo "$FOLLOWUPS_OUTPUT"
echo ""

# Extract the count from agent output (look for "total" in the JSON)
TOTAL=$(echo "$FOLLOWUPS_OUTPUT" | grep -o '"total":[0-9]*' | head -1 | grep -o '[0-9]*' || echo "0")

if [ "$TOTAL" = "0" ]; then
  echo "No overdue follow-ups. All caught up!"
  NEXT_CHECK=$(date -v+1d '+%Y-%m-%d')
  echo "Next check: $NEXT_CHECK"
  exit 0
fi

echo "Found $TOTAL overdue item(s)."
echo ""

if $CHECK_ONLY; then
  echo "-- Check-only mode: no actions taken --"
  echo "Run without --check-only to draft and log follow-ups."
  exit 0
fi

# Step 2: Process each overdue follow-up via a single agent call
# The agent handles iteration, drafting, logging, and date updates
echo "Processing follow-ups..."
echo ""

PROCESS_OUTPUT=$(openclaw_agent --message "$(cat <<'PROMPT'
You have overdue follow-ups to process. Do the following steps:

1. Call jobclaw action=list_followups to get all overdue items.

2. For each item in overdue_followups (application follow-ups):
   a. Draft a short, professional follow-up email (3-5 sentences) appropriate for the
      application status:
      - "applied" status: polite check-in expressing continued interest, ask about timeline
      - "phone_screen" status: thank them for the call, reiterate enthusiasm, ask about next steps
      - "interview" status: thank them for the interview, reference something specific, ask about timeline
   b. Print the draft clearly labeled with the job title, company, and status.
   c. Log the follow-up: jobclaw action=log_communication with data:
      - direction: "outbound"
      - communication_type: "email"
      - subject: "Follow-up: [Job Title] at [Company]"
      - content: the drafted message
      - notes: "Auto-drafted by CareerClaw followup script - PENDING REVIEW"
      (include application_id or contact_id if available)
   d. Update the application's next follow-up date to 5 business days from today:
      jobclaw action=update_application with data: { id: <application_id>, next_followup_date: "<date 5 business days from now>" }

3. For each item in due_sequences (outreach sequences):
   a. Draft the next outreach message based on the sequence context and step number.
   b. Print the draft clearly labeled.
   c. Log it: jobclaw action=log_communication with data:
      - direction: "outbound"
      - communication_type: "email"
      - subject: appropriate subject for the outreach
      - content: the drafted message
      - notes: "Auto-drafted by CareerClaw followup script - PENDING REVIEW"

4. At the end, print a summary line in this exact format:
   SUMMARY: N follow-ups processed

Important: These are DRAFTS only. Mark all as pending review. Do not actually send anything.
PROMPT
)" 2>&1) || true

echo "$PROCESS_OUTPUT"
echo ""

# Flush all queued writes to Supabase
flush_queue

# Extract summary count
PROCESSED=$(echo "$PROCESS_OUTPUT" | grep -o 'SUMMARY: [0-9]* follow-ups' | grep -o '[0-9]*' || echo "$TOTAL")

NEXT_CHECK=$(date -v+1d '+%Y-%m-%d')
echo ""
echo "=== Follow-Up Complete ==="
echo "Processed: $PROCESSED follow-up(s)"
echo "Status: Drafted and logged (pending your review)"
echo "Next check: $NEXT_CHECK"
echo "DB: $(db_count applications) applications, $(db_count communication_log) communications logged"
