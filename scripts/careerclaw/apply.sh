#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

if [ $# -lt 1 ]; then
  echo "Usage: apply.sh <job-url> [--submit]"
  echo ""
  echo "  <job-url>   URL of the job posting"
  echo "  --submit    Actually submit the application (default: draft only)"
  exit 1
fi

JOB_URL="$1"
SUBMIT_FLAG=""
if [ "${2:-}" = "--submit" ]; then
  SUBMIT_FLAG="After I approve, submit the application via the browser."
fi

echo "=== CareerClaw Apply ==="
echo "URL: $JOB_URL"
echo "Mode: ${SUBMIT_FLAG:-Draft only (add --submit to submit)}"
echo ""

RESUME_PATH="$CAREERCLAW_ROOT/gv_resume.pdf"
SCREENSHOT_DIR="$HOME/.careerclaw/screenshots"
mkdir -p "$SCREENSHOT_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

openclaw_agent --message "$(cat <<PROMPT
Read the job posting at: $JOB_URL

STEP 1 — EXTRACT & SCORE:
- Extract: title, company, location, salary, requirements, job_type, work_mode, platform
- Score 0-100: skill match (40pts), seniority (20pts), industry fit (15pts), comp (15pts), location (10pts). +10 full-time, +5 remote.

STEP 2 — SCREENSHOT THE JOB POSTING:
- Use the browser tool to navigate to $JOB_URL
- Take a screenshot of the job posting page
- Save it to: $SCREENSHOT_DIR/job-${TIMESTAMP}.png
- This is proof the job existed at time of application

STEP 3 — GENERATE COVER LETTER:
- Use jobclaw-apply tool (generate_cover_letter action)
- Email to use for all applications: guillermo.villegas.applies@gmail.com

STEP 4 — SAVE RECORDS:
- jobclaw create_job: title, company, location, work_mode, job_type, platform, match_score, url, description
- jobclaw create_application: platform, status='applied', cover_letter, match_score, priority,
  notes="Screenshot: $SCREENSHOT_DIR/job-${TIMESTAMP}.png | Applied: $(date '+%Y-%m-%d') | URL: $JOB_URL"

STEP 5 — IF SUBMITTING:
$SUBMIT_FLAG
- After submission: take a screenshot of the confirmation page
- Save to: $SCREENSHOT_DIR/confirm-${TIMESTAMP}.png
- Update the application notes with the confirmation screenshot path
- Note: confirmation email should arrive at guillermo.villegas.applies@gmail.com

STEP 6 — LOG:
- jobclaw log_automation: action_type='application_submit', platform, success=true, details including screenshot paths

RESUME: $RESUME_PATH

Output:
---
Job: [title] at [company]
Score: [X]/100 | Mode: [mode] | Type: [type]
Cover Letter: [letter]
Screenshot: $SCREENSHOT_DIR/job-${TIMESTAMP}.png
Confirmation: [path or 'draft only']
---
PROMPT
)" 2>&1 || true

flush_queue
echo ""
echo "Screenshots saved to: $SCREENSHOT_DIR"
echo "DB: $(db_count jobs) jobs, $(db_count applications) applications"
