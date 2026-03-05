#!/usr/bin/env node
/**
 * fix-cover-letters.mjs — Re-generate truncated/bad cover letters in the database.
 * Finds applications with cover letters < 200 chars or containing banned words,
 * generates new ones, and updates the DB.
 *
 * Usage: node scripts/careerclaw/fix-cover-letters.mjs [--dry-run] [--status interested] [--limit N]
 */

import { readFileSync } from "fs";
import http from "http";
import https from "https";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildCoverLetterPrompt } from "../../config/load-profile.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

// ─── Config ──────────────────────────────────────────────────────────────────
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
let LIMIT = 200;
let DRY_RUN = false;
let TARGET_STATUS = ""; // empty = all statuses

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--limit") {
    LIMIT = parseInt(process.argv[++i]);
  }
  if (process.argv[i] === "--dry-run") {
    DRY_RUN = true;
  }
  if (process.argv[i] === "--status") {
    TARGET_STATUS = process.argv[++i];
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────
const MIN_CL_LENGTH = 200;
const MAX_CL_LENGTH = 900;

const BANNED_PATTERNS = [
  /\bdear\b/i,
  /\bto whom it may concern\b/i,
  /\bI am writing to\b/i,
  /\bI am applying\b/i,
  /\bI am confident\b/i,
  /\bexcited to\b/i,
  /\bpassionate\b/i,
  /\bthrilled\b/i,
  /\bleverage\b/i,
  /\bsynergy\b/i,
  /\bcutting-edge\b/i,
  /\binnovative leader\b/i,
  /\bI'm proud\b/i,
  /\bproud to bring\b/i,
  /\baligns perfectly\b/i,
  /\bperfect fit\b/i,
  /\bgreat fit\b/i,
  /\bworld-class\b/i,
  /\bdynamic\b/i,
  /\bdelighted\b/i,
];

function validateCoverLetter(letter) {
  if (letter.length < MIN_CL_LENGTH) {
    return { valid: false, reason: `too short (${letter.length} chars)` };
  }
  if (letter.length > MAX_CL_LENGTH) {
    return { valid: false, reason: `too long (${letter.length} chars)` };
  }
  for (const pattern of BANNED_PATTERNS) {
    const match = letter.match(pattern);
    if (match) {
      return { valid: false, reason: `banned: "${match[0]}"` };
    }
  }
  return { valid: true };
}

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

function sbPatch(path, data) {
  const body = JSON.stringify(data);
  return request(SUPABASE_URL + path, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body,
  });
}

// ─── LLM generation ──────────────────────────────────────────────────────────
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

async function generateValidCoverLetter(title, company, mode) {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let letter = await generateWithGemini(title, company, mode);
    if (!letter || letter.length < MIN_CL_LENGTH) {
      letter = await generateWithOllama(title, company, mode);
    }
    if (!letter) {
      console.log(`  Attempt ${attempt}/${MAX_ATTEMPTS}: no output`);
      continue;
    }
    const check = validateCoverLetter(letter);
    if (check.valid) {
      return letter;
    }
    console.log(`  Attempt ${attempt}/${MAX_ATTEMPTS}: rejected — ${check.reason}`);
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────
console.log("=== Fix Cover Letters ===");
console.log(`Target status: ${TARGET_STATUS || "all"}`);
console.log(`Limit: ${LIMIT}`);
console.log(`Dry run: ${DRY_RUN}`);
console.log("");

// Fetch applications that need fixing
let query =
  "/rest/v1/applications?select=id,job_id,status,cover_letter&order=created_at.desc&limit=" + LIMIT;
if (TARGET_STATUS) {
  query += "&status=eq." + TARGET_STATUS;
}

const apps = await sbGet(query);
if (!Array.isArray(apps)) {
  console.error("Error fetching applications:", apps);
  process.exit(1);
}

// Find bad cover letters
const needsFix = apps.filter((a) => {
  if (!a.cover_letter) {
    return true;
  }
  const check = validateCoverLetter(a.cover_letter);
  return !check.valid;
});

console.log(
  `Found ${needsFix.length} applications with bad cover letters (out of ${apps.length} checked)\n`,
);

if (needsFix.length === 0) {
  console.log("Nothing to fix.");
  process.exit(0);
}

// Fetch job details for all apps that need fixing
const jobIds = [...new Set(needsFix.map((a) => a.job_id))];
const jobs = await sbGet(
  "/rest/v1/jobs?select=id,title,company,work_mode&id=in.(" + jobIds.join(",") + ")&limit=500",
);
const jobMap = {};
jobs.forEach((j) => (jobMap[j.id] = j));

let fixed = 0;
let failed = 0;
let skipped = 0;

for (let i = 0; i < needsFix.length; i++) {
  const a = needsFix[i];
  const j = jobMap[a.job_id];
  if (!j) {
    console.log(`[${i + 1}/${needsFix.length}] SKIP — no job found for ${a.job_id}`);
    skipped++;
    continue;
  }

  const oldLen = a.cover_letter ? a.cover_letter.length : 0;
  const oldCheck = a.cover_letter ? validateCoverLetter(a.cover_letter) : { reason: "missing" };
  console.log(
    `[${i + 1}/${needsFix.length}] ${j.title} @ ${j.company} (${a.status}) — ${oldCheck.reason}`,
  );

  if (DRY_RUN) {
    if (a.cover_letter) {
      console.log(`  Old: "${a.cover_letter.substring(0, 80)}..."`);
    }
    console.log("");
    continue;
  }

  const letter = await generateValidCoverLetter(j.title, j.company, j.work_mode || "remote");
  if (!letter) {
    console.log("  FAILED — could not generate valid cover letter");
    failed++;
    console.log("");
    continue;
  }

  // Update in database
  const res = await sbPatch(`/rest/v1/applications?id=eq.${a.id}`, {
    cover_letter: letter,
    notes:
      (a.status === "applied" ? a.notes || "" : "") +
      (a.notes && a.status === "applied" ? " | " : "") +
      `Cover letter regenerated ${new Date().toISOString().slice(0, 10)}`,
  });

  if (res.status === 204) {
    console.log(`  FIXED (${oldLen} → ${letter.length} chars)`);
    console.log(`  Preview: ${letter.substring(0, 100).replace(/\n/g, " ")}...`);
    fixed++;
  } else {
    console.log(`  DB ERROR (HTTP ${res.status}): ${res.body.substring(0, 200)}`);
    failed++;
  }

  console.log("");

  // Rate limit
  if (i < needsFix.length - 1) {
    await new Promise((r) => setTimeout(r, 2000));
  }
}

console.log(`=== Done: ${fixed} fixed, ${failed} failed, ${skipped} skipped ===`);
