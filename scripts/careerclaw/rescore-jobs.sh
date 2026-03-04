#!/usr/bin/env bash
# One-time (and periodic) script to back-fill match_score and salary on jobs
# that were saved without scoring. Processes in batches to avoid rate limits.
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

echo "=== CareerClaw Job Re-Scorer ==="
echo "Date: $(date '+%Y-%m-%d %H:%M %Z')"
echo ""

# Fetch all jobs with null match_score from Supabase
JOBS_JSON=$(curl -s \
  "${JOBCLAW_SUPABASE_URL}/rest/v1/jobs?match_score=is.null&select=id,title,company,platform,job_type,work_mode,salary_min,salary_max,description,url&order=created_at.desc&limit=50" \
  -H "apikey: ${JOBCLAW_SUPABASE_KEY}" \
  -H "Authorization: Bearer ${JOBCLAW_SUPABASE_KEY}")

JOB_COUNT=$(echo "$JOBS_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "Found ${JOB_COUNT} unscored jobs (processing up to 50)"
echo ""

if [ "$JOB_COUNT" -eq 0 ]; then
  echo "All jobs already scored. Done."
  exit 0
fi

# Write jobs to temp file so $ signs in JSON don't confuse bash heredoc
JOBS_TMP=$(mktemp /tmp/careerclaw-jobs-XXXXXX.json)
echo "$JOBS_JSON" > "$JOBS_TMP"

# Pass jobs file path to agent for scoring + updating
openclaw_agent --message "You need to score and update ${JOB_COUNT} jobs that are missing match_score.

SCORING RUBRIC — score each job 0-100:
- Skills match (0-40): TypeScript=8, React=8, Next.js=8, AI/ML=8, Supabase=4, Python=4
- Seniority fit (0-20): VP/Head=20, Director/Staff=15, Senior=10, Mid=5, Junior=0
- Industry fit (0-15): AI SaaS=15, B2B SaaS=12, Fintech=10, Enterprise=8, Other=5
- Compensation (0-15): \$200k+=15, \$180k=12, \$160k=10, \$140k=7, unknown=5
- Remote/location (0-10): remote=10, hybrid=5, on-site=0
Bonus: +10 if full-time, +5 if remote

Read the jobs list from this file: ${JOBS_TMP}

For EACH job in the list:
1. Score it using the rubric above based on the title, company, platform, work_mode, and job_type
2. Call jobclaw update_job with: id=<job id>, match_score=<score>
   - Also estimate salary_min / salary_max from market data for the role+seniority if not set:
     (VP Product remote = 180000-250000, Director of Product = 160000-210000,
      Staff Engineer = 170000-220000, Senior PM = 140000-180000, etc.)
   - Skip salary estimation only if the role is too vague

Process ALL ${JOB_COUNT} jobs. Output a table: Score | Title | Company" 2>&1 || true
rm -f "$JOBS_TMP"
flush_queue

echo ""
echo "=== Re-score complete ==="
REMAINING=$(curl -s \
  "${JOBCLAW_SUPABASE_URL}/rest/v1/jobs?match_score=is.null&select=id" \
  -H "apikey: ${JOBCLAW_SUPABASE_KEY}" \
  -H "Authorization: Bearer ${JOBCLAW_SUPABASE_KEY}" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "Unscored remaining: ${REMAINING}"
