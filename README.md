# CareerClaw

Automated job search, cover letter generation, and application submission pipeline. Finds jobs across LinkedIn, Greenhouse, Indeed, and Upwork, generates tailored cover letters using local LLMs (Ollama) or Gemini API, and auto-submits applications via headless Chromium (Playwright).

## How It Works

```
Job Search → Score & Filter → Generate Cover Letters → Auto-Submit
   (1)           (2)                 (3)                   (4)
```

1. **Search** — Finds jobs via Google search API with `site:` operators across major job boards
2. **Score** — Rates each job 0-100 based on skills match, seniority, and industry fit
3. **Cover Letters** — LLM generates a tailored 100-140 word cover letter per job using your achievements
4. **Submit** — Playwright fills out and submits application forms in headless Chromium

Each user gets their own Supabase database. All personal data lives in `config/profile.json` — you never edit the scripts.

---

## Prerequisites

- **Node.js 22+** (`nvm install 22`)
- **pnpm** (`npm i -g pnpm`)
- **jq** (`brew install jq` on macOS)
- **Supabase account** (free tier works: https://supabase.com)
- **LLM for cover letters** (pick one or both):
  - **Ollama** (free, local): https://ollama.com — then `ollama pull llama3.2`
  - **Gemini API** (free tier): https://aistudio.google.com/apikey

### Optional

- **Gmail App Password** — for auto-fetching Greenhouse email verification codes
- **Claude Code** — for running the full pipeline hands-free via natural language

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/your-org/career-claw.git
cd career-claw

# 2. Install
pnpm install

# 3. Profile — single config file for ALL your personal data
cp config/profile.example.json config/profile.json
# Edit config/profile.json with your name, email, experience, form answers, etc.

# 4. Environment variables
cp config/.env.example .env
# Edit .env with your Supabase credentials and (optional) Gemini API key

# 5. Resume — place your PDF in the project root
cp ~/path/to/your/resume.pdf ./resume.pdf
# Set "resume_filename" in config/profile.json to match

# 6. Database — create a Supabase project, then apply migrations
# Option A: Supabase Dashboard > SQL Editor — paste each file in order
# Option B: supabase db push
supabase db push

# 7. Test (dry run — no submissions)
node scripts/careerclaw/direct-apply.mjs --dry-run --limit 5
```

---

## Configuration

### config/profile.json

Single source of truth for all personal data. Every script reads from this file.

| Section        | What to fill in                                                          |
| -------------- | ------------------------------------------------------------------------ |
| `personal`     | Name, email (use a dedicated job-apply email), phone, location, zip code |
| `online`       | LinkedIn, GitHub, portfolio URLs                                         |
| `professional` | Current company/title, years of experience, work auth, resume filename   |
| `target_roles` | Job titles, industries, work mode preference, blacklisted companies      |
| `tech_stack`   | Your technical skills (used in search scoring prompts)                   |
| `form_answers` | Pre-written answers for common application questions                     |
| `cover_letter` | Achievement bullets, role-matching guide, banned words for LLM           |

See `config/profile.example.json` for the full template with placeholder values.

### .env

| Variable               | Required    | Notes                                                            |
| ---------------------- | ----------- | ---------------------------------------------------------------- |
| `JOBCLAW_SUPABASE_URL` | Yes         | Your Supabase project URL                                        |
| `JOBCLAW_SUPABASE_KEY` | Yes         | Service role key (Settings > API > service_role)                 |
| `GEMINI_API_KEY`       | Recommended | Free tier at https://aistudio.google.com/apikey                  |
| `GMAIL_USER`           | Optional    | For Greenhouse email verification auto-fetch                     |
| `GMAIL_APP_PASSWORD`   | Optional    | 16-char app password (https://myaccount.google.com/apppasswords) |

### Resume

Place your resume PDF in the project root. Set `professional.resume_filename` in `config/profile.json` to match (e.g., `"resume.pdf"`).

---

## Database Setup

1. Create a free Supabase project at https://supabase.com
2. Run the migrations in order via SQL Editor:
   - `supabase/migrations/001_careerclaw_schema.sql` — Core tables (jobs, applications, contacts, etc.)
   - `supabase/migrations/002_add_constraints.sql` — Unique indexes and check constraints
   - `supabase/migrations/003_daily_summary_view_and_indexes.sql` — Performance indexes and summary view
3. Copy the project URL and service_role key into your `.env`

Each user creates their own Supabase project — data is fully isolated.

---

## Key Scripts

All scripts live in `scripts/careerclaw/`.

| Script                  | What it does                                         | How to run                                                 |
| ----------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| `direct-apply.mjs`      | Generate cover letters via Gemini/Ollama, save to DB | `node scripts/careerclaw/direct-apply.mjs --limit 30`      |
| `submit-playwright.mjs` | Submit applications via headless browser             | `node scripts/careerclaw/submit-playwright.mjs --limit 50` |
| `auto-apply.sh`         | Full pipeline: search, score, apply, submit          | `./scripts/careerclaw/auto-apply.sh --limit 25`            |
| `daily-search.sh`       | Search for new jobs across all boards                | `./scripts/careerclaw/daily-search.sh`                     |
| `rescore-jobs.mjs`      | Re-score all unscored jobs in DB                     | `node scripts/careerclaw/rescore-jobs.mjs`                 |
| `status.sh`             | Print pipeline status report                         | `./scripts/careerclaw/status.sh`                           |

### Typical daily workflow

```bash
# 1. Search for new jobs
./scripts/careerclaw/daily-search.sh

# 2. Generate cover letters for top matches
node scripts/careerclaw/direct-apply.mjs --limit 30

# 3. Submit applications
node scripts/careerclaw/submit-playwright.mjs --limit 50

# 4. Check status
./scripts/careerclaw/status.sh
```

---

## Cover Letter Generation

The pipeline generates 100-140 word cover letters tailored to each job, using your achievements from `config/profile.json`. It tries providers in order:

1. **Gemini 3 Flash** (API) — fast, high quality, free tier available
2. **Ollama llama3.2** (local) — free, no API key, runs on your machine

To run **fully local** with no API keys:

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull the model
ollama pull llama3.2

# Verify it's running
curl http://localhost:11434/api/tags
```

Leave `GEMINI_API_KEY` empty in `.env` and the pipeline will use Ollama automatically.

### How the prompt works

The LLM receives your `cover_letter.background_bullets` (achievements with metrics) and `cover_letter.role_matching` (which bullets to lead with per role type). It picks the most relevant proof points for each specific job title. The `cover_letter.banned_words` list prevents generic filler.

---

## Supported Job Boards

| Platform   | Auto-Submit | Notes                                           |
| ---------- | :---------: | ----------------------------------------------- |
| Greenhouse |     Yes     | Full support including email verification codes |
| Ashby      |     Yes     | SPA-based forms, label-based field detection    |
| Lever      |   Partial   | ~50% blocked by hCaptcha (submit manually)      |
| iCIMS      |   Partial   | Multi-step forms may need manual completion     |
| Other      |     No      | Cover letters generated, submit manually        |

---

## Dashboard

A Next.js dashboard for monitoring jobs, applications, and pipeline status.

```bash
# Install deps
cd apps/dashboard && pnpm install && cd ../..

# Set up env (same Supabase credentials)
cp apps/dashboard/.env.local.example apps/dashboard/.env.local
# Edit with your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# Run
cd apps/dashboard && npx next dev --turbopack --port 3333
# Open http://localhost:3333
```

---

## Running with Claude Code

Claude Code can operate the entire pipeline via natural language:

```bash
# Hands-free mode — auto-accepts all tool calls
claude --dangerously-skip-permissions

# Then ask it to:
# "Search for new PM jobs and apply to the top 20"
# "Run the daily search and submit pipeline"
# "Check application status and follow up on stale ones"
# "Submit all pending applications"
```

The `--dangerously-skip-permissions` flag lets Claude run shell commands, edit files, and execute scripts without asking for confirmation. **Review what it does.** For a safer approach, run `claude` without the flag and approve each action.

---

## Automation (macOS LaunchAgents)

Run the pipeline on a schedule:

```bash
cat > ~/Library/LaunchAgents/com.careerclaw.daily-search.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
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
    <string>/usr/local/bin:/usr/bin:/bin:/usr/local/share/nvm/versions/node/v22/bin</string>
    <key>HOME</key>
    <string>/Users/yourusername</string>
  </dict>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.careerclaw.daily-search.plist
```

Update the path and HOME to match your system.

---

## Customizing for Your Profile

### What to change

1. **`config/profile.json`** — All personal info, experience, form answers, cover letter config
2. **`.env`** — API keys and Supabase credentials
3. **Resume PDF** — Your resume in the project root
4. **`skills/` directory** — If using OpenClaw agents, update skill files with your background

### What NOT to change

- `scripts/careerclaw/*.mjs` — Read from `config/profile.json` automatically
- `supabase/migrations/` — Schema is generic, works for any user
- `apps/dashboard/` — Displays whatever is in your database
- `config/load-profile.mjs` — Profile loader utility

### Form answer tips

- **`professional_summary`** — 2-3 sentence elevator pitch. Fallback for unknown textareas.
- **`ai_experience`** — Detailed paragraph about AI/ML work. Used for "describe your experience" questions.
- **`why_interested`** — Generic "why this role" answer. Keep broad enough for many companies.
- **`additional_info`** — "Anything else?" answer. Include strongest differentiators.
- **`compensation_expectation`** — Numeric salary (e.g., `"200000"`). Some forms require a number.
- **`compensation_text`** — Text for salary questions (e.g., `"Open to discussion based on total package"`).

### Cover letter tips

- **`background_bullets`** — Achievements with specific metrics. The LLM picks the most relevant per role.
- **`role_matching`** — Maps role types to which bullets to lead with. Helps tailoring.
- **`banned_words`** — Comma-separated words/phrases the LLM must avoid.

---

## Project Structure

```
career-claw/
  config/
    profile.example.json   # Template — copy to profile.json
    profile.json           # YOUR data (gitignored)
    load-profile.mjs       # Shared profile loader
    .env.example           # Template — copy to .env
  scripts/careerclaw/
    direct-apply.mjs       # Cover letter generation + DB save
    submit-playwright.mjs  # Headless browser form submission
    submit-applications.mjs# Application submission coordinator
    auto-apply.sh          # Full pipeline script
    daily-search.sh        # Job search across boards
    rescore-jobs.mjs       # Re-score jobs in DB
    status.sh              # Pipeline status report
    _common.sh             # Shared shell helpers
  supabase/migrations/     # Database schema (3 migration files)
  apps/dashboard/          # Next.js monitoring dashboard
  extensions/              # OpenClaw plugin extensions
  skills/                  # OpenClaw agent skill definitions
```

---

## Tech Stack

- **Node.js 22+** / **pnpm** — runtime and package manager
- **Playwright** — headless Chromium for form submission
- **Supabase** (PostgreSQL) — job and application data storage
- **Ollama** / **Gemini API** — LLM cover letter generation
- **Next.js 15** — monitoring dashboard
- **Shell scripts** + **jq** — pipeline orchestration

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
3. Create an App Password at https://myaccount.google.com/apppasswords (requires 2FA)

### Cover letters not generating

1. Check Ollama: `curl http://localhost:11434/api/tags`
2. Check Gemini key: verify `GEMINI_API_KEY` in `.env`
3. Test: `node scripts/careerclaw/direct-apply.mjs --dry-run --limit 1`

### Dashboard 500 error

Make sure `apps/dashboard/.env.local` exists with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## License

MIT
