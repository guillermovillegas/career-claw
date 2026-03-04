#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

BEFORE=$(db_count jobs)
echo "=== CareerClaw Daily Job Search (${BEFORE} jobs in DB) ==="
echo "Date: $(date '+%Y-%m-%d %H:%M %Z')"
echo ""

# --- Full-Time Search ---
# IMPORTANT: All searches use web_search (Google API), NOT the browser tool.
# Direct browser navigation triggers bot detection on LinkedIn/Indeed/Upwork.
# web_search uses Google search API - no bot detection, no CAPTCHA.

# SCORING RUBRIC (use for all jobs below):
# - Skills match:   0-40pts  (TypeScript/React/Next.js/Supabase/AI = max)
# - Seniority fit:  0-20pts  (Staff/Director/VP/Head = max; junior = 0)
# - Industry fit:   0-15pts  (AI/SaaS/B2B = max)
# - Compensation:   0-15pts  ($180k+ = 15, $150k = 10, unknown = 5)
# - Remote/mode:    0-10pts  (remote = 10, hybrid = 5, on-site = 0)
# Bonus: +10 full-time, +5 remote
# MINIMUM TO SAVE: 70

echo "[LinkedIn] Searching PM and engineer roles via Google..."
openclaw_agent --message "$(cat <<'PROMPT'
Use web_search (NOT the browser tool) to find LinkedIn job listings. Do NOT navigate to any website directly.

Search queries to run (one at a time via web_search):
1. site:linkedin.com/jobs "VP of Product" OR "Head of Product" remote 2025 OR 2026
2. site:linkedin.com/jobs "Staff Product Manager" OR "Director of Product" AI remote
3. site:linkedin.com/jobs "Forward Deployed Engineer" OR "Solutions Engineer" AI remote
4. site:linkedin.com/jobs "Technical Product Manager" AI remote Chicago OR remote

CRITICAL URL RULE: Only save URLs matching linkedin.com/jobs/view/NUMERICID — reject any other format.

SCORING (required for every job):
Skills(0-40) + Seniority(0-20) + Industry(0-15) + Comp(0-15) + Location(0-10) + full-time(+10) + remote(+5)
Applicant's stack: ${PROFILE_TECH_STACK} — score accordingly.

For each result scoring 70+:
- Extract: title, company, location, salary range if visible in snippet
- Call jobclaw create_job with ALL of these fields set:
    platform='linkedin'
    work_mode='remote'
    job_type='full-time'
    match_score=<YOUR_SCORE>          ← REQUIRED, never omit
    salary_min=<number or omit>       ← set if salary visible in snippet
    salary_max=<number or omit>       ← set if salary visible in snippet

Output: Score | Title | Company | Salary | URL
PROMPT
)" 2>&1 || true
flush_queue
echo ""

echo "[Greenhouse] PM roles from company boards via Google..."
openclaw_agent --message "$(cat <<'PROMPT'
Use web_search (NOT the browser tool) to find jobs on Greenhouse company boards. Do NOT navigate to any website directly.

Search queries (run via web_search):
1. site:boards.greenhouse.io "Product Manager" OR "Director of Product" remote 2025 OR 2026
2. site:boards.greenhouse.io "Technical Program Manager" remote senior
3. site:boards.greenhouse.io "VP Product" OR "Head of Product" remote

SCORING (required):
Skills(0-40) + Seniority(0-20) + Industry(0-15) + Comp(0-15) + Location(0-10) + full-time(+10) + remote(+5)
Guillermo's stack: TypeScript, React, Next.js, Supabase, AI/ML — score accordingly.

For each result scoring 70+:
- Call jobclaw create_job with ALL fields:
    platform='direct'
    work_mode='remote'
    job_type='full-time'
    match_score=<YOUR_SCORE>    ← REQUIRED
    salary_min=<if visible>
    salary_max=<if visible>

Output: Score | Title | Company | URL
PROMPT
)" 2>&1 || true
flush_queue

sleep 10

echo "[Greenhouse] Engineer roles via Google..."
openclaw_agent --message "$(cat <<'PROMPT'
Use web_search (NOT the browser tool) to find engineering jobs on Greenhouse. Do NOT navigate to any website directly.

Search queries (run via web_search):
1. site:boards.greenhouse.io "Forward Deployed Engineer" OR "AI Engineer" remote
2. site:boards.greenhouse.io "Solutions Engineer" AI remote senior
3. site:boards.greenhouse.io "Staff Engineer" AI OR "machine learning" remote

SCORING (required):
Skills(0-40) + Seniority(0-20) + Industry(0-15) + Comp(0-15) + Location(0-10) + full-time(+10) + remote(+5)
Applicant's stack: ${PROFILE_TECH_STACK} — score accordingly.

For each result scoring 70+:
- Call jobclaw create_job with:
    platform='direct'
    work_mode='remote'
    job_type='full-time'
    match_score=<YOUR_SCORE>    ← REQUIRED

Output: Score | Title | Company | URL
PROMPT
)" 2>&1 || true
flush_queue
echo ""

echo "[Indeed] Full-time roles via Google..."
openclaw_agent --message "$(cat <<'PROMPT'
Use web_search (NOT the browser tool) to find Indeed listings. Do NOT navigate to Indeed directly.

Search queries (run via web_search):
1. site:indeed.com "AI Product Manager" OR "Technical Product Manager" remote senior -intitle:apply
2. site:indeed.com "VP Product" OR "Director of Product" remote $150000 OR $160000 OR $180000
3. site:indeed.com "Forward Deployed Engineer" OR "Solutions Engineer" AI remote

CRITICAL URL RULE:
- VALID: indeed.com/viewjob?jk=JOBID  or  indeed.com/rc/clk?jk=JOBID
- INVALID (skip): URLs with /q- or ending in -jobs.html (search result pages, not job postings)
- Company career page URLs are also valid — use platform='direct' for those.

SCORING (required):
Skills(0-40) + Seniority(0-20) + Industry(0-15) + Comp(0-15) + Location(0-10) + full-time(+10) + remote(+5)
Guillermo's stack: TypeScript, React, Next.js, Supabase, AI/ML — score accordingly.

For each result with VALID URL scoring 70+:
- Call jobclaw create_job with:
    platform='indeed' (or 'direct' for company career pages)
    work_mode='remote'
    job_type='full-time'
    match_score=<YOUR_SCORE>    ← REQUIRED
    salary_min=<if visible in snippet, number only, no $ or k>
    salary_max=<if visible in snippet, number only, no $ or k>

Output: Score | Title | Company | Salary | URL
PROMPT
)" 2>&1 || true
flush_queue
echo ""

# --- Freelance ---

echo "[Upwork] Freelance projects via Google..."
openclaw_agent --message "$(cat <<'PROMPT'
Use web_search (NOT the browser tool) to find Upwork projects. Do NOT navigate to Upwork directly.

Search queries (run via web_search):
1. site:upwork.com/jobs "AI integration" OR "AI engineer" budget posted:week
2. site:upwork.com/jobs "Next.js" OR "React" "SaaS" full-stack senior
3. site:upwork.com/jobs "MVP" AI product manager consultant

SCORING (required):
Skills(0-40) + Budget clarity(0-20) + Seniority fit(0-20) + Recency(0-20)
Applicant's stack: ${PROFILE_TECH_STACK} — score accordingly.

For each result scoring 65+:
- Call jobclaw create_job with:
    platform='upwork'
    work_mode='remote'
    job_type='contract'
    match_score=<YOUR_SCORE>    ← REQUIRED
    salary_min=<budget_min if visible, as number>
    salary_max=<budget_max if visible, as number>

Output: Score | Title | Budget | URL (top 10)
PROMPT
)" 2>&1 || true
flush_queue

# --- Log automation run ---
AFTER=$(db_count jobs)
NEW_COUNT=$((AFTER - BEFORE))
log_run "job_search" "multi" true \
  "{\"jobs_before\":${BEFORE},\"jobs_after\":${AFTER},\"new_jobs\":${NEW_COUNT},\"date\":\"$(date '+%Y-%m-%d')\"}"

# --- Summary ---
echo ""
echo "=== Done: ${BEFORE} -> ${AFTER} jobs (+${NEW_COUNT} new) ==="
