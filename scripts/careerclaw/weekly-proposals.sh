#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

echo "=== CareerClaw Weekly Proposal Batch ==="
echo "Date: $(date '+%Y-%m-%d %H:%M %Z')"
echo ""

# IMPORTANT: All searches use web_search (Google API), NOT the browser tool.
# Direct browser navigation triggers bot detection on Upwork/Fiverr.
# web_search uses Google search API - no bot detection, no CAPTCHA.

# Upwork proposal batch
echo "[Upwork] Searching and drafting proposals via Google..."
openclaw_agent --message "$(cat <<'PROMPT'
Use web_search (NOT the browser tool) to find Upwork projects. Do NOT navigate to any website directly.

Search queries to run (one at a time via web_search):
1. site:upwork.com/jobs "AI integration" OR "AI engineer" posted:week
2. site:upwork.com/jobs "Next.js" OR "React" "SaaS" full-stack senior
3. site:upwork.com/jobs "MVP" OR "prototype" AI product manager consultant
4. site:upwork.com/jobs "TypeScript" OR "Node.js" API backend senior

For each result from web_search:
- Extract: project title, budget (from snippet if visible), URL
- Score 0-100 based on: skills match (+30), budget clarity (+10), seniority fit (+20), AI/tech relevance (+20), recency (+20)
- Skip anything scoring below 65
- For each project scoring >= 65 (max 5 total):
  1. Generate an ultra-short proposal (under 75 words) using jobclaw-apply tool
  2. Save the draft using jobclaw tool: create_proposal with status='draft', platform='upwork'
  3. Print the draft for review

Output format per proposal:
---
Project: [title]
Budget: [amount or unknown]
Score: [X]/100
URL: [url]

Proposal Draft:
[the generated proposal]

Saved: [tracker ID or queued]
---

Do NOT submit any proposals. Draft only.
PROMPT
)" 2>&1 || echo "  Upwork proposals completed (check agent output)"

flush_queue

echo ""

sleep 10

# Fiverr buyer requests (no Fiverr API exists; use Google to find public requests)
echo "[Fiverr] Searching buyer requests via Google..."
openclaw_agent --message "$(cat <<'PROMPT'
Use web_search (NOT the browser tool) to find Fiverr buyer requests and gig opportunities. Do NOT navigate to Fiverr directly.

Search queries to run via web_search:
1. site:fiverr.com/requests "AI integration" OR "AI chatbot" 2025 OR 2026
2. site:fiverr.com/requests "Next.js" OR "React" web app development
3. site:fiverr.com/requests "SaaS" OR "MVP" build

For each result from web_search:
- Extract: request title, budget (from snippet), URL
- Score 0-100 based on skills match and budget
- Skip below 65
- For each matching request (max 3):
  1. Generate an ultra-short proposal (under 75 words) using jobclaw-apply tool
  2. Save as draft using jobclaw tool: create_proposal with platform='fiverr', status='draft'
  3. Print draft for review

Do NOT submit. Draft only.
PROMPT
)" 2>&1 || echo "  Fiverr proposals completed (check agent output)"

flush_queue

PROPOSAL_COUNT=$(db_count freelance_proposals)
log_run "proposal_submit" "upwork,fiverr" true \
  "{\"proposals_total\":${PROPOSAL_COUNT},\"date\":\"$(date '+%Y-%m-%d')\",\"mode\":\"draft\"}"

echo ""
echo "=== Weekly Proposals Complete ==="
echo "DB: $(db_count jobs) jobs, ${PROPOSAL_COUNT} proposals"
echo "Review drafts, then submit manually."
