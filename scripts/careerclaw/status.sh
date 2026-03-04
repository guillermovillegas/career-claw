#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

echo "=== CareerClaw Status ==="
echo "Date: $(date '+%Y-%m-%d %H:%M %Z')"
echo ""

openclaw_agent --message "$(cat <<'PROMPT'
Generate a career status report using the jobclaw tracker tool.

Run these queries:
1. get_stats - overall application/proposal/client counts
2. list_applications with limit=10 - recent applications
3. list_proposals with limit=10 - recent proposals
4. list_followups - overdue follow-ups

Output format:
---
## Stats
- Applications: [total] ([by status breakdown])
- Proposals: [total]
- Active Clients: [total]

## Recent Applications (last 10)
| Date | Company | Role | Status | Score |
(table rows)

## Recent Proposals (last 10)
| Date | Platform | Project | Status | Bid |
(table rows)

## Overdue Follow-ups
| Type | Company/Client | Due Date | Action Needed |
(table rows, or "None" if empty)
---
PROMPT
)" 2>&1 || echo "Status check completed (check agent output)"
