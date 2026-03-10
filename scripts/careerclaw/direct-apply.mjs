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
import { buildCoverLetterPrompt, getCoverLetterConfig } from "../../config/load-profile.mjs";
import { validateCoverLetterForJob, MIN_CL_LENGTH } from "./lib/validation.mjs";

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
const OLLAMA_MODEL = "qwen3:8b";

const GEMINI_API_KEY = envVars.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";

// Build name-stripping regex from profile (e.g. "Jane Doe" → /\n\s*Jane\s*(Doe)?\s*$/i)
const _clCfg = getCoverLetterConfig();
const _nameParts = _clCfg.fullName.split(/\s+/);
const _nameRegex = new RegExp(
  `\\n\\s*${_nameParts[0]}\\s*(${_nameParts.slice(1).join("\\s+")})?\\s*$`,
  "i",
);

// ─── Parse args ──────────────────────────────────────────────────────────────
let LIMIT = 300;
let MIN_SCORE = 50;
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

async function generateWithOllama(title, company, mode, feedback = "") {
  let prompt = buildCoverLetterPrompt(title, company, mode) + feedback;
  // qwen3 defaults to thinking mode — disable it to maximize output tokens
  if (OLLAMA_MODEL.startsWith("qwen3")) {
    prompt = "/nothink\n" + prompt;
  }
  try {
    const res = await request(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.7, num_predict: 600 },
      }),
    });
    if (res.status !== 200) {
      throw new Error(`Ollama HTTP ${res.status}`);
    }
    const parsed = JSON.parse(res.body);
    let text = parsed.response?.trim() || null;
    // Strip thinking tags if model emitted them despite /nothink
    if (text) {
      text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    }
    return text;
  } catch (e) {
    console.error("  Ollama error:", e.message);
    return null;
  }
}

async function generateWithGemini(title, company, mode, feedback = "") {
  const prompt = buildCoverLetterPrompt(title, company, mode) + feedback;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 600, temperature: 0.75 },
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

// ─── Rejection-aware quality loop ────────────────────────────────────────────

// Load past rejection data to learn what NOT to do
let rejectionLessons = "";
async function loadRejectionLessons() {
  if (rejectionLessons) {
    return rejectionLessons;
  }
  try {
    // Fetch rejected applications with their cover letters
    const rejected = await sbGet(
      "/rest/v1/applications?status=eq.rejected&select=cover_letter,job_id&limit=20",
    );
    if (!rejected?.length) {
      return "";
    }

    // Analyze common patterns in rejected letters
    const patterns = {};
    const openers = [];
    for (const r of rejected) {
      if (!r.cover_letter) {
        continue;
      }
      const cl = r.cover_letter;
      // Track opening words
      const firstWords = cl.split(/\s+/).slice(0, 5).join(" ");
      openers.push(firstWords);
      // Track overused phrases
      const phrases = cl.match(/\b[A-Z][a-z]+ [a-z]+ [a-z]+ [a-z]+\b/g) || [];
      for (const p of phrases) {
        const key = p.toLowerCase();
        patterns[key] = (patterns[key] || 0) + 1;
      }
    }
    // Find phrases that appeared in 3+ rejected letters (overused = AI-sounding)
    const overused = Object.entries(patterns)
      .filter(([, count]) => count >= 3)
      .map(([phrase]) => phrase);
    // Find duplicate openers
    const openerCounts = {};
    for (const o of openers) {
      openerCounts[o] = (openerCounts[o] || 0) + 1;
    }
    const repeatedOpeners = Object.entries(openerCounts)
      .filter(([, c]) => c >= 2)
      .map(([opener]) => opener);

    const lessons = [];
    if (overused.length > 0) {
      lessons.push(
        `OVERUSED PHRASES IN REJECTED LETTERS (avoid): ${overused.slice(0, 8).join(", ")}`,
      );
    }
    if (repeatedOpeners.length > 0) {
      lessons.push(
        `REPEATED OPENERS IN REJECTED LETTERS (use different opening): ${repeatedOpeners.slice(0, 3).join(" | ")}`,
      );
    }
    lessons.push(
      "REJECTED LETTERS WERE: too generic, too AI-sounding, lacked specific connection to the company, used cookie-cutter structure. Be DIFFERENT.",
    );
    rejectionLessons = lessons.join("\n");
    console.log(`Loaded rejection lessons from ${rejected.length} rejected applications\n`);
    return rejectionLessons;
  } catch {
    return "";
  }
}

// Anti-AI-copy: detect and score how "AI-generated" a letter sounds
function aiCopyScore(letter) {
  let score = 0;
  const checks = [
    [/^(Throughout|Over the course of|In my|With over|Having spent|As a)/i, 2, "generic AI opener"],
    [/\btrack record\b/i, 1, "cliche: track record"],
    [/\bwell-positioned\b/i, 1, "cliche: well-positioned"],
    [/\bunique combination\b/i, 2, "cliche: unique combination"],
    [/\bI am confident\b/i, 2, "AI: I am confident"],
    [/\bI would welcome\b/i, 1, "AI: I would welcome"],
    [/\bI look forward to\b/i, 1, "AI: I look forward to"],
    [/\bdeeply\b/i, 1, "AI filler: deeply"],
    [/\bseamlessly\b/i, 1, "AI filler: seamlessly"],
    [/\brobust\b/i, 1, "AI filler: robust"],
    [/\bholistic\b/i, 1, "AI filler: holistic"],
    [/\bpivotal\b/i, 1, "AI filler: pivotal"],
    [/\bfoster\b/i, 1, "AI filler: foster"],
    [/\bspearhead/i, 1, "AI filler: spearhead"],
    [/\bensuring\b/i, 1, "AI filler: ensuring"],
    [/\bstakeholder\b/i, 1, "AI filler: stakeholder"],
    [/\bcross-functional\b/i, 1, "AI cliche: cross-functional"],
  ];
  const issues = [];
  for (const [pattern, weight, label] of checks) {
    if (pattern.test(letter)) {
      score += weight;
      issues.push(label);
    }
  }
  // Sentence uniformity check: if most sentences are similar length, it's AI
  const sentences = letter.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  if (sentences.length >= 4) {
    const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + (b - avg) ** 2, 0) / lengths.length;
    if (variance < 4) {
      score += 2;
      issues.push("uniform sentence length (robotic)");
    }
  }
  return { score, issues };
}

// Auto-repair: fix common LLM failures
function repairLetter(letter) {
  let fixed = letter
    .replace(
      /\n\s*(Sincerely|Best regards?|Regards|Warm regards|Warmly|Cheers|Thank you|Thanks|Respectfully),?\s*\n.*$/is,
      "",
    )
    .replace(_nameRegex, "")
    .replace(/\baligns with\b/gi, "maps to")
    .replace(/\binnovative\b/gi, "effective")
    .replace(/\bexcited\b/gi, "prepared")
    .replace(/\blove\b/gi, "value")
    .replace(/\bI believe\b/gi, "My track record shows")
    .replace(/\bI think\b/gi, "My experience suggests")
    .replace(/\bI feel\b/gi, "My background demonstrates")
    .replace(/\bseamlessly\b/gi, "effectively")
    .replace(/\brobust\b/gi, "strong")
    .replace(/\bholistic\b/gi, "full")
    .replace(/\bpivotal\b/gi, "key")
    .replace(/\bfoster\b/gi, "build")
    .replace(/\bspearheaded?\b/gi, "led")
    .replace(/\bensuring\b/gi, "so that")
    .replace(/\bstakeholders?\b/gi, "teams")
    .replace(/\bdeeply\b/gi, "")
    .replace(/!/g, ".")
    .replace(/\.\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Auto-paragraph: if letter is a single block, split at sentence boundaries
  const paragraphs = fixed.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length < 2 && fixed.length > 400) {
    const sentences = fixed.split(/(?<=\.)\s+/);
    if (sentences.length >= 6) {
      // Split into 3 paragraphs at roughly 1/3 and 2/3 points
      const third = Math.floor(sentences.length / 3);
      const twoThird = Math.floor((sentences.length * 2) / 3);
      const p1 = sentences.slice(0, third).join(" ");
      const p2 = sentences.slice(third, twoThird).join(" ");
      const p3 = sentences.slice(twoThird).join(" ");
      fixed = [p1, p2, p3].filter((p) => p.trim()).join("\n\n");
    }
  }

  return fixed;
}

async function generateCoverLetter(title, company, mode) {
  const MAX_ATTEMPTS = 5;
  const lessons = await loadRejectionLessons();
  let lastIssues = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Build feedback from previous attempts for the retry prompt
    let feedbackSuffix = "";
    if (lastIssues.length > 0) {
      feedbackSuffix = `\n\nPREVIOUS ATTEMPT FAILED BECAUSE: ${lastIssues.join("; ")}. Fix these specific problems.`;
    }
    if (lessons) {
      feedbackSuffix += `\n\n${lessons}`;
    }

    // Try Gemini first, then Ollama
    let letter = await generateWithGemini(title, company, mode, feedbackSuffix);
    if (!letter || letter.length < MIN_CL_LENGTH) {
      console.log("  Falling back to Ollama...");
      letter = await generateWithOllama(title, company, mode, feedbackSuffix);
    }

    if (!letter) {
      console.log(`  Attempt ${attempt}/${MAX_ATTEMPTS}: no output`);
      continue;
    }

    // Auto-repair common LLM failures before validation
    letter = repairLetter(letter);
    // Context-aware check: company + role mention required
    const check = validateCoverLetterForJob(letter, company, title);
    const aiCheck = aiCopyScore(letter);

    if (check.valid && aiCheck.score <= 3) {
      if (aiCheck.score > 0) {
        console.log(`  AI-copy score: ${aiCheck.score}/3 (acceptable)`);
      }
      return letter;
    }

    // Collect all issues for feedback to next attempt
    lastIssues = [];
    if (!check.valid) {
      lastIssues.push(...(check.issues || [check.reason]));
    }
    if (aiCheck.score > 3) {
      lastIssues.push(`AI-copy score ${aiCheck.score} (${aiCheck.issues.join(", ")})`);
    }

    console.log(`  Attempt ${attempt}/${MAX_ATTEMPTS}: rejected — ${lastIssues[0]}`);
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 1500)); // rate limit buffer
    }
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
    "/rest/v1/jobs?select=id,title,company,url,match_score,job_type,work_mode,salary_min,salary_max&order=match_score.desc&limit=1000",
  ),
  sbGet("/rest/v1/applications?select=job_id"),
]);

if (!Array.isArray(allJobs)) {
  console.error("Error fetching jobs:", allJobs);
  process.exit(1);
}

const appliedIds = new Set(allApps.map((a) => a.job_id));

// ─── 30-day dedup: prevent re-applying to same company+role within 30 days ──
const DEDUP_DAYS = 30;
const dedupSince = new Date(Date.now() - DEDUP_DAYS * 86400000).toISOString().slice(0, 10);
const recentlyApplied = await sbGet(
  `/rest/v1/applications?status=in.(applied,interview,phone_screen,final,hired)&application_date=gte.${dedupSince}&select=id,job_id`,
);
const recentAppliedJobIds = new Set(
  Array.isArray(recentlyApplied) ? recentlyApplied.map((a) => a.job_id) : [],
);

// Build company+title set for cross-application dedup
const recentJobIds = [
  ...new Set(
    (Array.isArray(recentlyApplied) ? recentlyApplied : []).map((a) => a.job_id).filter(Boolean),
  ),
];
let recentAppliedRoles = new Set();
if (recentJobIds.length) {
  const recentJobs = await sbGet(
    `/rest/v1/jobs?id=in.(${recentJobIds.join(",")})&select=id,title,company`,
  );
  if (Array.isArray(recentJobs)) {
    recentAppliedRoles = new Set(
      recentJobs.map(
        (j) =>
          `${(j.company || "").toLowerCase().trim()}|||${(j.title || "").toLowerCase().trim()}`,
      ),
    );
  }
}
console.log(
  `Dedup: ${recentAppliedJobIds.size} applied in last ${DEDUP_DAYS} days (${recentAppliedRoles.size} unique company+role combos)`,
);

function isDuplicate(job) {
  if (!job) {
    return false;
  }
  if (recentAppliedJobIds.has(job.id)) {
    return true;
  }
  const key = `${(job.company || "").toLowerCase().trim()}|||${(job.title || "").toLowerCase().trim()}`;
  return recentAppliedRoles.has(key);
}

// Filter: unapplied, full-time, score >= MIN_SCORE, no 30-day duplicate
let dedupSkipped = 0;
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
    if (isDuplicate(j)) {
      dedupSkipped++;
      return false;
    }
    return true;
  })
  .slice(0, LIMIT);
if (dedupSkipped) {
  console.log(
    `Skipped ${dedupSkipped} duplicate(s) (same company+role applied within ${DEDUP_DAYS} days)`,
  );
}

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
const perJobResults = [];
const startTime = Date.now();

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
    perJobResults.push({
      title: j.title,
      company: j.company,
      score: j.match_score,
      platform,
      cl_length: letter.length,
      status: "saved",
    });
  } else {
    console.log(`  ✗ DB error (HTTP ${res.status}):`, res.body.substring(0, 200));
    failed++;
    perJobResults.push({
      title: j.title,
      company: j.company,
      score: j.match_score,
      platform,
      status: "db_error",
      error: res.body.substring(0, 100),
    });
  }

  console.log("");

  // Small pause between jobs (keep under API rate limits)
  if (i < candidates.length - 1) {
    await new Promise((r) => setTimeout(r, 800));
  }
}

console.log(`=== Done: ${saved} saved, ${failed} failed ===`);
console.log(`Applications: ${allApps.length} → ${allApps.length + saved} (+${saved})`);

// Log automation run with per-job details
if (!DRY_RUN && (saved > 0 || failed > 0)) {
  const elapsedMs = Date.now() - startTime;
  const logPayload = {
    action_type: "application_submit",
    platform: "direct-apply",
    success: failed === 0,
    details: {
      date: TODAY,
      source: "direct-apply.mjs",
      ai_model: GEMINI_API_KEY ? GEMINI_MODEL : OLLAMA_MODEL,
      min_score: MIN_SCORE,
      limit: LIMIT,
      candidates_found: candidates.length,
      new_applications: saved,
      failed,
      applications_before: allApps.length,
      applications_after: allApps.length + saved,
      per_job: perJobResults,
    },
    execution_time_ms: elapsedMs,
  };
  if (failed > 0) {
    logPayload.error_message = `${failed} application(s) failed to save`;
  }
  const logRes = await sbPost("/rest/v1/automation_logs", logPayload);
  if (logRes.status === 201) {
    console.log(`Logged automation run (${elapsedMs}ms)`);
  } else {
    console.log(`Warning: automation log failed (HTTP ${logRes.status})`);
  }
}
