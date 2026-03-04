#!/usr/bin/env node
/**
 * fix-indeed-urls.mjs
 *
 * For every job with a bad Indeed search-result URL (q-*.html pattern),
 * uses Gemini with Google Search grounding to find the real viewjob URL.
 * PATCHes the real URL if found; marks the job as closed if not found.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

// Load .env
const envPath = join(ROOT, ".env");
const env = {};
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const SUPABASE_URL = env.JOBCLAW_SUPABASE_URL;
const SUPABASE_KEY = env.JOBCLAW_SUPABASE_KEY;
const GEMINI_KEY = env.GEMINI_API_KEY;

// ── Supabase helpers ─────────────────────────────────────────────────

async function fetchBadJobs() {
  const url =
    `${SUPABASE_URL}/rest/v1/jobs?url=like.*indeed.com%2Fq-*` +
    `&select=id,title,company,url&order=company.asc,title.asc`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  return res.json();
}

async function patchJob(id, fields) {
  const url = `${SUPABASE_URL}/rest/v1/jobs?id=eq.${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(fields),
  });
  return res.status;
}

// ── Gemini search grounding ──────────────────────────────────────────

async function findIndeedUrl(title, company) {
  const prompt =
    `Find the current Indeed.com job posting for this job:\n` +
    `Title: ${title}\n` +
    `Company: ${company}\n\n` +
    `Search Indeed.com and return ONLY the URL. ` +
    `The URL must be in the exact format: https://www.indeed.com/viewjob?jk=XXXXXXXXXX\n` +
    `If you cannot find an active listing that matches, return exactly: NOT_FOUND`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0, maxOutputTokens: 200 },
  };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      console.error(`  Gemini HTTP ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    // Extract indeed.com/viewjob URL
    const match = text.match(/https:\/\/www\.indeed\.com\/viewjob\?jk=[a-zA-Z0-9]+/);
    if (match) {
      return match[0];
    }
    if (text.includes("NOT_FOUND")) {
      return "NOT_FOUND";
    }

    // Also try indeedapply or /rc/clk formats as fallback
    const match2 = text.match(/https:\/\/[a-z.]*indeed\.com\/[^\s"'<>]+jk=[a-zA-Z0-9]+/);
    if (match2) {
      // Normalize to viewjob format
      const jkMatch = match2[0].match(/jk=([a-zA-Z0-9]+)/);
      if (jkMatch) {
        return `https://www.indeed.com/viewjob?jk=${jkMatch[1]}`;
      }
    }

    console.error(`  Gemini returned unexpected: ${text.slice(0, 100)}`);
    return null;
  } catch (err) {
    console.error(`  Gemini error: ${err.message}`);
    return null;
  }
}

// ── Yesterday helper ────────────────────────────────────────────────

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

// ── Main ─────────────────────────────────────────────────────────────

const jobs = await fetchBadJobs();
console.log(`\n=== Fix Indeed URLs ===`);
console.log(`Found ${jobs.length} jobs with bad Indeed URLs\n`);

let fixed = 0;
let closed = 0;
let errors = 0;

for (const job of jobs) {
  process.stdout.write(
    `[${jobs.indexOf(job) + 1}/${jobs.length}] ${job.company} — ${job.title.slice(0, 50)}... `,
  );

  const result = await findIndeedUrl(job.title, job.company);

  if (result && result !== "NOT_FOUND") {
    const status = await patchJob(job.id, { url: result });
    if (status === 204) {
      console.log(`✓ Updated → ${result}`);
      fixed++;
    } else {
      console.log(`✗ PATCH failed (HTTP ${status})`);
      errors++;
    }
  } else if (result === "NOT_FOUND") {
    const status = await patchJob(job.id, { deadline: yesterday() });
    if (status === 204) {
      console.log(`→ Marked closed (not found)`);
      closed++;
    } else {
      console.log(`✗ Close PATCH failed (HTTP ${status})`);
      errors++;
    }
  } else {
    console.log(`? Gemini error — skipping`);
    errors++;
  }

  // Rate limit: 1 request per 1.5s to stay within Gemini free tier limits
  await new Promise((r) => setTimeout(r, 1500));
}

console.log(`\n=== Done ===`);
console.log(`  Fixed:  ${fixed}`);
console.log(`  Closed: ${closed}`);
console.log(`  Errors: ${errors}`);
