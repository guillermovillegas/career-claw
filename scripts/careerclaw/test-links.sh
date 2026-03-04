#!/usr/bin/env bash
# Test all job URLs with real HTTP requests.
# Dead links → mark job deadline=today so dashboard shows "Closed".
# Logs results to automation_logs.
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

echo "=== CareerClaw Link Tester ==="
echo "Date: $(date '+%Y-%m-%d %H:%M %Z')"
echo ""

TODAY=$(date '+%Y-%m-%d')

# Fetch all jobs that have a URL and are not already marked closed
# (deadline is null OR deadline >= today)
JOBS_JSON=$(curl -s \
  "${JOBCLAW_SUPABASE_URL}/rest/v1/jobs?url=not.is.null&or=(deadline.is.null,deadline.gte.${TODAY})&select=id,title,company,url&order=created_at.desc&limit=200" \
  -H "apikey: ${JOBCLAW_SUPABASE_KEY}" \
  -H "Authorization: Bearer ${JOBCLAW_SUPABASE_KEY}")

TOTAL=$(echo "$JOBS_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "Testing ${TOTAL} active job URLs..."
echo ""

OK=0
DEAD=0
REDIRECT=0
RESULTS=""

mark_closed() {
  local JOB_ID="$1"
  # Set deadline = yesterday so the dashboard shows "Closed"
  local YESTERDAY
  YESTERDAY=$(date -v-1d '+%Y-%m-%d' 2>/dev/null || date -d 'yesterday' '+%Y-%m-%d')
  curl -s -X PATCH \
    "${JOBCLAW_SUPABASE_URL}/rest/v1/jobs?id=eq.${JOB_ID}" \
    -H "apikey: ${JOBCLAW_SUPABASE_KEY}" \
    -H "Authorization: Bearer ${JOBCLAW_SUPABASE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{\"deadline\":\"${YESTERDAY}\"}" > /dev/null 2>&1
}

# Test each URL with curl: follow redirects, 10s timeout, check final HTTP status
while IFS=$'\t' read -r JOB_ID TITLE COMPANY URL; do
  [ -z "$URL" ] && continue

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L --max-redirs 3 \
    --connect-timeout 8 --max-time 12 \
    -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
    "$URL" 2>/dev/null || echo "000")

  # Major job boards block curl with 403/429 — treat as live (bot protection, not dead link)
  # Affected: LinkedIn, Indeed, Greenhouse, Lever, Workday, Salesforce, Coinbase, Airbnb, etc.
  IS_BOT_BLOCKED=false
  if [[ "$STATUS" == "403" ]] || [[ "$STATUS" == "429" ]] || [[ "$STATUS" == "401" ]]; then
    IS_BOT_BLOCKED=true
  fi

  if [[ "$STATUS" =~ ^2 ]] || [ "$IS_BOT_BLOCKED" = "true" ]; then
    OK=$((OK + 1))
    LABEL="OK"
    echo "  [${STATUS}] ✓  ${TITLE} @ ${COMPANY}"
  elif [[ "$STATUS" =~ ^3 ]]; then
    REDIRECT=$((REDIRECT + 1))
    LABEL="REDIRECT"
    echo "  [${STATUS}] →  ${TITLE} @ ${COMPANY}"
  elif [ "$STATUS" = "000" ]; then
    DEAD=$((DEAD + 1))
    LABEL="TIMEOUT"
    echo "  [---] ✗  CLOSED — ${TITLE} @ ${COMPANY}"
    mark_closed "$JOB_ID"
  else
    DEAD=$((DEAD + 1))
    LABEL="DEAD(${STATUS})"
    echo "  [${STATUS}] ✗  CLOSED — ${TITLE} @ ${COMPANY}"
    mark_closed "$JOB_ID"
  fi

  RESULTS="${RESULTS}{\"job_id\":\"${JOB_ID}\",\"http_status\":${STATUS},\"label\":\"${LABEL}\"},"
done < <(echo "$JOBS_JSON" | python3 -c "
import sys, json
for r in json.load(sys.stdin):
    print(r['id'] + '\t' + r.get('title','') + '\t' + r.get('company','') + '\t' + r.get('url',''))
")

echo ""
echo "=== Results: ${OK} live, ${REDIRECT} redirect, ${DEAD} closed/dead out of ${TOTAL} ==="

# Log to automation_logs
log_run "job_search" "link_test" true \
  "{\"tested\":${TOTAL},\"ok\":${OK},\"redirect\":${REDIRECT},\"dead\":${DEAD},\"date\":\"${TODAY}\"}"

echo "Done."
