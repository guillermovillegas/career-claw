# CareerClaw

Automated job search, cover letter generation, and application submission pipeline. Finds jobs across LinkedIn, Greenhouse, Indeed, and Upwork; generates tailored cover letters using Gemini or local Ollama; and auto-submits applications via headless Chromium (Playwright).

## How It Works

```
Job Search ──> Score & Filter ──> Generate Cover Letters ──> Auto-Submit
   (1)              (2)                   (3)                    (4)
```

1. **Search** -- Google Search API with `site:` operators (avoids bot detection on job boards)
2. **Score** -- Each job rated 0-100 on skills match, seniority, industry, compensation, and location
3. **Cover Letters** -- LLM generates a tailored 120-220 word letter per job using your achievements
4. **Submit** -- Playwright fills and submits application forms in headless Chromium

All personal data lives in `config/profile.json`. You configure once, the scripts do the rest.

> **New here?** See [SETUP.md](SETUP.md) for detailed step-by-step setup instructions.

---

## Prerequisites

| Requirement         | Install                           |
| ------------------- | --------------------------------- |
| Node.js 22+         | `nvm install 22`                  |
| pnpm                | `npm i -g pnpm`                   |
| jq                  | `brew install jq` (macOS)         |
| Playwright browsers | `npx playwright install chromium` |
| Supabase account    | Free tier at https://supabase.com |

**LLM (pick one or both):**

| Provider       | Cost      | Install                                        |
| -------------- | --------- | ---------------------------------------------- |
| Gemini API     | Free tier | Get key at https://aistudio.google.com/apikey  |
| Ollama (local) | Free      | https://ollama.com then `ollama pull qwen3:8b` |

**Optional:**

- **Gmail App Password** -- auto-fetches Greenhouse email verification codes
- **Claude Code** -- run the full pipeline hands-free via natural language

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/your-username/career-claw.git
cd career-claw
pnpm install

# 2. Create your profile (single config for ALL personal data)
cp config/profile.example.json config/profile.json
# Edit config/profile.json with your name, email, experience, form answers, etc.

# 3. Environment variables
cp config/.env.example .env
# Edit .env with Supabase credentials and (optional) Gemini API key

# 4. Resume
cp ~/path/to/your/resume.pdf ./resume.pdf
# Set "resume_filename" in config/profile.json to match

# 5. Database -- create a Supabase project, then apply migrations
# Supabase Dashboard > SQL Editor -- paste each file in order:
#   supabase/migrations/001_careerclaw_schema.sql
#   supabase/migrations/002_add_constraints.sql
#   supabase/migrations/003_daily_summary_view_and_indexes.sql

# 6. Test (dry run -- nothing submitted)
node scripts/careerclaw/direct-apply.mjs --dry-run --limit 5
```

---

## Configuration

### config/profile.json

Single source of truth for all personal data. Every script reads from this file.

| Section        | What to fill in                                                              |
| -------------- | ---------------------------------------------------------------------------- |
| `personal`     | Name, email (use a dedicated apply email), phone, location, zip              |
| `online`       | LinkedIn, GitHub, portfolio URLs                                             |
| `professional` | Current company/title, years of experience, work auth, resume filename       |
| `target_roles` | Job titles you want, industries, work mode, min score, blacklisted companies |
| `tech_stack`   | Your skills (used in search scoring)                                         |
| `form_answers` | Pre-written answers for common application questions                         |
| `cover_letter` | Achievement bullets, role-matching guide, banned words for the LLM           |

See `config/profile.example.json` for the full template with placeholder values.

### .env

| Variable               | Required    | Notes                                                            |
| ---------------------- | ----------- | ---------------------------------------------------------------- |
| `JOBCLAW_SUPABASE_URL` | Yes         | Your Supabase project URL                                        |
| `JOBCLAW_SUPABASE_KEY` | Yes         | Service role key (Settings > API > service_role)                 |
| `GEMINI_API_KEY`       | Recommended | Free tier at https://aistudio.google.com/apikey                  |
| `GMAIL_USER`           | Optional    | For Greenhouse email verification auto-fetch                     |
| `GMAIL_APP_PASSWORD`   | Optional    | 16-char app password (https://myaccount.google.com/apppasswords) |

If `GEMINI_API_KEY` is empty, the pipeline falls back to Ollama automatically.

### Resume

Place your PDF in the project root. Set `professional.resume_filename` in `config/profile.json` to match (e.g., `"resume.pdf"`).

---

## Database Setup

1. Create a free Supabase project at https://supabase.com
2. Run the three migration files in order via SQL Editor:
   - `supabase/migrations/001_careerclaw_schema.sql` -- tables: jobs, applications, contacts, clients, proposals, automation_logs, communication_log, calendar_events, outreach_sequences, interview_prep
   - `supabase/migrations/002_add_constraints.sql` -- unique indexes, check constraints, auto-updated_at triggers
   - `supabase/migrations/003_daily_summary_view_and_indexes.sql` -- performance indexes and daily summary view
3. Copy the project URL and service_role key into `.env`

Each user creates their own Supabase project -- data is fully isolated.

---

## Scripts

All scripts live in `scripts/careerclaw/`. The three primary scripts handle the full pipeline:

### Core Pipeline

| Script                  | Purpose                                  | Usage                                                      |
| ----------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `daily-search.sh`       | Search for new jobs across boards        | `./scripts/careerclaw/daily-search.sh`                     |
| `direct-apply.mjs`      | Generate cover letters, save to DB       | `node scripts/careerclaw/direct-apply.mjs --limit 30`      |
| `submit-playwright.mjs` | Submit applications via headless browser | `node scripts/careerclaw/submit-playwright.mjs --limit 50` |

### Pipeline Coordinator

| Script          | Purpose                         | Usage                                           |
| --------------- | ------------------------------- | ----------------------------------------------- |
| `auto-apply.sh` | Run all three steps in sequence | `./scripts/careerclaw/auto-apply.sh --limit 25` |

### Monitoring & Maintenance

| Script                      | Purpose                                   | Usage                                                                  |
| --------------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| `status.sh`                 | Print pipeline status report              | `./scripts/careerclaw/status.sh`                                       |
| `track-email-responses.mjs` | Classify email responses, update statuses | `node scripts/careerclaw/track-email-responses.mjs --since 2026-03-01` |
| `rescore-jobs.mjs`          | Re-score all unscored jobs                | `node scripts/careerclaw/rescore-jobs.mjs`                             |
| `qa-audit.mjs`              | QA checks on pipeline health              | `node scripts/careerclaw/qa-audit.mjs`                                 |

### Fixing & Cleanup

| Script                  | Purpose                                 |
| ----------------------- | --------------------------------------- |
| `fix-cover-letters.mjs` | Regenerate failed/invalid cover letters |

One-time URL fix scripts live in `scripts/careerclaw/maintenance/`.

### Typical Daily Workflow

```bash
# 1. Search for new jobs
./scripts/careerclaw/daily-search.sh

# 2. Generate cover letters for top matches
node scripts/careerclaw/direct-apply.mjs --limit 30

# 3. Submit applications
node scripts/careerclaw/submit-playwright.mjs --limit 50

# 4. Track email responses
node scripts/careerclaw/track-email-responses.mjs --since "$(date -v-1d '+%Y-%m-%d')"

# 5. Check status
./scripts/careerclaw/status.sh
```

---

## Script Options

### direct-apply.mjs

```
--limit N       Max jobs to process (default: all)
--min-score N   Minimum match score (default: 50)
--dry-run       Generate but don't save to DB
```

Features:

- Tries Gemini first, falls back to Ollama
- Up to 5 generation attempts per job with feedback loop
- Auto-repair: strips banned phrases, fixes common LLM issues
- AI-copy detection: scores for cliches (threshold <= 3/10)
- Validates: company name mention, role reference, word count (120-240)
- 30-day dedup: skips if same company+role applied recently
- Rejection learning: analyzes past rejections to avoid repeated patterns

### submit-playwright.mjs

```
--limit N       Max applications to submit (default: all)
--min-score N   Minimum match score (default: 50)
--dry-run       Fill forms but don't click submit
--headed        Show browser window (for debugging)
```

Features:

- Auto-detects ATS platform (Greenhouse, Ashby, Lever, iCIMS)
- Label-based field mapping (email, phone, name, location, etc.)
- Uses `form_answers` from profile for textareas
- Uploads resume PDF
- Greenhouse: auto-fetches email verification codes via Gmail IMAP
- URL liveness checks before attempting submission
- Logs all form Q&A to automation_logs for audit

### track-email-responses.mjs

```
--since DATE    Scan emails since this date (default: last 24h)
--dry-run       Classify but don't update DB
```

Features:

- Handles ATS relay emails (greenhouse-mail.io, lever, ashby, icims, gem.com)
- Classifies: rejection, interview, assessment, offer, generic acknowledgment
- Status transition validation (prevents invalid state changes)
- Logs to communication_log table

---

## Cover Letter Generation

The pipeline generates 120-220 word cover letters tailored to each job using your achievements from `config/profile.json`.

**Provider priority:**

1. Gemini 3 Flash (API) -- fast, high quality, free tier
2. Ollama qwen3:8b (local) -- free, no API key, runs on your machine

**To run fully local with no API keys:**

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull the model (4.7GB download)
ollama pull qwen3:8b

# Verify
curl http://localhost:11434/api/tags
```

Leave `GEMINI_API_KEY` empty and the pipeline uses Ollama automatically.

### How the prompt works

The LLM receives your `cover_letter.background_bullets` (achievements with metrics) and `cover_letter.role_matching` (which bullets to lead with per role type). It randomly selects 3 bullets per letter for variety. The `cover_letter.banned_words` list prevents generic AI filler like "excited", "passionate", "leverage", etc.

### Quality gates

Every generated letter passes through:

1. **Length check** -- 800-1600 chars, 120-240 words
2. **Banned pattern scan** -- 51 patterns rejected (dear, excited, passionate, synergy, etc.)
3. **Context check** -- company name and role title must appear
4. **AI-copy detection** -- scored 0-10 for generic openers, cliches, sentence uniformity (threshold <= 3)
5. **Auto-repair** -- strips signatures, replaces AI-sounding words (seamlessly -> effectively, robust -> strong)
6. **Rejection feedback** -- past rejection patterns are fed back as "don't do this"

---

## Supported Job Boards & ATS Platforms

### Job Discovery (Search)

The `daily-search.sh` script finds jobs via Google Search API with `site:` operators. This avoids direct scraping and bot detection.

| Platform   | Search Method               | Notes                                           |
| ---------- | --------------------------- | ----------------------------------------------- |
| LinkedIn   | `site:linkedin.com/jobs`    | Full-time roles; titles, remote, location       |
| Greenhouse | `site:boards.greenhouse.io` | ATS board pages; high signal for tech companies |
| Indeed     | `site:indeed.com/viewjob`   | Broad coverage; filtered by recency             |
| Upwork     | `site:upwork.com/jobs`      | Freelance gigs; matched by tech stack           |
| Fiverr     | `site:fiverr.com/requests`  | Buyer requests; matched by service category     |

### Application Submission (Auto-Submit)

The `submit-playwright.mjs` script fills and submits forms via headless Chromium.

| ATS Platform | Auto-Submit | Detection Method     | Notes                                                |
| ------------ | :---------: | -------------------- | ---------------------------------------------------- |
| Greenhouse   |    Full     | URL: `greenhouse.io` | Email verification codes auto-fetched via Gmail IMAP |
| Ashby        |    Full     | URL: `ashbyhq.com`   | SPA forms, label-based field detection               |
| Lever        |   Partial   | URL: `lever.co`      | ~50% blocked by hCaptcha -- submit manually          |
| iCIMS        |   Partial   | URL: `icims.com`     | Multi-step forms, may need manual completion         |
| Workday      |     No      | --                   | Account-creation wall, not automatable               |
| BambooHR     |     No      | --                   | Cover letters generated, submit manually             |
| Other        |     No      | --                   | Cover letters generated, submit manually             |

### Email Response Tracking

The `track-email-responses.mjs` script classifies incoming emails from ATS platforms.

| Email Domain         | Platform   | Classification                       |
| -------------------- | ---------- | ------------------------------------ |
| `greenhouse-mail.io` | Greenhouse | Rejection, interview, acknowledgment |
| `*.lever.co`         | Lever      | Rejection, interview, assessment     |
| `*.ashbyhq.com`      | Ashby      | Rejection, interview, offer          |
| `*.icims.com`        | iCIMS      | Rejection, interview                 |
| `*.gem.com`          | Gem        | Outreach, interview scheduling       |

---

## Dashboard

A Next.js 15 dashboard for monitoring jobs, applications, and pipeline status.

### Setup

```bash
cd apps/dashboard
pnpm install

# Create env file
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EOF

# Run
pnpm dev --port 3333
# Open http://localhost:3333
```

### Pages

| Page               | What it shows                                                                  |
| ------------------ | ------------------------------------------------------------------------------ |
| Dashboard          | Pipeline metrics, top matches, funnel chart, recent activity                   |
| Jobs               | All job postings with scoring, filtering, platform badges                      |
| Applications       | Application table with status filters, inline expansion                        |
| Application Detail | Timeline, status pipeline, form fields, cover letter, notes, communication log |
| Proposals          | Freelance proposals (Upwork/Fiverr)                                            |
| Daily Summary      | Per-day stats, submitted apps, form Q&A audit, failures                        |
| Logs               | Automation and communication logs                                              |

### Deployment

The dashboard deploys to Vercel:

```bash
cd apps/dashboard
npx vercel --prod
```

---

## Architecture

### Queue-Based Writes

The OpenClaw plugin framework sandboxes all outbound writes from plugins. To work around this:

1. Plugin calls tracker tool -> writes to `~/.careerclaw/write-queue.jsonl` (local file)
2. Shell script calls `flush_queue` after agent completes -> processes queue outside sandbox
3. Direct scripts (`direct-apply.mjs`, `submit-playwright.mjs`) bypass this by calling Supabase REST API directly

### Data Flow

```
Google Search API                         Supabase PostgreSQL
       |                                        |
  daily-search.sh                          [jobs table]
  (finds jobs via web_search)                   |
       |                                  direct-apply.mjs
       v                                  (generates cover letters)
  jobclaw tracker tool                          |
  (scores + queues to JSONL)             [applications table]
       |                                        |
  flush_queue                            submit-playwright.mjs
  (processes queue -> Supabase)          (headless browser submit)
                                                |
                                         [automation_logs]
                                                |
                                         track-email-responses.mjs
                                         (Gmail IMAP -> status updates)
                                                |
                                         [communication_log]
                                                |
                                         Next.js Dashboard
```

### File Responsibilities

```
config/profile.json      -- Your personal data (gitignored)
config/profile.example.json -- Template for new users
config/load-profile.mjs  -- Shared profile loader (all scripts import this)
config/.env.example      -- Environment variable template

scripts/careerclaw/
  _common.sh             -- Shell helpers: openclaw_agent, flush_queue, db_count
  direct-apply.mjs       -- Cover letter generation + DB save
  submit-playwright.mjs  -- Headless browser form submission
  daily-search.sh        -- Job search across boards
  auto-apply.sh          -- Full pipeline coordinator
  track-email-responses.mjs -- Email classification + status updates
  lib/validation.mjs     -- Cover letter, job, app, URL validation

supabase/migrations/     -- Database schema (3 SQL files, run in order)

apps/dashboard/          -- Next.js 15 monitoring dashboard

extensions/
  jobclaw-tracker/       -- OpenClaw plugin: job/app tracking tool (16 actions)
  jobclaw-apply/         -- OpenClaw plugin: application handler
```

---

## Running with Claude Code

Claude Code can operate the entire pipeline via natural language:

```bash
# Hands-free mode
claude --dangerously-skip-permissions

# Then ask:
# "Search for new PM jobs and apply to the top 20"
# "Run the daily search and submit pipeline"
# "Check application status and follow up on stale ones"
# "Submit all pending applications with score >= 80"
```

`--dangerously-skip-permissions` lets Claude run scripts without asking. For a safer approach, run `claude` without the flag and approve each action.

---

## Automation (macOS LaunchAgents)

Run the pipeline on a daily schedule:

```bash
cat > ~/Library/LaunchAgents/com.careerclaw.daily.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.careerclaw.daily</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$PWD/scripts/careerclaw/auto-apply.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>9</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/careerclaw-daily.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/careerclaw-daily.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:$HOME/.nvm/versions/node/v22/bin:$HOME/Library/pnpm</string>
    <key>HOME</key>
    <string>$HOME</string>
  </dict>
</dict>
</plist>
EOF

# Update paths in the plist, then load:
launchctl load ~/Library/LaunchAgents/com.careerclaw.daily.plist
```

---

## Customizing for Your Profile

### What to change

1. `config/profile.json` -- all personal info, experience, form answers, cover letter config
2. `.env` -- API keys and Supabase credentials
3. Resume PDF in project root
4. `skills/` directory -- if using OpenClaw agents, update with your background

### What NOT to change

- `scripts/careerclaw/*.mjs` -- read from `config/profile.json` automatically
- `supabase/migrations/` -- schema is generic, works for any user
- `apps/dashboard/` -- displays whatever is in your Supabase database
- `config/load-profile.mjs` -- shared profile loader utility

### Form answer tips

- **`professional_summary`** -- 2-3 sentence elevator pitch. Fallback for unknown textareas.
- **`ai_experience`** -- Detailed paragraph about AI/ML work. Used for "describe your experience with AI" questions.
- **`why_interested`** -- Generic "why this role" answer. Keep broad enough for many companies.
- **`additional_info`** -- "Anything else?" answer. Include strongest differentiators.
- **`compensation_expectation`** -- Numeric salary (e.g., `"200000"`). Some forms require a number.
- **`compensation_text`** -- Text for salary questions (e.g., `"Open to discussion based on total package"`).

### Cover letter tips

- **`background_bullets`** -- 4-6 achievements with specific metrics. The pipeline picks 3 randomly per letter for variety.
- **`role_matching`** -- Maps role types to which bullets to lead with. Example: `"AI/ML Engineer -> lead with ML project, mention production pipelines"`
- **`banned_words`** -- Comma-separated words the LLM must avoid. The default list blocks 50+ common AI cliches.

---

## Known Limitations

- **Lever hCaptcha** -- blocks ~50% of headless submissions. Submit Lever jobs manually.
- **Ashby expiration** -- dead Ashby postings return HTTP 200 with empty body. The pipeline detects this but some may slip through.
- **Greenhouse verification** -- Gmail IMAP polling can time out if the verification email is slow.
- **iCIMS multi-step** -- some iCIMS sites have multi-step account creation that Playwright can't handle.
- **Bot detection** -- job sites block direct browser navigation. Scripts use `web_search` (Google API) instead.
- **Custom essays** -- some applications have unique essay questions. Generic handlers exist but may not fit every question.
- **RAM** -- Ollama models larger than 8B parameters (qwen2.5:14b, gemma3:12b) cause swap thrashing on 16GB Macs.

---

## Troubleshooting

### "Cannot load profile" error

```bash
cp config/profile.example.json config/profile.json
# Then edit with your details
```

### Playwright not finding browser

```bash
npx playwright install chromium
```

### Supabase 401 errors

Check that `JOBCLAW_SUPABASE_KEY` in `.env` is the **service_role** key (not anon). Find it in Supabase Dashboard > Settings > API.

### Greenhouse email verification failing

1. Ensure `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set in `.env`
2. The Gmail account must match the email in `config/profile.json`
3. Create an App Password at https://myaccount.google.com/apppasswords (requires 2FA enabled)

### Cover letters not generating

1. Check Ollama is running: `curl http://localhost:11434/api/tags`
2. Check Gemini key: `GEMINI_API_KEY` in `.env`
3. Test: `node scripts/careerclaw/direct-apply.mjs --dry-run --limit 1`

### Dashboard 500 error

Make sure `apps/dashboard/.env.local` exists with both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Ollama out of memory

Use a smaller model: `ollama pull qwen3:8b` instead of 14b models. On 16GB Macs, anything above 8B causes swap thrashing.

---

## Tech Stack

- **Node.js 22** / **pnpm** -- runtime and package manager
- **Playwright** -- headless Chromium for form submission
- **Supabase** (PostgreSQL) -- job and application storage
- **Gemini API** / **Ollama** -- LLM cover letter generation
- **imapflow** -- Gmail IMAP for verification codes
- **Next.js 15** + **React 19** + **Tailwind CSS 4** -- monitoring dashboard
- **Shell scripts** + **jq** -- pipeline orchestration
- **Zod** -- input validation

---

## License

MIT
