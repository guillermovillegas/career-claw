#!/usr/bin/env bash
# submit.sh — Submit "interested" applications via the OpenClaw browser agent.
# Uses openclaw_agent to navigate to each job URL, fill the form, and submit.
# Supported: Greenhouse, Lever, Ashby, and any direct career page (best effort).
#
# Usage: submit.sh [--limit N] [--dry-run] [--job-type TYPE]
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

# ─── Defaults ────────────────────────────────────────────────────────────────
LIMIT=10
DRY_RUN=false
JOB_TYPE=""
RESUME_PATH="${CAREERCLAW_ROOT}/gv_resume.pdf"
TODAY=$(date '+%Y-%m-%d')

while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit)    LIMIT="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=true; shift ;;
    --job-type) JOB_TYPE="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

echo "=== CareerClaw Submit ==="
echo "Date:     $(date '+%Y-%m-%d %H:%M %Z')"
echo "Limit:    ${LIMIT}"
echo "Dry run:  ${DRY_RUN}"
echo ""

# ─── Fetch interested applications with cover letters ─────────────────────────
APPS_JSON=$(curl -s \
  "${JOBCLAW_SUPABASE_URL}/rest/v1/applications?status=eq.interested&cover_letter=not.is.null&select=id,job_id,cover_letter,match_score,priority&order=match_score.desc&limit=${LIMIT}" \
  -H "apikey: ${JOBCLAW_SUPABASE_KEY}" \
  -H "Authorization: Bearer ${JOBCLAW_SUPABASE_KEY}")

APP_COUNT=$(node -e "console.log(JSON.parse(process.argv[1]).length)" "$APPS_JSON")

if [ "$APP_COUNT" -eq 0 ]; then
  echo "No interested applications with cover letters found."
  echo "Run auto-apply.sh first to generate cover letters."
  exit 0
fi

echo "Found ${APP_COUNT} application(s) ready to submit."
echo ""

# ─── Fetch corresponding jobs ─────────────────────────────────────────────────
JOB_IDS=$(node -e "
  const apps = JSON.parse(process.argv[1]);
  console.log(apps.map(a => a.job_id).filter(Boolean).join(','));
" "$APPS_JSON")

JOBS_JSON=$(curl -s \
  "${JOBCLAW_SUPABASE_URL}/rest/v1/jobs?id=in.(${JOB_IDS})&select=id,title,company,url,match_score,work_mode" \
  -H "apikey: ${JOBCLAW_SUPABASE_KEY}" \
  -H "Authorization: Bearer ${JOBCLAW_SUPABASE_KEY}")

# ─── Dry run: list what would be submitted ────────────────────────────────────
if [ "$DRY_RUN" = true ]; then
  echo "--- Dry Run (no submissions) ---"
  node -e "
    const apps = JSON.parse(process.argv[1]);
    const jobs = JSON.parse(process.argv[2]);
    const jmap = Object.fromEntries(jobs.map(j => [j.id, j]));
    apps.forEach((a, i) => {
      const j = jmap[a.job_id] || {};
      const url = j.url || 'no url';
      let platform = 'other';
      if (/greenhouse\.io/.test(url)) platform = 'greenhouse';
      else if (/lever\.co/.test(url)) platform = 'lever';
      else if (/ashbyhq\.com/.test(url)) platform = 'ashby';
      console.log('  ' + (i+1) + '. [' + a.match_score + '] ' + (j.title||'?') + ' @ ' + (j.company||'?') + ' | ' + platform);
      console.log('     ' + url.slice(0,80));
    });
  " "$APPS_JSON" "$JOBS_JSON"
  echo ""
  echo "Run without --dry-run to submit all ${APP_COUNT}."
  exit 0
fi

# ─── Submit loop ─────────────────────────────────────────────────────────────
SUBMITTED=0
FAILED=0

for i in $(seq 0 $((APP_COUNT - 1))); do
  # Extract data for this application
  APP_DATA=$(node -e "
    const apps = JSON.parse(process.argv[1]);
    const jobs = JSON.parse(process.argv[2]);
    const a = apps[$i];
    const j = jobs.find(j => j.id === a.job_id) || {};
    console.log([
      a.id,
      a.job_id,
      j.title || '',
      j.company || '',
      j.url || '',
      a.match_score || 0,
      j.work_mode || 'remote'
    ].join('\t'));
  " "$APPS_JSON" "$JOBS_JSON")

  APP_ID=$(echo "$APP_DATA"    | cut -f1)
  JOB_ID=$(echo "$APP_DATA"    | cut -f2)
  JOB_TITLE=$(echo "$APP_DATA" | cut -f3)
  JOB_CO=$(echo "$APP_DATA"    | cut -f4)
  JOB_URL=$(echo "$APP_DATA"   | cut -f5)
  JOB_SCORE=$(echo "$APP_DATA" | cut -f6)
  JOB_MODE=$(echo "$APP_DATA"  | cut -f7)

  NUM=$((i + 1))
  echo "─── [${NUM}/${APP_COUNT}] ${JOB_TITLE} @ ${JOB_CO} (score: ${JOB_SCORE}) ───"
  echo "    URL: ${JOB_URL}"

  if [ -z "$JOB_URL" ]; then
    echo "    ✗ No URL — skipping"
    FAILED=$((FAILED + 1))
    continue
  fi

  # Detect platform for logging
  PLATFORM="other"
  if [[ "$JOB_URL" =~ greenhouse\.io ]]; then
    PLATFORM="greenhouse"
  elif [[ "$JOB_URL" =~ lever\.co ]]; then
    PLATFORM="lever"
  elif [[ "$JOB_URL" =~ ashbyhq\.com ]]; then
    PLATFORM="ashby"
  fi
  echo "    Platform: ${PLATFORM}"
  echo ""

  # Write cover letter to temp file to avoid bash quoting issues
  COVER_LETTER_FILE=$(mktemp "/tmp/careerclaw-cl-${i}-XXXXXX.txt")
  node -e "
    const apps = JSON.parse(process.argv[1]);
    const a = apps[$i];
    process.stdout.write(a.cover_letter || '');
  " "$APPS_JSON" > "$COVER_LETTER_FILE"

  # ─── Run the submission agent ────────────────────────────────────────────
  openclaw_agent --message "$(cat <<PROMPT
You are submitting a job application for Guillermo Villegas.

APPLICATION ID: ${APP_ID}
JOB ID: ${JOB_ID}
TITLE: ${JOB_TITLE}
COMPANY: ${JOB_CO}
URL: ${JOB_URL}
PLATFORM: ${PLATFORM}

GUILLERMO'S PROFILE:
- First Name: Guillermo
- Last Name: Villegas
- Email: guillermo.villegas.applies@gmail.com
- Phone: (773) 551-1393
- Location: Chicago, IL (remote preferred)
- LinkedIn: https://www.linkedin.com/in/guillermo-villegas-3080a011b
- GitHub: https://github.com/guillermovillegas
- Portfolio: https://GuillermoTheEngineer.vercel.app
- Resume file: ${RESUME_PATH}

COVER LETTER (paste this into the Cover Letter field verbatim):
$(cat "$COVER_LETTER_FILE")

STEP 1 — Navigate to the job and find the application form:
Use the browser tool to navigate to: ${JOB_URL}
Look for an "Apply", "Apply Now", or "Apply for this job" button and click it.
If the page has a Greenhouse, Lever, or Ashby embedded form, proceed to Step 2.
If the URL redirects to a login wall (LinkedIn, etc.) that blocks access: skip to Step 3b.

STEP 2 — Fill and submit the application form:
Fill in ALL visible required fields:
  - First Name: Guillermo
  - Last Name: Villegas
  - Email: guillermo.villegas.applies@gmail.com
  - Phone: 773-551-1393
  - Location / City: Chicago, IL
  - LinkedIn Profile: https://www.linkedin.com/in/guillermo-villegas-3080a011b
  - GitHub: https://github.com/guillermovillegas
  - Website / Portfolio: https://GuillermoTheEngineer.vercel.app
  - Cover Letter: [paste the COVER LETTER above verbatim]
  - Resume: upload the file at ${RESUME_PATH}

For yes/no questions:
  - "Authorized to work in US?" → Yes
  - "Require visa sponsorship?" → No
  - "Comfortable with remote work?" → Yes
  - "How did you hear about us?" → LinkedIn or Job Board

After filling all fields, click Submit.
Take a screenshot to confirm submission was successful.

STEP 3a — If submission succeeded:
Call jobclaw update_application with EXACTLY:
  id='${APP_ID}'
  status='applied'
  application_date='${TODAY}'
  notes='Submitted via browser on ${TODAY}'

STEP 3b — If blocked / login required / form not found:
Call jobclaw update_application with EXACTLY:
  id='${APP_ID}'
  notes='Auto-submit blocked — submit manually at: ${JOB_URL}'

IMPORTANT: Always call update_application at the end, whether submission succeeded or failed.
PROMPT
  )" 2>&1 || true

  # Clean up temp file
  rm -f "$COVER_LETTER_FILE"

  flush_queue
  SUBMITTED=$((SUBMITTED + 1))
  echo ""

  # Rate limit pause between submissions
  if [ "$i" -lt $((APP_COUNT - 1)) ]; then
    sleep 10
  fi
done

# ─── Summary ─────────────────────────────────────────────────────────────────
log_run "application_submit" "browser" true \
  "{\"submitted\":${SUBMITTED},\"failed\":${FAILED},\"date\":\"${TODAY}\"}" \
  "" ""

echo "=== Submit Complete ==="
echo "Processed: ${SUBMITTED}/${APP_COUNT}"
echo ""
