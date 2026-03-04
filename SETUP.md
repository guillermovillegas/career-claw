# CareerClaw Setup Guide

Automated job search, cover letter generation, and application submission pipeline. Uses headless Chromium (Playwright) to submit applications to Greenhouse, Lever, and Ashby job boards. Cover letters are generated via local LLMs (Ollama) or Gemini API.

## Prerequisites

- **Node.js 22+** (via nvm: `nvm install 22`)
- **pnpm** (`npm i -g pnpm`)
- **jq** (`brew install jq` on macOS)
- **Playwright** (auto-installed with deps)
- **Supabase account** (free tier works: https://supabase.com)
- **LLM for cover letters** (pick one or both):
  - **Ollama** (free, local): https://ollama.com — then `ollama pull llama3.2`
  - **Gemini API** (free tier available): https://aistudio.google.com/apikey

### Optional

- **Gmail App Password** — for auto-fetching Greenhouse email verification codes
- **OpenClaw** — for agent-based job search scripts (the direct scripts work without it)

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/your-org/career-claw.git
cd career-claw

# 2. Install dependencies
pnpm install

# 3. Set up your profile
cp config/profile.example.json config/profile.json
# Edit config/profile.json with YOUR details (name, email, experience, etc.)

# 4. Set up environment variables
cp config/.env.example .env
# Edit .env with YOUR API keys and Supabase credentials

# 5. Add your resume
# Place your resume PDF in the project root.
# Update "resume_filename" in config/profile.json to match.
cp ~/path/to/your/resume.pdf ./resume.pdf

# 6. Set up the database
# Create a Supabase project, then apply the migrations:
# Option A: Via Supabase Dashboard SQL Editor — paste each file in order
# Option B: Via Supabase CLI
supabase db push

# 7. Test it
node scripts/careerclaw/direct-apply.mjs --dry-run --limit 3
```

---

## Configuration

### config/profile.json

This is the single source of truth for all your personal data. Every script reads from this file. Key sections:

| Section        | What to fill in                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `personal`     | Name, email (use a dedicated job-apply email), phone, location                                                   |
| `online`       | LinkedIn, GitHub, portfolio URLs                                                                                 |
| `professional` | Current company/title, years of experience breakdown, work auth status, resume filename                          |
| `target_roles` | Job titles you want, industries, work mode preference, companies to blacklist                                    |
| `tech_stack`   | Your tech skills (used in job search scoring prompts)                                                            |
| `form_answers` | Pre-written answers for common application questions (professional summary, AI experience, why interested, etc.) |
| `cover_letter` | Background bullets, role-matching guide, banned words — used by the LLM prompt for cover letter generation       |

### .env

API keys and database credentials. Required variables:

| Variable               | Required    | Notes                                                               |
| ---------------------- | ----------- | ------------------------------------------------------------------- |
| `JOBCLAW_SUPABASE_URL` | Yes         | Your Supabase project URL                                           |
| `JOBCLAW_SUPABASE_KEY` | Yes         | Service role key (Settings > API > service_role)                    |
| `GEMINI_API_KEY`       | Recommended | Free tier at https://aistudio.google.com/apikey                     |
| `GMAIL_USER`           | Optional    | For Greenhouse email verification code auto-fetch                   |
| `GMAIL_APP_PASSWORD`   | Optional    | 16-char app password from https://myaccount.google.com/apppasswords |

### Resume

Place your resume PDF in the project root. Set `professional.resume_filename` in `config/profile.json` to match the filename (e.g., `"resume.pdf"`).

---

## Database Setup

1. Create a free Supabase project at https://supabase.com
2. Go to SQL Editor and run the migrations in order:
   - `supabase/migrations/001_careerclaw_schema.sql` — Core tables (jobs, applications, contacts, etc.)
   - `supabase/migrations/002_add_constraints.sql` — Unique indexes and check constraints
   - `supabase/migrations/003_daily_summary_view_and_indexes.sql` — Performance indexes and daily summary view
3. Copy the project URL and service_role key into your `.env`

---

## How It Works

### Pipeline Overview

```
Job Search → Score & Save → Generate Cover Letters → Submit Applications
   (1)           (2)              (3)                     (4)
```

1. **Job Search**: Finds jobs on LinkedIn, Greenhouse, Indeed via Google search API
2. **Score & Save**: Scores jobs 0-100 based on skills match, seniority, industry fit
3. **Cover Letters**: LLM generates tailored 100-140 word cover letters per job
4. **Submit**: Playwright fills out and submits forms on Greenhouse, Lever, Ashby

### Key Scripts

| Script                  | What it does                                         | How to run                                                 |
| ----------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| `direct-apply.mjs`      | Generate cover letters via Gemini/Ollama, save to DB | `node scripts/careerclaw/direct-apply.mjs --limit 30`      |
| `submit-playwright.mjs` | Submit applications via headless browser             | `node scripts/careerclaw/submit-playwright.mjs --limit 50` |
| `rescore-jobs.mjs`      | Re-score all unscored jobs in the database           | `node scripts/careerclaw/rescore-jobs.mjs`                 |
| `daily-search.sh`       | Search for new jobs (requires OpenClaw)              | `./scripts/careerclaw/daily-search.sh`                     |
| `auto-apply.sh`         | Full pipeline: fetch jobs → cover letters → submit   | `./scripts/careerclaw/auto-apply.sh --limit 25`            |
| `status.sh`             | Print pipeline status report                         | `./scripts/careerclaw/status.sh`                           |

### LLM Cover Letter Generation

The pipeline tries LLMs in this order:

1. **Gemini 3 Flash** (via API) — fast, high quality, free tier available
2. **Ollama llama3.2** (local) — free, runs on your machine, no API key needed

To use **only local LLMs**, leave `GEMINI_API_KEY` empty in `.env` and make sure Ollama is running:

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull the model
ollama pull llama3.2

# Verify it's running
curl http://localhost:11434/api/tags
```

---

## Running with Claude Code

You can use Claude Code to operate the full pipeline interactively:

```bash
# Run Claude Code with auto-accept for hands-free operation
claude --dangerously-skip-permissions

# Then ask it to:
# "Search for new PM jobs and apply to the top 20"
# "Run the daily search and submit pipeline"
# "Check application status and follow up on stale ones"
```

The `--dangerously-skip-permissions` flag lets Claude run shell commands, edit files, and execute scripts without asking for confirmation on each step. **Use with caution** — review what it's doing. For a safer approach:

```bash
# Normal mode — Claude asks permission for each action
claude
```

---

## Supported Job Boards

| Platform       | Auto-Submit | Notes                                           |
| -------------- | ----------- | ----------------------------------------------- |
| **Greenhouse** | Yes         | Full support including email verification codes |
| **Lever**      | Partial     | ~50% have hCaptcha blocking (submit manually)   |
| **Ashby**      | Yes         | SPA-based forms, label-based field detection    |
| **iCIMS**      | Partial     | Multi-step forms may need manual completion     |
| **Other**      | No          | Cover letters generated, submit manually        |

---

## Dashboard

A Next.js dashboard for monitoring your pipeline:

```bash
# Install dashboard deps
cd apps/dashboard && pnpm install && cd ../..

# Set up dashboard env
cp apps/dashboard/.env.local.example apps/dashboard/.env.local
# Edit with your Supabase URL and key

# Run locally
pnpm --filter @careerclaw/dashboard dev --port 3333
# Open http://localhost:3333
```

---

## Automation (macOS LaunchAgents)

To run the pipeline on a schedule, create LaunchAgent plists:

```bash
# Example: daily job search at 3 PM weekdays
cat > ~/Library/LaunchAgents/com.careerclaw.daily-search.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.careerclaw.daily-search</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/path/to/career-claw/scripts/careerclaw/daily-search.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>15</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/careerclaw-daily.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/careerclaw-daily.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:$HOME/.nvm/versions/node/v22.19.0/bin</string>
    <key>HOME</key>
    <string>/Users/yourusername</string>
  </dict>
</dict>
</plist>
EOF

# Load it
launchctl load ~/Library/LaunchAgents/com.careerclaw.daily-search.plist
```

---

## Customizing for Your Profile

### What to change

1. **`config/profile.json`** — All your personal info, experience, and form answers
2. **`.env`** — Your API keys and Supabase credentials
3. **Resume PDF** — Your actual resume in the project root
4. **`skills/` directory** — If using OpenClaw agents, update the skill files with your background

### What NOT to change

- `scripts/careerclaw/*.mjs` — These read from `config/profile.json` automatically
- `supabase/migrations/` — Schema is generic, works for any user
- `apps/dashboard/` — Dashboard is generic, displays whatever is in your DB
- `config/load-profile.mjs` — Profile loader utility

### Form answer tips

The `form_answers` section in `profile.json` is used to auto-fill common application questions:

- **`professional_summary`** — 2-3 sentences, your elevator pitch. Used as fallback for any unknown textarea.
- **`ai_experience`** — Detailed paragraph about your AI/ML work. Used for "describe your experience" questions.
- **`why_interested`** — Generic "why this role" answer. Keep it broad enough to work for many companies.
- **`additional_info`** — "Anything else?" answer. Include your strongest differentiators.
- **`compensation_expectation`** — Numeric salary (e.g., "200000"). Some forms require a number.
- **`compensation_text`** — Text answer for salary questions (e.g., "Open to discussion based on total package").

### Cover letter tips

The `cover_letter` section controls LLM-generated cover letters:

- **`background_bullets`** — Your key achievements with specific metrics. The LLM picks the most relevant ones per role.
- **`role_matching`** — Maps role types to which achievements to lead with. Helps the LLM tailor effectively.
- **`banned_words`** — Words/phrases the LLM should never use. Keeps letters professional and non-generic.

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

Check that `JOBCLAW_SUPABASE_KEY` in `.env` is the **service_role** key (not the anon key). Find it in Supabase Dashboard > Settings > API.

### Greenhouse email verification failing

1. Ensure `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set in `.env`
2. The Gmail account must be the same email you apply with
3. Create an App Password at https://myaccount.google.com/apppasswords (requires 2FA enabled)

### Cover letters not generating

1. Check if Ollama is running: `curl http://localhost:11434/api/tags`
2. If using Gemini, verify `GEMINI_API_KEY` in `.env`
3. Try: `node scripts/careerclaw/direct-apply.mjs --dry-run --limit 1`
