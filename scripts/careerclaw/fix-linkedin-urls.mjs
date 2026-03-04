#!/usr/bin/env node
/**
 * fix-linkedin-urls.mjs
 * Find real job posting URLs for jobs that have LinkedIn search result URLs.
 * Uses Gemini search grounding to locate the real posting.
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
    `${SUPABASE_URL}/rest/v1/jobs?url=like.*linkedin.com%2Fjobs%2Fsearch*&select=id,title,company,url`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
  );
  return res.json();
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

async function findJobUrl(title, company) {
  const prompt =
    `Find the current direct job posting URL for:\n` +
    `Title: ${title}\n` +
    `Company: ${company}\n\n` +
    `Search their careers page or job boards (LinkedIn, Greenhouse, Lever, Workday, Ashby, etc.).\n` +
    `Return ONLY the direct URL to this specific job posting.\n` +
    `Do NOT return a search results page or company homepage.\n` +
    `If no active posting found, return: NOT_FOUND`;

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

    // Extract the first plausible job URL (not a search results page)
    const urlMatch = text.match(/https:\/\/[^\s"'<>]+/);
    if (urlMatch) {
      const url = urlMatch[0].replace(/[.,)]+$/, ""); // strip trailing punctuation
      // Reject generic homepages and search pages
      if (
        url.includes("linkedin.com/jobs/search") ||
        url.includes("indeed.com/q-") ||
        /^https:\/\/[a-z]+\.(com|io|ai|co)\/?$/.test(url)
      ) {
        return "NOT_FOUND";
      }
      return url;
    }
    return null;
  } catch {
    return null;
  }
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

const jobs = await fetchBadJobs();
console.log(`\n=== Fix LinkedIn Search URLs ===`);
console.log(`Found ${jobs.length} jobs with LinkedIn search result URLs\n`);

let fixed = 0,
  closed = 0,
  errors = 0;

for (const job of jobs) {
  const n = jobs.indexOf(job) + 1;
  process.stdout.write(`[${n}/${jobs.length}] ${job.company} — ${job.title.slice(0, 50)}... `);

  const result = await findJobUrl(job.title, job.company);

  if (result && result !== "NOT_FOUND") {
    const status = await patchJob(job.id, { url: result });
    if (status === 204) {
      console.log(`✓ → ${result.slice(0, 80)}`);
      fixed++;
    } else {
      console.log(`✗ PATCH failed (HTTP ${status})`);
      errors++;
    }
  } else if (result === "NOT_FOUND") {
    const status = await patchJob(job.id, { deadline: yesterday(), url: null });
    if (status === 204) {
      console.log(`→ Marked closed`);
      closed++;
    } else {
      console.log(`✗ Close failed`);
      errors++;
    }
  } else {
    console.log(`? Gemini error — skipping`);
    errors++;
  }

  await new Promise((r) => setTimeout(r, 1500));
}

console.log(`\n=== Done === fixed:${fixed}  closed:${closed}  errors:${errors}`);
