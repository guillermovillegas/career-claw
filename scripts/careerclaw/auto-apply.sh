#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

# ─── Defaults ────────────────────────────────────────────────────────
LIMIT="${MAX_APPLICATIONS_PER_DAY:-25}"
MIN_SCORE=50
JOB_TYPE="full-time"
DRY_RUN=false

# ─── Parse flags ─────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit)      LIMIT="$2"; shift 2 ;;
    --min-score)  MIN_SCORE="$2"; shift 2 ;;
    --job-type)   JOB_TYPE="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=true; shift ;;
    -h|--help)
      echo "Usage: auto-apply.sh [flags]"
      echo ""
      echo "Flags:"
      echo "  --limit N        Max applications per run (default: \$MAX_APPLICATIONS_PER_DAY or 25)"
      echo "  --min-score N    Minimum match_score to include (default: 50)"
      echo "  --job-type TYPE  Filter by job_type, e.g. full-time (default: full-time)"
      echo "  --dry-run        List candidates without applying"
      exit 0
      ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

RESUME_PATH="$CAREERCLAW_ROOT/${PROFILE_RESUME}"
APPS_BEFORE=$(db_count applications)
TODAY=$(date '+%Y-%m-%d')
START_TS=$(date +%s)

echo "=== CareerClaw Auto-Apply ==="
echo "Date:      $(date '+%Y-%m-%d %H:%M %Z')"
echo "Job type:  ${JOB_TYPE}"
echo "Min score: ${MIN_SCORE}"
echo "Limit:     ${LIMIT}"
echo "Dry run:   ${DRY_RUN}"
echo ""

# ─── Fetch open, unapplied jobs ──────────────────────────────────────
echo "Fetching ${JOB_TYPE} jobs with score >= ${MIN_SCORE}..."

# Encode job_type for URL (full-time has a hyphen, safe to pass directly)
JOBS_JSON=$(curl -s \
  "${JOBCLAW_SUPABASE_URL}/rest/v1/jobs?job_type=eq.${JOB_TYPE}&match_score=gte.${MIN_SCORE}&url=not.is.null&select=id,title,company,match_score,url,work_mode,salary_min,salary_max,deadline&order=match_score.desc&limit=200" \
  -H "apikey: ${JOBCLAW_SUPABASE_KEY}" \
  -H "Authorization: Bearer ${JOBCLAW_SUPABASE_KEY}")

APP_IDS_JSON=$(curl -s \
  "${JOBCLAW_SUPABASE_URL}/rest/v1/applications?select=job_id" \
  -H "apikey: ${JOBCLAW_SUPABASE_KEY}" \
  -H "Authorization: Bearer ${JOBCLAW_SUPABASE_KEY}")

# Compute candidates: open (deadline not past), no application yet, top by score
CANDIDATES=$(node -e "
  const jobs   = JSON.parse(process.argv[1]);
  const apps   = JSON.parse(process.argv[2]);
  const limit  = parseInt(process.argv[3], 10);
  const today  = process.argv[4];

  const applied = new Set(apps.map(a => a.job_id).filter(Boolean));
  const open    = jobs.filter(j => {
    if (!j.id) return false;
    if (applied.has(j.id)) return false;
    if (j.deadline && j.deadline < today) return false;
    return true;
  });
  console.log(JSON.stringify(open.slice(0, limit)));
" "$JOBS_JSON" "$APP_IDS_JSON" "$LIMIT" "$TODAY")

COUNT=$(node -e "console.log(JSON.parse(process.argv[1]).length)" "$CANDIDATES")

if [ "$COUNT" -eq 0 ]; then
  echo "No unapplied ${JOB_TYPE} jobs found with score >= ${MIN_SCORE}."
  echo "Total applications so far: ${APPS_BEFORE}"
  exit 0
fi

echo "Found ${COUNT} job(s) to apply to today."
echo ""

# ─── Dry run ─────────────────────────────────────────────────────────
if [ "$DRY_RUN" = true ]; then
  echo "--- Dry Run (no applications will be created) ---"
  node -e "
    const jobs = JSON.parse(process.argv[1]);
    jobs.forEach((j, i) => {
      const salary = j.salary_min ? ' \$' + Math.round(j.salary_min/1000) + 'k-\$' + Math.round((j.salary_max||j.salary_min)/1000) + 'k' : '';
      console.log('  ' + (i+1) + '. [' + j.match_score + '] ' + j.title + ' @ ' + j.company + salary);
      console.log('     ' + (j.url || 'no url'));
    });
  " "$CANDIDATES"
  echo ""
  echo "Run without --dry-run to apply to all ${COUNT}."
  exit 0
fi

# ─── Apply loop ───────────────────────────────────────────────────────
PROCESSED=0
FAILED=0

for i in $(seq 0 $((COUNT - 1))); do
  JOB_DATA=$(node -e "
    const j = JSON.parse(process.argv[1])[parseInt(process.argv[2], 10)];
    const sal = j.salary_min ? j.salary_min + '-' + (j.salary_max || j.salary_min) : '';
    console.log([j.id, j.title, j.company, j.match_score, j.url, j.work_mode || '', sal].join('\t'));
  " "$CANDIDATES" "$i")

  JOB_ID=$(echo "$JOB_DATA"    | cut -f1)
  JOB_TITLE=$(echo "$JOB_DATA" | cut -f2)
  JOB_CO=$(echo "$JOB_DATA"    | cut -f3)
  JOB_SCORE=$(echo "$JOB_DATA" | cut -f4)
  JOB_URL=$(echo "$JOB_DATA"   | cut -f5)
  JOB_MODE=$(echo "$JOB_DATA"  | cut -f6)
  JOB_SAL=$(echo "$JOB_DATA"   | cut -f7)

  # Derive platform from URL (only linkedin/indeed are valid enum values; rest = direct)
  if [[ "$JOB_URL" =~ linkedin\.com ]]; then
    JOB_PLATFORM="linkedin"
  elif [[ "$JOB_URL" =~ indeed\.com ]]; then
    JOB_PLATFORM="indeed"
  else
    JOB_PLATFORM="direct"
  fi

  # Priority as integer: 1=high (85+), 2=medium (70-84), 3=normal (<70)
  if [ "$JOB_SCORE" -ge 85 ]; then
    JOB_PRIORITY=1
  elif [ "$JOB_SCORE" -ge 70 ]; then
    JOB_PRIORITY=2
  else
    JOB_PRIORITY=3
  fi

  NUM=$((i + 1))
  echo "─── [${NUM}/${COUNT}] ${JOB_TITLE} @ ${JOB_CO} (score: ${JOB_SCORE}) ───"
  [ -n "$JOB_SAL" ] && echo "    Salary: ${JOB_SAL}  Mode: ${JOB_MODE}"
  echo "    URL: ${JOB_URL}"
  echo ""

  openclaw_agent --message "$(cat <<PROMPT
You are applying for ${PROFILE_FULL_NAME} to this job (already saved in the tracker, job_id: ${JOB_ID}).

JOB DETAILS:
- Title:   ${JOB_TITLE}
- Company: ${JOB_CO}
- Score:   ${JOB_SCORE}/100
- URL:     ${JOB_URL}
- Mode:    ${JOB_MODE}

STEP 1 — Generate a tailored cover letter (100-160 words, two short paragraphs):

PARAGRAPH 1 (metric + why this company):
Lead with the applicant's most relevant career win that matches the role, then connect it to ONE specific thing the company is doing (product, initiative, or known challenge).

PARAGRAPH 2 (supporting proof + clean close):
One more concrete proof point, then a clean close. End with just: ${PROFILE_FULL_NAME}

BANNED WORDS (never use): excited, passionate, thrilled, love, leverage, synergy, innovative, cutting-edge, world-class, dynamic, rockstar, guru, thought leader, disruptive, feel free, reach out, circle back, hit the ground running, move the needle, great fit, perfect fit, exclamation points, I believe, I feel, I think

APPLICANT BACKGROUND (use to tailor):
${PROFILE_BACKGROUND}

ROLE MATCHING GUIDE:
${PROFILE_ROLE_GUIDE}

STEP 2 — Save the application:
Call jobclaw create_application with EXACTLY these field values:
  job_id='${JOB_ID}'
  status='interested'
  platform='${JOB_PLATFORM}'
  cover_letter=<the letter you wrote>
  match_score=${JOB_SCORE}
  priority=${JOB_PRIORITY}
  notes='Auto-applied ${TODAY}'

IMPORTANT: priority must be a number (1=high, 2=medium, 3=normal). Do NOT use string values.

Output format:
---
Cover Letter:
[full letter text]
---
Status: saved
PROMPT
  )" 2>&1 || true

  flush_queue
  PROCESSED=$((PROCESSED + 1))
  echo ""

  # Rate limit pause between applications
  if [ "$i" -lt $((COUNT - 1)) ]; then
    sleep 8
  fi
done

# ─── Submit new applications via Playwright (headless Chromium) ──────
if [ "$PROCESSED" -gt 0 ]; then
  echo "--- Submitting new application(s) via Playwright ---"
  node "$(cd "$(dirname "$0")" && pwd)/submit-playwright.mjs" --limit "${PROCESSED}" || true
  echo ""
fi

# ─── Log the run ─────────────────────────────────────────────────────
APPS_AFTER=$(db_count applications)
NEW_APPS=$((APPS_AFTER - APPS_BEFORE))
END_TS=$(date +%s)
EXEC_MS=$(( (END_TS - START_TS) * 1000 ))

log_run "application_submit" "${JOB_TYPE}" true \
  "{\"processed\":${PROCESSED},\"new_applications\":${NEW_APPS},\"min_score\":${MIN_SCORE},\"limit\":${LIMIT},\"date\":\"${TODAY}\"}" \
  "" "${EXEC_MS}"

# ─── Summary ─────────────────────────────────────────────────────────
echo "=== Auto-Apply Complete ==="
echo "Processed:    ${PROCESSED}/${COUNT} jobs"
echo "Applications: ${APPS_BEFORE} → ${APPS_AFTER} (+${NEW_APPS} new)"
echo "Next run will continue with remaining unapplied ${JOB_TYPE} jobs."
echo ""
REMAINING_TOTAL=$(node -e "
  const all = JSON.parse(process.argv[1]).length;
  console.log(Math.max(0, all - ${APPS_AFTER}));
" "$JOBS_JSON" 2>/dev/null || echo "?")
echo "Estimated remaining: ~$(( ($(node -e "
  const jobs = JSON.parse(process.argv[1]);
  const apps = JSON.parse(process.argv[2]);
  const today = process.argv[3];
  const applied = new Set(apps.map(a => a.job_id).filter(Boolean));
  console.log(jobs.filter(j => !applied.has(j.id) && !(j.deadline && j.deadline < today)).length);
" "$JOBS_JSON" "$APP_IDS_JSON" "$TODAY" 2>/dev/null || echo 0) )) jobs left across all score ranges."
