# CareerClaw

Automated job search, cover letter generation, and application submission pipeline.

CareerClaw finds jobs across LinkedIn, Greenhouse, Indeed, and Upwork, generates tailored cover letters using local LLMs or Gemini API, and auto-submits applications via headless Chromium (Playwright) to Greenhouse, Lever, Ashby, and iCIMS job boards.

## How It Works

```
Job Search → Score & Filter → Generate Cover Letters → Auto-Submit Applications
```

1. **Search** — Finds jobs via Google search API across major job boards
2. **Score** — Rates each job 0-100 based on skills match, seniority, and industry fit
3. **Cover Letters** — LLM generates a tailored 100-140 word cover letter per job
4. **Submit** — Playwright fills out and submits application forms in headless Chromium

## Quick Start

```bash
git clone https://github.com/your-org/career-claw.git
cd career-claw
pnpm install

# Set up your profile (single config file for all personal data)
cp config/profile.example.json config/profile.json
# Edit config/profile.json with your details

# Set up environment variables
cp config/.env.example .env
# Edit .env with your Supabase credentials and (optional) Gemini API key

# Add your resume PDF to the project root
cp ~/path/to/resume.pdf ./resume.pdf

# Test it (dry run — no submissions)
node scripts/careerclaw/direct-apply.mjs --dry-run --limit 5
```

See **[SETUP.md](SETUP.md)** for full setup instructions including database setup, LLM configuration, dashboard, and macOS automation.

## Key Scripts

| Script                  | Description                                 | Example                                                    |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `direct-apply.mjs`      | Generate cover letters and save to DB       | `node scripts/careerclaw/direct-apply.mjs --limit 30`      |
| `submit-playwright.mjs` | Submit applications via headless browser    | `node scripts/careerclaw/submit-playwright.mjs --limit 50` |
| `auto-apply.sh`         | Full pipeline: search, score, apply, submit | `./scripts/careerclaw/auto-apply.sh --limit 25`            |
| `daily-search.sh`       | Search for new jobs                         | `./scripts/careerclaw/daily-search.sh`                     |
| `rescore-jobs.mjs`      | Re-score all jobs in DB                     | `node scripts/careerclaw/rescore-jobs.mjs`                 |
| `status.sh`             | Print pipeline status                       | `./scripts/careerclaw/status.sh`                           |

## Cover Letter Generation

Cover letters are generated per-job using your profile's achievements and role-matching config:

1. **Gemini 3 Flash** (API, free tier) — tried first
2. **Ollama llama3.2** (local, free) — fallback if Gemini unavailable

To run fully local with no API keys, just install Ollama and pull llama3.2:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2
```

## Supported Job Boards

| Platform   | Auto-Submit | Notes                                     |
| ---------- | :---------: | ----------------------------------------- |
| Greenhouse |     Yes     | Full support including email verification |
| Ashby      |     Yes     | SPA-based forms, label detection          |
| Lever      |   Partial   | ~50% blocked by hCaptcha                  |
| iCIMS      |   Partial   | Multi-step forms may need manual help     |

## Configuration

All personal data lives in a single file: `config/profile.json`. Scripts read from this file automatically.

Key sections:

- **personal** — name, email, phone, location
- **professional** — experience, work authorization, resume filename
- **target_roles** — desired titles, industries, blacklisted companies
- **form_answers** — pre-written answers for common application questions
- **cover_letter** — achievements, role-matching rules, banned words for LLM

See `config/profile.example.json` for the full template.

## Dashboard

A Next.js dashboard for monitoring your pipeline:

```bash
cd apps/dashboard && pnpm install && cd ../..
pnpm --filter @careerclaw/dashboard dev --port 3333
```

## Running with Claude Code

```bash
# Hands-free mode (auto-accepts all tool calls)
claude --dangerously-skip-permissions

# Then ask:
# "Run daily search and apply to the top 20"
# "Submit all pending applications"
# "Check pipeline status"
```

## Tech Stack

- **Node.js 22+** / **pnpm**
- **Playwright** for headless browser automation
- **Supabase** (PostgreSQL) for job and application data
- **Ollama** / **Gemini API** for cover letter generation
- **Next.js** dashboard for monitoring
- **Shell scripts** + **jq** for pipeline orchestration

## License

MIT
