#!/usr/bin/env bash
# targeted-pm-search.sh — Search specifically for senior PM roles on Greenhouse/Lever/Ashby
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

BEFORE=$(db_count jobs)
echo "=== Targeted Senior PM Search ==="
echo "Date: $(date '+%Y-%m-%d %H:%M %Z')"
echo "Jobs before: $BEFORE"
echo ""

# --- Greenhouse job-boards (modern URLs) ---
echo "[Greenhouse job-boards] Senior PM/Director roles..."
openclaw_agent --message "$(cat <<'PROMPT'
Use web_search (NOT the browser tool) to find senior Product Manager jobs on Greenhouse. Do NOT navigate.

Run these search queries ONE AT A TIME via web_search:
1. site:job-boards.greenhouse.io "Product Manager" remote senior staff principal AI
2. site:job-boards.greenhouse.io "Director of Product" OR "VP Product" remote AI
3. site:job-boards.greenhouse.io "Head of Product" OR "Group Product Manager" AI remote
4. site:job-boards.greenhouse.io "Technical Product Manager" AI SaaS remote

CRITICAL URL RULE: ONLY save URLs matching this exact pattern:
  https://job-boards.greenhouse.io/COMPANY/jobs/NUMERICID
Example valid: https://job-boards.greenhouse.io/stripe/jobs/7234561
INVALID (skip these):
  - https://job-boards.greenhouse.io/stripe (no job ID)
  - Aggregator sites (remotefront.com, daily remote.com, etc.)
  - Company career pages (stripe.com/careers)

SCORING (required for every job):
Skills(0-40) + Seniority(0-20) + Industry(0-15) + Comp(0-15) + Location(0-10) + full-time(+10) + remote(+5)
Stack: TypeScript, React, Next.js, Supabase, AI/ML, Python. Skip junior/associate/entry.
Seniority: Staff/Director/VP/Head = 20pts. Min score to save: 70.

For each valid result scoring 70+, call jobclaw create_job:
  platform='direct', work_mode='remote', job_type='full-time'
  match_score=<SCORE>, salary_min=<if visible>, salary_max=<if visible>

Output: Score | Title | Company | Salary | URL
PROMPT
)" 2>&1 || true
flush_queue
sleep 5

# --- Greenhouse boards (legacy URLs) ---
echo ""
echo "[Greenhouse boards] Senior PM roles (legacy URL format)..."
openclaw_agent --message "$(cat <<'PROMPT'
Use web_search (NOT the browser tool) to find PM roles on Greenhouse board. Do NOT navigate.

Search queries via web_search:
1. site:boards.greenhouse.io "Product Manager" remote staff principal director AI
2. site:boards.greenhouse.io "Technical Program Manager" OR "Director Product" remote AI
3. site:boards.greenhouse.io "AI Product Manager" OR "ML Product Manager" remote

CRITICAL URL RULE: Only save URLs matching:
  https://boards.greenhouse.io/COMPANY/jobs/NUMERICID
Example: https://boards.greenhouse.io/openai/jobs/4567890

SCORING: Skills(0-40) + Seniority(0-20) + Industry(0-15) + Comp(0-15) + Location(0-10) + ft(+10) + remote(+5)
Stack: TypeScript, React, Next.js, AI/ML. Seniority: Staff/Director/VP = max. Min: 70.

For valid results scoring 70+, call jobclaw create_job:
  platform='direct', work_mode='remote', job_type='full-time', match_score=<SCORE>

Output: Score | Title | Company | URL
PROMPT
)" 2>&1 || true
flush_queue
sleep 5

# --- Lever ---
echo ""
echo "[Lever] Senior PM roles..."
openclaw_agent --message "$(cat <<'PROMPT'
Use web_search (NOT the browser tool) to find PM jobs on Lever. Do NOT navigate.

Search queries via web_search:
1. site:jobs.lever.co "Product Manager" remote staff senior principal AI
2. site:jobs.lever.co "Director of Product" OR "VP Product" OR "Head of Product" remote AI
3. site:jobs.lever.co "AI Product Manager" OR "Technical Product Manager" remote

CRITICAL URL RULE: Only save URLs matching:
  https://jobs.lever.co/COMPANY/UUID
Example: https://jobs.lever.co/stripe/a1b2c3d4-e5f6-7890-abcd-123456789abc

SCORING: Skills(0-40) + Seniority(0-20) + Industry(0-15) + Comp(0-15) + Location(0-10) + ft(+10) + remote(+5)
Stack: TypeScript, React, Next.js, AI/ML. Min: 70.

For valid results scoring 70+, call jobclaw create_job:
  platform='direct', work_mode='remote', job_type='full-time', match_score=<SCORE>

Output: Score | Title | Company | URL
PROMPT
)" 2>&1 || true
flush_queue
sleep 5

# --- Ashby ---
echo ""
echo "[Ashby] Senior PM roles..."
openclaw_agent --message "$(cat <<'PROMPT'
Use web_search (NOT the browser tool) to find PM jobs on Ashby ATS. Do NOT navigate.

Search queries via web_search:
1. site:jobs.ashby.com "Product Manager" remote staff senior AI
2. site:jobs.ashby.com "Director of Product" OR "VP Product" remote AI
3. site:jobs.ashby.com "AI Product Manager" OR "Head of Product" remote

CRITICAL URL RULE: Only save URLs matching:
  https://jobs.ashby.com/COMPANY/JOBID

SCORING: Skills(0-40) + Seniority(0-20) + Industry(0-15) + Comp(0-15) + Location(0-10) + ft(+10) + remote(+5)
Stack: TypeScript, React, Next.js, AI/ML. Min: 70.

For valid results scoring 70+, call jobclaw create_job:
  platform='direct', work_mode='remote', job_type='full-time', match_score=<SCORE>

Output: Score | Title | Company | URL
PROMPT
)" 2>&1 || true
flush_queue

# --- Summary ---
AFTER=$(db_count jobs)
NEW_COUNT=$((AFTER - BEFORE))
echo ""
echo "=== Done: $BEFORE -> $AFTER jobs (+$NEW_COUNT new) ==="
