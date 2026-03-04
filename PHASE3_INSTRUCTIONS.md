# CareerClaw Phase 3: Completion, Testing, and Activation

## Context

CareerClaw is a job search automation system built on OpenClaw (AI agent framework). It has 8 skills, 2 extensions (jobclaw-tracker, jobclaw-apply), 12 Supabase tables, and automation scripts. It is now decoupled from SunrAI with its own config at `openclaw.careerclaw.json`.

**Repo:** `/Users/g/development/career-claw/`
**Config:** `openclaw.careerclaw.json` (loaded via `OPENCLAW_CONFIG_PATH` in `.env`)
**Supabase:** `https://qxqbozdmzrxbtiutmtqb.supabase.co` (credentials in `.env`)
**Model:** Sonnet 4.6 (`anthropic/claude-sonnet-4-6`)

### Current State (Phase 2 Complete)

- 51 jobs tracked in Supabase from first daily search
- 2 test applications (Datadog, Notion), 1 test proposal (Upwork)
- All 8 scripts working (`scripts/careerclaw/`)
- Plugins decoupled from SunrAI (own config, only jobclaw tools loaded)
- Upwork profile ~90% complete (needs portfolio screenshot uploads)
- Fiverr profile ~50% complete (bio/title done, gig 1 partially created, gigs 2-3 not started)
- Cron jobs NOT installed yet (sandbox blocked crontab)

---

## Phase 3 Tasks

### 1. Complete Fiverr Gig Setup

**Reference:** `skills/profile-manager/references/fiverr-gig-guide.md`

The Fiverr gig creation wizard has many interdependent dropdowns. Use browser automation to complete:

**Gig 1: AI-Powered Web Application** (partially created - needs Service type confirmation, tags, pricing tiers, description, gallery)

- Service type: Custom Websites
- Tags: nextjs, react, typescript, ai integration, web application, supabase, full stack, saas
- 3 pricing tiers from the guide ($500 / $1,500 / $3,500)
- Description from the guide
- Gallery: upload screenshots from `/Users/g/development/personal-portfolio/public/images/` (levee-1.png through levee-5.png)

**Gig 2: Full-Stack SaaS Platform** (not started)

- All details in fiverr-gig-guide.md
- Gallery: sunrai screenshots

**Gig 3: AI/ML Feature Integration** (not started)

- All details in fiverr-gig-guide.md
- Gallery: apact + screenshotter screenshots

**Account:** guillermo.villegas.applies@gmail.com (user will need to be logged in)

### 2. Complete Upwork Portfolio

**Reference:** `skills/profile-manager/references/upwork-profile-guide.md`

Upload portfolio screenshots:

- Levee: `levee-1.png` through `levee-5.png`
- SunrAI: `sunrai-1.png` through `sunrai-5.png`
- APACT: `apact1.png` through `apact4.png`
- Screenshotter: `screenshotter-1.png` through `screenshotter-3.png`

All images are at `/Users/g/development/personal-portfolio/public/images/`

### 3. Install Cron Jobs

The sandbox blocked `crontab` installation. Install these cron jobs:

```
# CareerClaw automated job search (weekdays 9am CT)
0 15 * * 1-5 /Users/g/development/career-claw/scripts/careerclaw/daily-search.sh >> /tmp/careerclaw-daily.log 2>&1

# CareerClaw follow-up check (weekdays 2pm CT)
0 20 * * 1-5 /Users/g/development/career-claw/scripts/careerclaw/status.sh >> /tmp/careerclaw-followup.log 2>&1

# CareerClaw weekly proposals (Monday 10am CT)
0 16 * * 1 /Users/g/development/career-claw/scripts/careerclaw/weekly-proposals.sh >> /tmp/careerclaw-proposals.log 2>&1
```

Times are UTC (CT+6 in winter). Run `crontab -e` to install.

### 4. Run a Fresh Daily Search

Run `./scripts/careerclaw/daily-search.sh` with the updated keywords:

**PM/Leadership (highest priority):** VP Product, Head of Product, Director of Product, Group PM, Staff PM, Technical PM, AI PM
**Engineer (secondary):** Forward Deployed Engineer, AI-Assisted Engineer, Vibe Coder, Prompt Engineer, Solutions Engineer
**Job types:** Full-time preferred, Part-time and Contract also acceptable
**Staleness:** Skip listings older than 14 days, -10 points if older than 7 days
**Platforms:** LinkedIn, Greenhouse (via Google site: search), Indeed, Upwork (secondary)

The script is already configured with these keywords. Just run it.

### 5. Apply to Top-Scoring Jobs

After the daily search, review the tracked jobs and apply to the highest-scoring ones:

```bash
# Check what's tracked
./scripts/careerclaw/status.sh

# Apply to a specific job
./scripts/careerclaw/apply.sh <job-url>        # draft only
./scripts/careerclaw/apply.sh <job-url> --submit  # submit application
```

Target: Apply to 5-10 high-scoring jobs (80+) per day, mix of PM and engineer roles.

### 6. Fix the Greenhouse Rate Limit Issue

The Greenhouse search (via Google `site:boards.greenhouse.io`) hit API rate limits on the first run. Options:

- Add delay between search queries in `daily-search.sh`
- Use web_search tool with smaller batches
- Split Greenhouse search into its own script run at a different time

### 7. Test the Weekly Proposals Script

Run `./scripts/careerclaw/weekly-proposals.sh` and verify:

- Upwork project search works
- Proposals are drafted (not submitted)
- Results tracked in Supabase via jobclaw tracker

### 8. Review and Approve Job Matches via Gateway UI

The OpenClaw Gateway UI is at `http://localhost:18789`. BUT the gateway currently runs with the global config (SunrAI plugins). For CareerClaw dashboard access, either:

- Run a separate gateway instance on a different port with the CareerClaw config
- Or use the CLI scripts directly (they're fully functional)

To start a CareerClaw-specific gateway:

```bash
cd /Users/g/development/career-claw
OPENCLAW_CONFIG_PATH=/Users/g/development/career-claw/openclaw.careerclaw.json \
  pnpm openclaw gateway run --port 18790 --bind loopback
```

---

## Architecture Reference

### Scripts (`scripts/careerclaw/`)

| Script                | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `_common.sh`          | Shared helper (openclaw_agent wrapper with unique session IDs) |
| `setup.sh`            | One-time setup: deps, extensions, config verification          |
| `start.sh`            | Start gateway, wait for health                                 |
| `stop.sh`             | Kill gateway process                                           |
| `daily-search.sh`     | LinkedIn + Greenhouse + Indeed + Upwork search                 |
| `apply.sh <url>`      | Apply to specific job (--submit to submit)                     |
| `weekly-proposals.sh` | Batch Upwork + Fiverr proposals                                |
| `profile-setup.sh`    | Browser automation for Upwork/Fiverr profiles                  |
| `status.sh`           | DB query for stats, activity, follow-ups                       |

### Extensions

| Plugin          | Tool Name       | Actions                                                                                                                                                                                                                                                                                    |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| jobclaw-tracker | `jobclaw`       | create_job, create_application, update_application, list_applications, create_proposal, update_proposal, list_proposals, create_client, update_client, list_clients, create_contact, list_contacts, log_communication, create_outreach_sequence, list_followups, get_stats, log_automation |
| jobclaw-apply   | `jobclaw-apply` | generate_cover_letter, generate_proposal, tailor_resume_summary                                                                                                                                                                                                                            |

### Skills (`skills/`)

| Skill             | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| job-search        | Search LinkedIn, Greenhouse, Indeed, Upwork, Fiverr |
| job-apply         | Cover letters (<75 words), application submission   |
| interview-prep    | STAR stories, talk tracks, question bank            |
| network-outreach  | Cold outreach, warm intros, follow-ups              |
| profile-manager   | Upwork/Fiverr profile optimization                  |
| email-manager     | Gmail integration via himalaya                      |
| guillermo-profile | Resume, awards, achievements data                   |
| proposal-writer   | Freelance proposal generation                       |

### Config Decoupling

- **Global config** (`~/.openclaw/openclaw.json`): SunrAI plugins only (sunrai-db, inspector)
- **CareerClaw config** (`openclaw.careerclaw.json`): jobclaw-tracker, jobclaw-apply only
- **Loaded via:** `OPENCLAW_CONFIG_PATH` in `/Users/g/development/career-claw/.env`
- **Scripts use:** `pnpm openclaw agent --session-id <unique> --local` (bypasses gateway, uses project .env)

### Key Files Modified in Phase 2

- `skills/job-apply/references/cover-letter-templates.md` - Ultra-short (<75 words)
- `skills/job-apply/references/proposal-templates.md` - Ultra-short (<75 words)
- `skills/job-search/SKILL.md` - Full-time priority, PM focus, Greenhouse, staleness penalty
- `extensions/jobclaw-tracker/src/tracker-tool.ts` - Rate limiting, RLS fix (no .select().single())
- `extensions/jobclaw-apply/src/apply-tool.ts` - Awards synced with awards-and-press.md
- `extensions/jobclaw-tracker/index.ts` - Removed optional:true from registration
- `extensions/jobclaw-apply/index.ts` - Removed optional:true from registration
- `supabase/migrations/002_add_constraints.sql` - Unique email, submitted_at check

### Interview Prep Assets

- `skills/interview-prep/references/` - STAR stories, talk tracks, question bank
- `/Users/g/development/interview-prep-canary/` - Full example of deep company prep (Canary Technologies)

### Rate Limits

- Applications: 15/day max (in tracker-tool.ts)
- Proposals: 10/day max (in tracker-tool.ts)
- Configurable via `.env`: MAX_APPLICATIONS_PER_DAY=25, MAX_SEARCHES_PER_HOUR=20

### Priority Keywords (in daily-search.sh and SKILL.md)

**PM/Leadership:** VP Product, Head of Product, Director of Product, Director Product Management, Group PM, Staff PM, Technical PM, AI PM
**Engineer:** Forward Deployed Engineer, AI-Assisted Engineer, Vibe Coder, AI Engineer, Solutions Engineer, Founding Engineer, Prompt Engineer, AI Developer Relations
**Freelance:** Next.js, React, AI integration, Computer Vision, SaaS, MVP, Supabase, TypeScript
