#!/usr/bin/env node
/**
 * direct-apply.mjs — Generate cover letters via Ollama and save directly to Supabase.
 * Bypasses openclaw agent framework to avoid tool-calling reliability issues.
 *
 * Usage: node direct-apply.mjs [--limit N] [--min-score N] [--dry-run]
 */

import { readFileSync } from "fs";
import http from "http";
import https from "https";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildCoverLetterPrompt } from "../../config/load-profile.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

// ─── Config (loaded from .env) ──────────────────────────────────────────────
const envFile = join(ROOT, ".env");
const envVars = {};
try {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) {
      envVars[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {}

const SUPABASE_URL = envVars.JOBCLAW_SUPABASE_URL || process.env.JOBCLAW_SUPABASE_URL;
const SUPABASE_KEY = envVars.JOBCLAW_SUPABASE_KEY || process.env.JOBCLAW_SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: JOBCLAW_SUPABASE_URL and JOBCLAW_SUPABASE_KEY must be set in .env");
  process.exit(1);
}
const OLLAMA_URL = "http://localhost:11434";
const OLLAMA_MODEL = "llama3.2";

const GEMINI_API_KEY = envVars.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-3-flash-preview";

// ─── Parse args ──────────────────────────────────────────────────────────────
let LIMIT = 30;
let MIN_SCORE = 70;
let DRY_RUN = false;

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--limit") {
    LIMIT = parseInt(process.argv[++i]);
  }
  if (process.argv[i] === "--min-score") {
    MIN_SCORE = parseInt(process.argv[++i]);
  }
  if (process.argv[i] === "--dry-run") {
    DRY_RUN = true;
  }
}

const TODAY = new Date().toISOString().slice(0, 10);

// ─── HTTP helpers ────────────────────────────────────────────────────────────
function request(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: opts.method || "GET",
        headers: opts.headers || {},
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on("error", reject);
    if (opts.body) {
      req.write(opts.body);
    }
    req.end();
  });
}

function sbGet(path) {
  return request(SUPABASE_URL + path, {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
  }).then((r) => JSON.parse(r.body));
}

function sbPost(path, data) {
  const body = JSON.stringify(data);
  return request(SUPABASE_URL + path, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body,
  });
}

// ─── Cover letter generation (loaded from config/profile.json) ──────────────
// buildCoverLetterPrompt is imported from config/load-profile.mjs

async function generateWithOllama(title, company, mode) {
  const prompt = buildCoverLetterPrompt(title, company, mode);
  try {
    const res = await request(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.7, num_predict: 300 },
      }),
    });
    if (res.status !== 200) {
      throw new Error(`Ollama HTTP ${res.status}`);
    }
    const parsed = JSON.parse(res.body);
    return parsed.response?.trim() || null;
  } catch (e) {
    console.error("  Ollama error:", e.message);
    return null;
  }
}

async function generateWithGemini(title, company, mode) {
  const prompt = buildCoverLetterPrompt(title, company, mode);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
      }),
    });
    if (res.status !== 200) {
      const err = JSON.parse(res.body);
      throw new Error(`Gemini HTTP ${res.status}: ${err?.error?.message || "unknown"}`);
    }
    const parsed = JSON.parse(res.body);
    return parsed.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (e) {
    console.error("  Gemini error:", e.message);
    return null;
  }
}

async function generateCoverLetter(title, company, mode) {
  // Try Gemini 3 Flash first (newest, best quality)
  let letter = await generateWithGemini(title, company, mode);
  if (letter && letter.length > 50) {
    return letter;
  }

  // Fallback to Ollama (local, no rate limits)
  console.log("  Falling back to Ollama...");
  letter = await generateWithOllama(title, company, mode);
  if (letter && letter.length > 50) {
    return letter;
  }

  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────
console.log("=== CareerClaw Direct Apply ===");
console.log(`Date:      ${TODAY}`);
console.log(`Min score: ${MIN_SCORE}`);
console.log(`Limit:     ${LIMIT}`);
console.log(`Dry run:   ${DRY_RUN}`);
console.log("");

// Fetch jobs and applications
const [allJobs, allApps] = await Promise.all([
  sbGet(
    "/rest/v1/jobs?select=id,title,company,url,match_score,job_type,work_mode,salary_min,salary_max&order=match_score.desc&limit=300",
  ),
  sbGet("/rest/v1/applications?select=job_id"),
]);

if (!Array.isArray(allJobs)) {
  console.error("Error fetching jobs:", allJobs);
  process.exit(1);
}

const appliedIds = new Set(allApps.map((a) => a.job_id));

// Filter: unapplied, full-time, score >= MIN_SCORE, not past deadline
const candidates = allJobs
  .filter((j) => {
    if (!j.id || appliedIds.has(j.id)) {
      return false;
    }
    if ((j.match_score || 0) < MIN_SCORE) {
      return false;
    }
    if (j.job_type && j.job_type !== "full-time") {
      return false;
    }
    return true;
  })
  .slice(0, LIMIT);

console.log(`Found ${candidates.length} job(s) to apply to.\n`);

if (DRY_RUN) {
  candidates.forEach((j, i) => {
    const sal = j.salary_min
      ? ` $${Math.round(j.salary_min / 1000)}k-$${Math.round((j.salary_max || j.salary_min) / 1000)}k`
      : "";
    console.log(`  ${i + 1}. [${j.match_score}] ${j.title} @ ${j.company}${sal}`);
    console.log(`     ${j.url || "no url"}`);
  });
  process.exit(0);
}

let saved = 0;
let failed = 0;

for (let i = 0; i < candidates.length; i++) {
  const j = candidates[i];
  const num = i + 1;
  const sal = j.salary_min
    ? ` | $${Math.round(j.salary_min / 1000)}k-$${Math.round((j.salary_max || j.salary_min) / 1000)}k`
    : "";

  console.log(
    `─── [${num}/${candidates.length}] ${j.title} @ ${j.company} (score: ${j.match_score}) ───`,
  );
  if (sal) {
    console.log(`    Salary:${sal}  Mode: ${j.work_mode || "remote"}`);
  }
  console.log(`    URL: ${j.url || "none"}`);

  const letter = await generateCoverLetter(j.title, j.company, j.work_mode || "remote");

  if (!letter) {
    console.log("  ✗ Failed to generate cover letter");
    failed++;
    console.log("");
    continue;
  }

  // Determine platform from URL
  let platform = "direct";
  if (j.url) {
    if (/linkedin\.com/i.test(j.url)) {
      platform = "linkedin";
    } else if (/indeed\.com/i.test(j.url)) {
      platform = "indeed";
    } else if (/upwork\.com/i.test(j.url)) {
      platform = "upwork";
    }
  }

  // Priority: 1=high (85+), 2=medium (70-84), 3=normal
  const priority = j.match_score >= 85 ? 1 : j.match_score >= 70 ? 2 : 3;

  const appData = {
    job_id: j.id,
    status: "interested",
    platform,
    cover_letter: letter,
    match_score: j.match_score,
    priority,
    notes: `Auto-applied ${TODAY}`,
  };

  console.log("  Cover letter preview:", letter.substring(0, 80).replace(/\n/g, " ") + "...");

  const res = await sbPost("/rest/v1/applications", appData);

  if (res.status === 201) {
    console.log("  ✓ Saved to DB");
    saved++;
  } else {
    console.log(`  ✗ DB error (HTTP ${res.status}):`, res.body.substring(0, 200));
    failed++;
  }

  console.log("");

  // Small pause between jobs
  if (i < candidates.length - 1) {
    await new Promise((r) => setTimeout(r, 2000));
  }
}

console.log(`=== Done: ${saved} saved, ${failed} failed ===`);
console.log(`Applications: ${allApps.length} → ${allApps.length + saved} (+${saved})`);
