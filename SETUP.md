# CareerClaw Setup Guide

Detailed step-by-step setup for new users. For a quick overview, see [README.md](README.md).

---

## 1. Prerequisites

```bash
# Node.js 22+ (via nvm)
nvm install 22
nvm use 22

# pnpm package manager
npm i -g pnpm

# jq for JSON processing in shell scripts
brew install jq          # macOS
# apt install jq         # Linux

# Playwright browsers (headless Chromium for form submission)
npx playwright install chromium
```

## 2. Clone & Install

```bash
git clone https://github.com/your-username/career-claw.git
cd career-claw
pnpm install
```

## 3. Create Your Profile

```bash
cp config/profile.example.json config/profile.json
```

Edit `config/profile.json` with your details. Every script reads from this single file.

**Required fields:**

| Field                 | Example                             | Used by                      |
| --------------------- | ----------------------------------- | ---------------------------- |
| `personal.first_name` | `"Jane"`                            | Form filling, cover letters  |
| `personal.last_name`  | `"Doe"`                             | Form filling, cover letters  |
| `personal.email`      | `"jane.applies@gmail.com"`          | Form filling, email tracking |
| `personal.phone`      | `"5551234567"`                      | Form filling                 |
| `personal.location`   | `"San Francisco, CA"`               | Form filling, job scoring    |
| `online.linkedin`     | `"https://linkedin.com/in/janedoe"` | Form filling                 |
| `online.github`       | `"https://github.com/janedoe"`      | Form filling                 |

**Recommended fields:**

| Field                                | Purpose                                                |
| ------------------------------------ | ------------------------------------------------------ |
| `cover_letter.background_bullets`    | 4-6 achievements with metrics. LLM picks 3 per letter. |
| `cover_letter.role_matching`         | Maps role types to which bullets to lead with.         |
| `cover_letter.banned_words`          | Words the LLM must avoid (AI cliches).                 |
| `form_answers.professional_summary`  | Fallback text for unknown textarea fields.             |
| `form_answers.why_interested`        | Generic "why this role" answer.                        |
| `target_roles.blacklisted_companies` | Companies to never apply to.                           |

See `config/profile.example.json` for all fields with placeholder values.

## 4. Environment Variables

```bash
cp config/.env.example .env
```

Edit `.env` with your credentials:

### Supabase (required)

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **Settings > API**
3. Copy:
   - **Project URL** -> `JOBCLAW_SUPABASE_URL`
   - **service_role key** (NOT anon key) -> `JOBCLAW_SUPABASE_KEY`

### Gemini API (recommended)

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Create an API key
3. Set `GEMINI_API_KEY` in `.env`

If you skip this, the pipeline falls back to Ollama (local LLM).

### Ollama (alternative to Gemini)

```bash
# Install
curl -fsSL https://ollama.com/install.sh | sh

# Pull model (4.7GB)
ollama pull qwen3:8b

# Verify
curl http://localhost:11434/api/tags
```

Leave `GEMINI_API_KEY` empty and scripts use Ollama automatically.

### Gmail IMAP (optional)

Only needed if you want auto-verification of Greenhouse email codes.

1. Enable 2FA on your Gmail account
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Generate an App Password for "Mail"
4. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env`

The Gmail account **must** match the email in `config/profile.json`.

## 5. Resume

```bash
cp ~/path/to/your/resume.pdf ./resume.pdf
```

Set `professional.resume_filename` in `config/profile.json` to match (e.g., `"resume.pdf"`).

The resume PDF is gitignored by default (`*.resume.pdf` pattern).

## 6. Database

Run the three migration files in your Supabase SQL Editor (in order):

1. `supabase/migrations/001_careerclaw_schema.sql` -- creates all tables
2. `supabase/migrations/002_add_constraints.sql` -- adds indexes and constraints
3. `supabase/migrations/003_daily_summary_view_and_indexes.sql` -- performance indexes

Or via Supabase CLI:

```bash
npx supabase db push --db-url "postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_ID.supabase.co:5432/postgres"
```

## 7. Verify Setup

```bash
# Test cover letter generation (dry run, nothing saved)
node scripts/careerclaw/direct-apply.mjs --dry-run --limit 1

# Check DB connection
./scripts/careerclaw/status.sh
```

## 8. Dashboard (optional)

```bash
cd apps/dashboard

cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EOF

pnpm install
pnpm dev --port 3333
# Open http://localhost:3333
```

---

## Daily Usage

```bash
# Search for new jobs
./scripts/careerclaw/daily-search.sh

# Generate cover letters
node scripts/careerclaw/direct-apply.mjs --limit 30

# Submit applications
node scripts/careerclaw/submit-playwright.mjs --limit 50

# Track email responses
node scripts/careerclaw/track-email-responses.mjs --since "$(date -v-1d '+%Y-%m-%d')"

# Check pipeline status
./scripts/careerclaw/status.sh
```

Or run everything at once:

```bash
./scripts/careerclaw/auto-apply.sh --limit 25
```
