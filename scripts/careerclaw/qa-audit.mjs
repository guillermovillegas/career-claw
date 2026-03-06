#!/usr/bin/env node
/**
 * qa-audit.mjs — Comprehensive QA audit for CareerClaw pipeline.
 * Queries Supabase and reports cover letter quality, job data integrity,
 * application consistency, duplicates, and stale records.
 *
 * Usage:
 *   node scripts/careerclaw/qa-audit.mjs [--fix] [--check-urls] [--verbose] [--limit N]
 *
 * Exit codes:
 *   0 = clean (warnings only)
 *   1 = critical issues found
 */

import { readFileSync } from "fs";
import http from "http";
import https from "https";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  validateCoverLetter,
  validateJob,
  validateApplication,
  checkUrlLiveness,
} from "./lib/validation.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

// ─── Config ──────────────────────────────────────────────────────────────────
const envVars = {};
try {
  for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
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

// ─── Parse args ──────────────────────────────────────────────────────────────
let LIMIT = 500;
let FIX = false;
let CHECK_URLS = false;
let VERBOSE = false;

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--limit") {
    LIMIT = parseInt(process.argv[++i]);
  }
  if (process.argv[i] === "--fix") {
    FIX = true;
  }
  if (process.argv[i] === "--check-urls") {
    CHECK_URLS = true;
  }
  if (process.argv[i] === "--verbose") {
    VERBOSE = true;
  }
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
  return request(SUPABASE_URL + path, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(data),
  });
}

// ─── Report tracking ─────────────────────────────────────────────────────────
/** @type {{ critical: string[], warnings: string[], info: string[], fixed: string[] }} */
const report = {
  critical: [],
  warnings: [],
  info: [],
  fixed: [],
};

function critical(msg) {
  report.critical.push(msg);
}
function warn(msg) {
  report.warnings.push(msg);
}
function info(msg) {
  report.info.push(msg);
}

// ─── Main ────────────────────────────────────────────────────────────────────
console.log("=== CareerClaw QA Audit ===");
console.log(`Limit:      ${LIMIT}`);
console.log(`Fix mode:   ${FIX}`);
console.log(`Check URLs: ${CHECK_URLS}`);
console.log(`Verbose:    ${VERBOSE}`);
console.log("");

// Fetch all data
const [jobs, apps] = await Promise.all([
  sbGet(
    `/rest/v1/jobs?select=id,title,company,url,platform,job_type,work_mode,match_score,deadline,posting_date&order=created_at.desc&limit=${LIMIT}`,
  ),
  sbGet(
    `/rest/v1/applications?select=id,job_id,status,cover_letter,match_score,priority,platform,created_at,notes&order=created_at.desc&limit=${LIMIT}`,
  ),
]);

if (!Array.isArray(jobs) || !Array.isArray(apps)) {
  console.error("ERROR: Failed to fetch data from Supabase");
  console.error("Jobs:", jobs);
  console.error("Apps:", apps);
  process.exit(1);
}

const jobMap = Object.fromEntries(jobs.map((j) => [j.id, j]));
info(`Loaded ${jobs.length} jobs, ${apps.length} applications`);

// ─── 1. Cover Letter Quality ─────────────────────────────────────────────────
console.log("\n--- Cover Letter Quality ---");

let clMissing = 0;
let clTruncated = 0;
let clBanned = 0;
let clBadStructure = 0;
let clGood = 0;

for (const app of apps) {
  if (!app.cover_letter) {
    if (app.status === "applied") {
      critical(
        `App ${app.id.slice(0, 8)}: applied without cover letter (job: ${jobMap[app.job_id]?.title || "unknown"})`,
      );
    }
    clMissing++;
    continue;
  }

  const check = validateCoverLetter(app.cover_letter);
  if (check.valid) {
    clGood++;
  } else {
    const job = jobMap[app.job_id];
    const label = job ? `${job.title} @ ${job.company}` : app.job_id?.slice(0, 8);

    for (const issue of check.issues || [check.reason]) {
      if (issue.includes("too short")) {
        clTruncated++;
        critical(`App ${app.id.slice(0, 8)} (${label}): ${issue}`);
      } else if (issue.includes("banned")) {
        clBanned++;
        warn(`App ${app.id.slice(0, 8)} (${label}): ${issue}`);
      } else if (issue.includes("structure")) {
        clBadStructure++;
        if (VERBOSE) {
          warn(`App ${app.id.slice(0, 8)} (${label}): ${issue}`);
        }
      }
    }
  }
}

console.log(`  Good:         ${clGood}`);
console.log(`  Missing:      ${clMissing}`);
console.log(`  Truncated:    ${clTruncated}`);
console.log(`  Banned words: ${clBanned}`);
console.log(`  Bad structure:${clBadStructure}`);

// ─── 2. Job Data Integrity ───────────────────────────────────────────────────
console.log("\n--- Job Data Integrity ---");

let jobErrors = 0;
let jobWarnings = 0;

for (const job of jobs) {
  const check = validateJob(job);
  if (!check.valid) {
    for (const issue of check.issues) {
      if (issue.includes("missing") || issue.includes("invalid")) {
        jobErrors++;
        critical(`Job ${job.id.slice(0, 8)} (${job.title} @ ${job.company}): ${issue}`);
      } else if (issue.includes("suspect") || issue.includes("deadline")) {
        jobWarnings++;
        warn(`Job ${job.id.slice(0, 8)} (${job.title} @ ${job.company}): ${issue}`);
      }
    }
  }
}

console.log(`  Errors:   ${jobErrors}`);
console.log(`  Warnings: ${jobWarnings}`);

// ─── 3. Application Consistency ──────────────────────────────────────────────
console.log("\n--- Application Consistency ---");

let orphanedApps = 0;
let invalidStatuses = 0;

for (const app of apps) {
  if (app.job_id && !jobMap[app.job_id]) {
    orphanedApps++;
    if (VERBOSE) {
      warn(`App ${app.id.slice(0, 8)}: references missing job ${app.job_id.slice(0, 8)}`);
    }
  }

  const check = validateApplication(app);
  if (!check.valid) {
    for (const issue of check.issues) {
      if (!issue.startsWith("cover letter:")) {
        // cover letters already reported above
        invalidStatuses++;
        if (VERBOSE) {
          warn(`App ${app.id.slice(0, 8)}: ${issue}`);
        }
      }
    }
  }
}

console.log(`  Orphaned (missing job): ${orphanedApps}`);
console.log(`  Invalid status/fields:  ${invalidStatuses}`);

// ─── 4. Duplicate Detection ─────────────────────────────────────────────────
console.log("\n--- Duplicate Detection ---");

// Same company+title
const jobFingerprints = new Map();
let dupJobs = 0;
for (const job of jobs) {
  const key = `${(job.company || "").toLowerCase()}|${(job.title || "").toLowerCase()}`;
  if (jobFingerprints.has(key)) {
    dupJobs++;
    if (VERBOSE) {
      warn(
        `Duplicate job: "${job.title}" @ ${job.company} (${job.id.slice(0, 8)} vs ${jobFingerprints.get(key).slice(0, 8)})`,
      );
    }
  } else {
    jobFingerprints.set(key, job.id);
  }
}

// Same URL
const urlMap = new Map();
let dupUrls = 0;
for (const job of jobs) {
  if (!job.url) {
    continue;
  }
  const normalized = job.url.replace(/\?.*$/, "").replace(/\/$/, "").toLowerCase();
  if (urlMap.has(normalized)) {
    dupUrls++;
    if (VERBOSE) {
      warn(
        `Duplicate URL: ${job.url} (${job.id.slice(0, 8)} vs ${urlMap.get(normalized).slice(0, 8)})`,
      );
    }
  } else {
    urlMap.set(normalized, job.id);
  }
}

console.log(`  Duplicate jobs (company+title): ${dupJobs}`);
console.log(`  Duplicate URLs:                 ${dupUrls}`);

// ─── 5. Stale Applications ──────────────────────────────────────────────────
console.log("\n--- Stale Applications ---");

const STALE_DAYS = 7;
const now = new Date();
let staleCount = 0;

for (const app of apps) {
  if (app.status !== "interested") {
    continue;
  }
  const created = new Date(app.created_at);
  const ageDays = (now - created) / (1000 * 60 * 60 * 24);
  if (ageDays > STALE_DAYS) {
    staleCount++;
    if (VERBOSE) {
      const job = jobMap[app.job_id];
      const label = job ? `${job.title} @ ${job.company}` : app.job_id?.slice(0, 8);
      warn(`Stale: ${label} — interested for ${Math.round(ageDays)} days`);
    }
  }
}

console.log(`  Interested > ${STALE_DAYS} days: ${staleCount}`);

// ─── 6. Score Distribution ───────────────────────────────────────────────────
console.log("\n--- Score Distribution ---");

const scores = apps.map((a) => a.match_score).filter((s) => s != null);
if (scores.length > 0) {
  scores.sort((a, b) => a - b);
  const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  const median = scores[Math.floor(scores.length / 2)];
  const min = scores[0];
  const max = scores[scores.length - 1];
  const below50 = scores.filter((s) => s < 50).length;

  console.log(`  Count:    ${scores.length}`);
  console.log(`  Range:    ${min}-${max}`);
  console.log(`  Average:  ${avg}`);
  console.log(`  Median:   ${median}`);
  console.log(`  Below 50: ${below50}`);

  if (below50 > scores.length * 0.3) {
    warn(
      `${below50}/${scores.length} applications (${Math.round((below50 / scores.length) * 100)}%) have score below 50`,
    );
  }
} else {
  console.log("  No scores found");
}

// ─── 7. URL Liveness (optional) ──────────────────────────────────────────────
if (CHECK_URLS) {
  console.log("\n--- URL Liveness Check ---");
  const urlJobs = jobs.filter((j) => j.url).slice(0, LIMIT);
  let alive = 0;
  let dead = 0;
  let _uncertain = 0;

  for (let i = 0; i < urlJobs.length; i++) {
    const job = urlJobs[i];
    const result = await checkUrlLiveness(job.url);

    if (result.alive) {
      alive++;
      if (result.reason && VERBOSE) {
        info(`  [${i + 1}/${urlJobs.length}] ${job.title} @ ${job.company}: ${result.reason}`);
      }
    } else {
      dead++;
      warn(`Dead URL: ${job.title} @ ${job.company} — ${result.reason} (${job.url})`);

      if (FIX) {
        // Add note about dead URL to any linked applications
        const linkedApps = apps.filter((a) => a.job_id === job.id && a.status === "interested");
        for (const app of linkedApps) {
          const notes =
            (app.notes || "") +
            ` | URL dead (${result.reason}) ${new Date().toISOString().slice(0, 10)}`;
          const res = await sbPatch(`/rest/v1/applications?id=eq.${app.id}`, { notes });
          if (res.status === 204) {
            report.fixed.push(`Noted dead URL on app ${app.id.slice(0, 8)}`);
          }
        }
      }
    }

    // Rate limit URL checks
    if (i < urlJobs.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`  Alive:     ${alive}`);
  console.log(`  Dead:      ${dead}`);
  console.log(`  Checked:   ${urlJobs.length}`);
}

// ─── Auto-fix (safe patches only) ────────────────────────────────────────────
if (FIX) {
  console.log("\n--- Auto-Fix ---");
  let fixCount = 0;

  // Fix: truncated cover letters that are "interested" get notes added
  for (const app of apps) {
    if (app.status !== "interested" || !app.cover_letter) {
      continue;
    }
    const check = validateCoverLetter(app.cover_letter);
    if (check.valid) {
      continue;
    }

    const noteAddition = ` | QA: ${check.reason} (${new Date().toISOString().slice(0, 10)})`;
    if (app.notes && app.notes.includes("QA:")) {
      continue;
    } // already flagged

    const res = await sbPatch(`/rest/v1/applications?id=eq.${app.id}`, {
      notes: (app.notes || "") + noteAddition,
    });
    if (res.status === 204) {
      fixCount++;
      report.fixed.push(`Flagged app ${app.id.slice(0, 8)}: ${check.reason}`);
    }
  }

  console.log(`  Auto-flagged: ${fixCount} application(s)`);
  if (report.fixed.length && VERBOSE) {
    for (const f of report.fixed) {
      console.log(`    ${f}`);
    }
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log("\n=== Audit Summary ===");
console.log(`Critical: ${report.critical.length}`);
console.log(`Warnings: ${report.warnings.length}`);
console.log(`Info:     ${report.info.length}`);
if (FIX) {
  console.log(`Fixed:    ${report.fixed.length}`);
}

if (VERBOSE && report.critical.length > 0) {
  console.log("\nCritical issues:");
  for (const c of report.critical) {
    console.log(`  ! ${c}`);
  }
}
if (VERBOSE && report.warnings.length > 0) {
  console.log("\nWarnings:");
  for (const w of report.warnings.slice(0, 50)) {
    console.log(`  ~ ${w}`);
  }
  if (report.warnings.length > 50) {
    console.log(`  ... and ${report.warnings.length - 50} more`);
  }
}

// Exit non-zero if critical issues found
if (report.critical.length > 0) {
  console.log(`\nExit 1: ${report.critical.length} critical issue(s) found.`);
  process.exit(1);
}

console.log("\nAll clear.");
