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

function scoreJob(job) {
  const t = (job.title || "").toLowerCase();
  const c = (job.company || "").toLowerCase();
  const combined = `${t} ${c}`;

  // Skills match (0-40)
  let skills = 10; // baseline
  const skillKeys = [
    "ai",
    "ml ",
    "machine learning",
    "typescript",
    "next.js",
    "nextjs",
    "react",
    "supabase",
    "python",
    "llm",
    "computer vision",
    "product manager",
    "forward deployed",
    "solutions engineer",
    "full stack",
    "full-stack",
  ];
  for (const kw of skillKeys) {
    if (combined.includes(kw)) {
      if (["ai", "machine learning", "llm", "computer vision"].includes(kw)) {
        skills += 8;
      } else if (["typescript", "next.js", "nextjs", "react"].includes(kw)) {
        skills += 6;
      } else if (["forward deployed", "solutions engineer"].includes(kw)) {
        skills += 8;
      } else {
        skills += 4;
      }
    }
  }
  skills = Math.min(40, skills);

  // Seniority (0-20)
  let seniority = 0;
  if (/\bvp\b|vice president/.test(t)) {
    seniority = 20;
  } else if (/\bhead of\b|\bfounding\b/.test(t)) {
    seniority = 18;
  } else if (/\bdirector\b|\bstaff\b|\bprincipal\b/.test(t)) {
    seniority = 15;
  } else if (/\bsenior\b|\bsr\.?\b|\blead\b/.test(t)) {
    seniority = 10;
  } else if (/\bmanager\b|\bpm\b/.test(t)) {
    seniority = 8;
  } else {
    seniority = 5;
  }

  // Industry fit (0-15)
  let industry = 5;
  if (/\bai\b|\bml\b|llm|machine learning|computer vision/.test(combined)) {
    industry = 15;
  } else if (/saas|platform|data|analytics|cloud/.test(combined)) {
    industry = 10;
  }

  // Compensation (0-15) — unknown = 5
  const comp = 5;

  // Location/mode (0-10)
  let location = 5;
  if (job.work_mode === "remote") {
    location = 10;
  } else if (job.work_mode === "hybrid") {
    location = 5;
  } else if (job.work_mode === "on-site") {
    location = 0;
  }

  // Bonuses
  const fullTimeBonus = job.job_type === "full-time" ? 10 : 0;
  const remoteBonus = job.work_mode === "remote" ? 5 : 0;

  const total = Math.min(
    100,
    skills + seniority + industry + comp + location + fullTimeBonus + remoteBonus,
  );
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

async function fetchJobs() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/jobs?match_score=is.null&select=id,title,company,platform,job_type,work_mode,salary_min,salary_max&limit=500`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
  );
  return res.json();
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
  console.log(`Scoring ${jobs.length} unscored jobs...`);

  let ok = 0,
    failed = 0;
  for (const job of jobs) {
    const score = scoreJob(job);
    const salary = estimateSalary(job);
    const patch = { match_score: score };
    if (salary) {
      patch.salary_min = salary[0];
      patch.salary_max = salary[1];
    }

    try {
      await updateJob(job.id, patch);
      ok++;
      const salaryStr = salary ? `  $${salary[0] / 1000}k-$${salary[1] / 1000}k` : "";
      console.log(`  [${score}] ${job.title} @ ${job.company}${salaryStr}`);
    } catch (err) {
      console.error(`  FAIL: ${job.title} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${ok} scored, ${failed} failed.`);
}

main().catch(console.error);
