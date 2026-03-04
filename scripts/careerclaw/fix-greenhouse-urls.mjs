#!/usr/bin/env node
/**
 * fix-greenhouse-urls.mjs
 * Find real job IDs for Greenhouse URLs that are missing numeric job IDs.
 * Uses the Greenhouse Boards API to list jobs and match by title.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

const env = {};
for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const SUPABASE_URL = env.JOBCLAW_SUPABASE_URL;
const SUPABASE_KEY = env.JOBCLAW_SUPABASE_KEY;
const GEMINI_KEY = env.GEMINI_API_KEY;

async function fetchBadJobs() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/jobs?url=like.*greenhouse.io*&select=id,title,company,url,match_score`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
  );
  const all = await res.json();
  // Return only those missing a numeric job ID
  return all.filter((j) => !/greenhouse\.io\/[^/?#]+\/jobs\/\d+/.test(j.url || ""));
}

async function patchJob(id, fields) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${id}`, {
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

// Extract board token from URL: greenhouse.io/TOKEN or greenhouse.io/TOKEN/jobs/SLUG
function extractBoardToken(url) {
  const m = url.match(/greenhouse\.io\/([^/?#]+)/);
  return m ? m[1] : null;
}

// Try to find the job on the Greenhouse board by title match
async function findJobOnBoard(boardToken, title) {
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=false`,
    );
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    const jobs = data.jobs || [];
    if (!jobs.length) {
      return null;
    }

    // Normalize title for comparison
    const normalize = (s) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const target = normalize(title);

    // Exact match first
    let match = jobs.find((j) => normalize(j.title) === target);
    // Partial match: target words appear in job title
    if (!match) {
      const words = target.split(" ").filter((w) => w.length > 3);
      match = jobs.find((j) => {
        const jt = normalize(j.title);
        return words.filter((w) => jt.includes(w)).length >= Math.ceil(words.length * 0.6);
      });
    }

    return match ? match : null;
  } catch {
    return null;
  }
}

// Use Gemini as fallback to find the direct job URL
async function findJobUrlViaGemini(title, company) {
  const prompt =
    `Find the current direct Greenhouse job posting URL for:\n` +
    `Title: ${title}\nCompany: ${company}\n\n` +
    `The URL must match: https://job-boards.greenhouse.io/COMPANY/jobs/NUMERIC_ID\n` +
    `or https://boards.greenhouse.io/COMPANY/jobs/NUMERIC_ID\n` +
    `Return ONLY the URL. If not found, return: NOT_FOUND`;

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
      return null;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    if (text.includes("NOT_FOUND")) {
      return "NOT_FOUND";
    }

    const urlMatch = text.match(/https:\/\/[^\s"'<>]+greenhouse\.io[^\s"'<>]+\/\d+/);
    if (urlMatch) {
      return urlMatch[0].replace(/[.,)]+$/, "");
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const jobs = await fetchBadJobs();
console.log(`\n=== Fix Greenhouse URLs ===`);
console.log(`Found ${jobs.length} Greenhouse jobs without numeric job IDs\n`);

let fixed = 0,
  closed = 0,
  errors = 0;

for (const job of jobs) {
  const n = jobs.indexOf(job) + 1;
  process.stdout.write(`[${n}/${jobs.length}] ${job.company} — ${job.title.slice(0, 50)}... `);

  const boardToken = extractBoardToken(job.url);
  if (!boardToken) {
    console.log(`✗ Can't parse board token`);
    errors++;
    continue;
  }

  // Try Greenhouse Boards API first
  let result = null;
  const boardJob = await findJobOnBoard(boardToken, job.title);
  if (boardJob) {
    result = `https://job-boards.greenhouse.io/${boardToken}/jobs/${boardJob.id}`;
  }

  // Fallback to Gemini
  if (!result) {
    result = await findJobUrlViaGemini(job.title, job.company);
  }

  if (result && result !== "NOT_FOUND") {
    const status = await patchJob(job.id, { url: result });
    if (status === 204) {
      console.log(`✓ → ${result.slice(0, 80)}`);
      fixed++;
    } else {
      console.log(`✗ PATCH failed (HTTP ${status})`);
      errors++;
    }
  } else {
    // Mark as closed
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const y = yesterday.toISOString().split("T")[0];
    const status = await patchJob(job.id, { deadline: y, url: null });
    if (status === 204) {
      console.log(`→ Marked closed (not found)`);
      closed++;
    } else {
      console.log(`✗ Close failed`);
      errors++;
    }
  }

  await new Promise((r) => setTimeout(r, 800));
}

console.log(`\n=== Done === fixed:${fixed}  closed:${closed}  errors:${errors}`);
