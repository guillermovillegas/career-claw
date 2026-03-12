#!/usr/bin/env node
/**
 * Back-fill match_score and salary estimates on all unscored jobs.
 * Runs directly against Supabase REST API — no AI needed for scoring.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

// Load env from .env file
const env = readFileSync(join(root, ".env"), "utf8");
const getEnv = (key) => {
  const match = env.match(new RegExp(`^${key}=(.+)$`, "m"));
  return match ? match[1].trim() : null;
};

const SUPABASE_URL = getEnv("JOBCLAW_SUPABASE_URL");
const SUPABASE_KEY = getEnv("JOBCLAW_SUPABASE_KEY");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing JOBCLAW_SUPABASE_URL or JOBCLAW_SUPABASE_KEY in .env");
  process.exit(1);
}

// ── Scoring logic ──────────────────────────────────────────────────────────
// v2: Data-driven scoring based on 600-app conversion analysis (2026-03-12).
// Conf rates measured: Head 27%, Director 21%, VP 20%, Solutions 11%,
// Staff/Principal 11%, TPM 11%, FDE 7%, Senior PM 9%, Generic PM 0.9%.

// Salary estimates by seniority level (annual, USD)
const SALARY_BY_SENIORITY = {
  vp: [180000, 260000],
  head: [170000, 250000],
  director: [160000, 220000],
  staff: [165000, 225000],
  principal: [160000, 215000],
  senior: [140000, 190000],
  lead: [135000, 185000],
  manager: [130000, 175000],
  engineer: [120000, 165000],
  default: [110000, 155000],
};

// Companies with 2+ confirmations from our data — proven receptive
const PROVEN_COMPANIES = [
  "cresta",
  "webflow",
  "gitlab",
  "anthropic",
  "addepar",
  "glean",
  "you.com",
];

function scoreJob(job) {
  const t = (job.title || "").toLowerCase();
  const c = (job.company || "").toLowerCase();
  const desc = (job.description || "").toLowerCase();
  const combined = `${t} ${c}`;

  // Base score — all jobs in pipeline are already pre-filtered by target search
  let base = 20;

  // ── Role-type fit (0-40) ──
  // Primary predictor. Weighted by actual confirmation rates from 600-app dataset.
  let role = 0;
  if (/\bhead of\b|\bfounding\b.*\b(head|cpo|cto)\b/i.test(t)) {
    role = 40; // 27.3% conf — matches CPO background perfectly
  } else if (/\bdirector\b/i.test(t)) {
    role = 37; // 21.4% conf — strong leadership match
  } else if (/\bvp\b|vice president/i.test(t)) {
    role = 36; // 20.0% conf — executive-level match
  } else if (/\bsolutions?\s*(architect|engineer|consultant)/i.test(t)) {
    role = 36; // 11.3% conf — best non-leadership role, strong profile fit
  } else if (/\bforward.deployed/i.test(t)) {
    role = 34; // 7.2% conf — strong brand fit, 8/111 confirmed
  } else if (/\bstaff\b|\bprincipal\b/i.test(t)) {
    role = 30; // 11.2% conf
  } else if (/\btpm\b|\btechnical program/i.test(t)) {
    role = 28; // 11.1% conf
  } else if (/\bsenior\b.*\bproduct\s*manag/i.test(t)) {
    role = 26; // 8.8% conf — seniority helps PM roles
  } else if (/\bsenior\b|\bsr\.?\b|\blead\b/i.test(t)) {
    role = 22; // ~10% conf for senior eng
  } else if (/\bmanager\b/i.test(t)) {
    role = 15;
  } else if (/\bproduct\s*manag|\bpm\b/i.test(t)) {
    role = 10; // 0.9% conf — highly competitive, poor conversion
  } else {
    role = 12;
  }

  // ── AI/ML domain alignment (0-20) ──
  // User's differentiator: AI product building with real production experience
  let ai = 0;
  if (/\bai\b|\bartificial intelligence/i.test(t)) {
    ai += 10;
  }
  if (/\bml\b|\bmachine learning/i.test(t)) {
    ai += 8;
  }
  if (/\bllm\b|\blarge language/i.test(t)) {
    ai += 8;
  }
  if (/\bgenai\b|\bgenerative\s*ai/i.test(t)) {
    ai += 8;
  }
  if (/\bcomputer vision/i.test(t)) {
    ai += 6;
  }
  if (/\bdata\b.*\b(product|platform)/i.test(t)) {
    ai += 5;
  }
  if (/\bplatform\b/i.test(t)) {
    ai += 3;
  }
  if (/\bsaas\b|\bcloud\b/i.test(combined)) {
    ai += 2;
  }
  ai = Math.min(20, ai);

  // ── Work mode (0-10) ──
  let location = 5;
  if (job.work_mode === "remote") {
    location = 10;
  } else if (job.work_mode === "hybrid") {
    location = 5;
  } else if (job.work_mode === "on-site") {
    location = 2;
  }

  // ── Company fit (0-10) ──
  let companyFit = 0;
  if (PROVEN_COMPANIES.some((pc) => c.includes(pc))) {
    companyFit = 10;
  } else if (/\bai\b|\bml\b|data|analytics|saas|cloud|platform/i.test(c)) {
    companyFit = 5;
  }

  // ── Negative signals ──
  let penalty = 0;

  // Generic PM without AI/seniority modifier — 0.9% conversion
  if (
    /\bproduct\s*manag/i.test(t) &&
    !/\bai\b|\bml\b|\bdata\b|\bplatform\b|\binfra/i.test(t) &&
    !/\bsenior\b|\bstaff\b|\bprincipal\b|\bdirector\b|\bhead\b|\bvp\b/i.test(t)
  ) {
    penalty += 20;
  }

  // Pure coding roles with language-specific requirements in title
  if (/\bjava\b(?!script)|\bc\+\+|\brust\b|\bscala\b|\bkotlin\b|\bswift\b/i.test(t)) {
    penalty += 15;
  }

  // Junior/intern — overqualified
  if (/\bjunior\b|\bintern\b|\bentry[- ]?level\b|\bassociate\b/i.test(t)) {
    penalty += 25;
  }

  // Roles requiring deep hands-on coding (description-based when available)
  if (desc.length > 50) {
    if (
      /\b(?:8|10|12|15)\+?\s*years?\s*(?:of\s*)?(?:hands[- ]?on|coding|programming|software engineering)\b/i.test(
        desc,
      )
    ) {
      penalty += 10;
    }
  }

  const total = Math.max(0, Math.min(100, base + role + ai + location + companyFit - penalty));
  return total;
}

function estimateSalary(job) {
  if (job.salary_min != null || job.salary_max != null) {
    return null;
  } // already set
  const t = (job.title || "").toLowerCase();
  let range = SALARY_BY_SENIORITY.default;
  if (/\bvp\b|vice president/.test(t)) {
    range = SALARY_BY_SENIORITY.vp;
  } else if (/\bhead of\b/.test(t)) {
    range = SALARY_BY_SENIORITY.head;
  } else if (/\bdirector\b/.test(t)) {
    range = SALARY_BY_SENIORITY.director;
  } else if (/\bstaff\b|\bprincipal\b/.test(t)) {
    range = SALARY_BY_SENIORITY.staff;
  } else if (/\bsenior\b|\bsr\.?\b/.test(t)) {
    range = SALARY_BY_SENIORITY.senior;
  } else if (/\blead\b/.test(t)) {
    range = SALARY_BY_SENIORITY.lead;
  } else if (/manager|pm\b/.test(t)) {
    range = SALARY_BY_SENIORITY.manager;
  } else if (/engineer|developer/.test(t)) {
    range = SALARY_BY_SENIORITY.engineer;
  }
  return range;
}

// ── Fetch + update ─────────────────────────────────────────────────────────

const RESCORE_ALL = process.argv.includes("--rescore-all");

async function fetchJobs() {
  const select = "id,title,company,platform,job_type,work_mode,salary_min,salary_max,description";
  const filter = RESCORE_ALL ? "" : "&match_score=is.null";
  // Fetch in chunks to avoid PostgREST header overflow
  const allJobs = [];
  let offset = 0;
  const limit = 200;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/jobs?select=${select}${filter}&limit=${limit}&offset=${offset}&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: "count=exact",
        },
      },
    );
    const chunk = await res.json();
    if (!Array.isArray(chunk) || chunk.length === 0) {
      break;
    }
    allJobs.push(...chunk);
    if (chunk.length < limit) {
      break;
    }
    offset += limit;
  }
  return allJobs;
}

async function updateJob(id, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${id} failed: ${res.status} ${text}`);
  }
}

async function main() {
  const jobs = await fetchJobs();
  console.log(`${RESCORE_ALL ? "Rescoring" : "Scoring"} ${jobs.length} jobs (v2 algorithm)...`);

  let ok = 0,
    failed = 0,
    changed = 0;
  for (const job of jobs) {
    const newScore = scoreJob(job);
    const oldScore = job.match_score;
    const salary = estimateSalary(job);
    const patch = { match_score: newScore };
    if (salary) {
      patch.salary_min = salary[0];
      patch.salary_max = salary[1];
    }

    // Skip if score unchanged (rescore mode)
    if (RESCORE_ALL && oldScore === newScore && !salary) {
      ok++;
      continue;
    }

    try {
      await updateJob(job.id, patch);
      ok++;
      if (oldScore != null && oldScore !== newScore) {
        changed++;
      }
      const delta =
        oldScore != null
          ? ` (was ${oldScore}, ${newScore > oldScore ? "+" : ""}${newScore - oldScore})`
          : "";
      const salaryStr = salary ? `  $${salary[0] / 1000}k-$${salary[1] / 1000}k` : "";
      console.log(`  [${newScore}]${delta} ${job.title} @ ${job.company}${salaryStr}`);
    } catch (err) {
      console.error(`  FAIL: ${job.title} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${ok} scored, ${changed} changed, ${failed} failed.`);
}

main().catch(console.error);
