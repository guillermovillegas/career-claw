#!/usr/bin/env node
/**
 * submit-applications.mjs
 * Submits "interested" applications to job sites via official ATS APIs.
 *
 * Supported platforms:
 *   - Greenhouse (job-boards.greenhouse.io / boards.greenhouse.io)
 *   - Lever      (jobs.lever.co)
 *   - Ashby      (jobs.ashbyhq.com)
 *
 * For each application with status=interested + a cover_letter,
 * this script attempts to submit via the platform API and updates
 * the application status to "applied".
 *
 * Usage:
 *   node submit-applications.mjs [--dry-run] [--limit N] [--min-score N]
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

// ─── Load env ────────────────────────────────────────────────────────────────
const env = {};
for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const SUPABASE_URL = env.JOBCLAW_SUPABASE_URL;
const SUPABASE_KEY = env.JOBCLAW_SUPABASE_KEY;
const RESUME_PATH = join(ROOT, "gv_resume.1pdf");

// ─── Parse flags ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const scoreIdx = args.indexOf("--min-score");
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;
const MIN_SCORE = scoreIdx !== -1 ? parseInt(args[scoreIdx + 1], 10) : 50;

// ─── Profile ─────────────────────────────────────────────────────────────────
const PROFILE = {
  first_name: "Guillermo",
  last_name: "Villegas",
  email: "guillermo.villegas.applies@gmail.com",
  phone: "7735511393",
  location: "Chicago, IL",
  linkedin: "https://www.linkedin.com/in/guillermo-villegas-3080a011b",
  github: "https://github.com/guillermovillegas",
  website: "https://GuillermoTheEngineer.vercel.app",
  current_company: "Levee",
};

// ─── Supabase helpers ─────────────────────────────────────────────────────────
async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase GET ${path}: ${res.status}`);
  }
  return res.json();
}

async function supabasePatch(table, id, fields) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
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

// ─── Platform detection ───────────────────────────────────────────────────────
function detectPlatform(url) {
  if (!url) {
    return null;
  }
  if (/greenhouse\.io/i.test(url)) {
    return "greenhouse";
  }
  if (/jobs\.lever\.co/i.test(url)) {
    return "lever";
  }
  if (/jobs\.ashbyhq\.com/i.test(url)) {
    return "ashby";
  }
  return null;
}

// ─── Greenhouse submitter ─────────────────────────────────────────────────────
async function submitGreenhouse(job, application) {
  const url = job.url;

  // Parse board token + numeric job ID
  const m = url.match(/greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/);
  if (!m) {
    return {
      success: false,
      reason: `URL missing numeric job ID: ${url}`,
      platform: "greenhouse",
    };
  }
  const [, boardToken, jobId] = m;

  // Fetch job questions
  let jobData = {};
  try {
    const jobRes = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}?content=true`,
    );
    if (jobRes.ok) {
      jobData = await jobRes.json();
    }
  } catch {
    // Non-fatal — proceed without questions
  }

  // Build multipart form
  const form = new FormData();
  form.append("first_name", PROFILE.first_name);
  form.append("last_name", PROFILE.last_name);
  form.append("email", PROFILE.email);
  form.append("phone", PROFILE.phone);

  // Resume as base64 content (avoids Blob streaming issues)
  const resumeB64 = readFileSync(RESUME_PATH).toString("base64");
  form.append("resume_content", resumeB64);
  form.append("resume_content_filename", "Guillermo_Villegas_Resume.pdf");

  // Cover letter as base64 content
  if (application.cover_letter) {
    const clB64 = Buffer.from(application.cover_letter, "utf8").toString("base64");
    form.append("cover_letter_content", clB64);
    form.append("cover_letter_content_filename", "Cover_Letter.txt");
  }

  // Auto-answer required questions
  const questions = jobData.questions || [];
  for (const q of questions) {
    if (!q.required) {
      continue;
    }

    // Skip demographic fields (optional in practice)
    if (/gender|disability|veteran/i.test(q.name || q.label || "")) {
      continue;
    }

    const answer = autoAnswer(q);
    if (answer === null) {
      return {
        success: false,
        reason: `Required question needs manual answer: "${q.label}"`,
        platform: "greenhouse",
      };
    }

    const fieldName = `answers[${q.id}]`;
    if (Array.isArray(answer)) {
      for (const v of answer) {
        form.append(`${fieldName}[]`, String(v));
      }
    } else {
      form.append(fieldName, String(answer));
    }
  }

  if (DRY_RUN) {
    return {
      success: true,
      reason: "dry-run",
      platform: "greenhouse",
      board: boardToken,
      jobId,
    };
  }

  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}/applications`,
    { method: "POST", body: form },
  );

  if (res.status === 200 || res.status === 201) {
    return { success: true, platform: "greenhouse", board: boardToken, jobId };
  }

  let body = "";
  try {
    body = await res.text();
  } catch {}
  return {
    success: false,
    reason: `HTTP ${res.status}: ${body.slice(0, 200)}`,
    platform: "greenhouse",
  };
}

// ─── Lever submitter ──────────────────────────────────────────────────────────
async function submitLever(job, application) {
  const url = job.url;

  // Parse company + posting ID from jobs.lever.co/COMPANY/POSTING_ID
  const m = url.match(/jobs\.lever\.co\/([^/?#]+)\/([a-f0-9-]{36})/i);
  if (!m) {
    return {
      success: false,
      reason: `URL missing Lever posting ID: ${url}`,
      platform: "lever",
    };
  }
  const [, company, postingId] = m;

  const form = new FormData();
  form.append("name", `${PROFILE.first_name} ${PROFILE.last_name}`);
  form.append("email", PROFILE.email);
  form.append("phone", PROFILE.phone);
  form.append("org", PROFILE.current_company);
  form.append("comments", application.cover_letter || "");
  form.append("urls[LinkedIn]", PROFILE.linkedin);
  form.append("urls[GitHub]", PROFILE.github);
  form.append("urls[Portfolio]", PROFILE.website);

  const resumeB64 = readFileSync(RESUME_PATH).toString("base64");
  form.append("resume", resumeB64);
  form.append("resume_filename", "Guillermo_Villegas_Resume.pdf");

  if (DRY_RUN) {
    return { success: true, reason: "dry-run", platform: "lever", company, postingId };
  }

  const res = await fetch(`https://api.lever.co/v0/postings/${company}/${postingId}/apply`, {
    method: "POST",
    body: form,
  });

  if (res.status === 200 || res.status === 201) {
    return { success: true, platform: "lever", company, postingId };
  }

  let body = "";
  try {
    body = await res.text();
  } catch {}
  return {
    success: false,
    reason: `HTTP ${res.status}: ${body.slice(0, 200)}`,
    platform: "lever",
  };
}

// ─── Ashby submitter ──────────────────────────────────────────────────────────
async function submitAshby(job, application) {
  const url = job.url;

  // jobs.ashbyhq.com/COMPANY/JOB_UUID
  const m = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)\/([a-f0-9-]{36})/i);
  if (!m) {
    return {
      success: false,
      reason: `URL missing Ashby job UUID: ${url}`,
      platform: "ashby",
    };
  }
  const [, org, jobId] = m;

  // Fetch Ashby application form definition
  let formDef = null;
  try {
    const formRes = await fetch(
      `https://api.ashbyhq.com/applicationForm.info?jobPostingId=${jobId}`,
    );
    if (formRes.ok) {
      formDef = await formRes.json();
    }
  } catch {}

  if (!formDef?.success) {
    return {
      success: false,
      reason: "Could not fetch Ashby form definition",
      platform: "ashby",
    };
  }

  // Build submission payload
  const fields = [];
  const form = formDef.results?.applicationForm;
  for (const field of form?.fieldGroups?.flatMap((g) => g.fields) || []) {
    const fid = field.field?.path || field.field?.id;
    if (!fid) {
      continue;
    }

    let value = null;
    const label = (field.field?.title || "").toLowerCase();

    if (fid === "_systemfield_name" || label.includes("full name")) {
      value = `${PROFILE.first_name} ${PROFILE.last_name}`;
    } else if (fid === "_systemfield_email" || label.includes("email")) {
      value = PROFILE.email;
    } else if (fid === "_systemfield_phone" || label.includes("phone")) {
      value = PROFILE.phone;
    } else if (fid === "_systemfield_resume" || label.includes("resume")) {
      // Ashby requires resume as a file reference — skip for now
      continue;
    } else if (label.includes("linkedin")) {
      value = PROFILE.linkedin;
    } else if (label.includes("github")) {
      value = PROFILE.github;
    } else if (label.includes("website") || label.includes("portfolio")) {
      value = PROFILE.website;
    } else if (label.includes("cover letter")) {
      value = application.cover_letter || "";
    } else if (field.isRequired) {
      const auto = autoAnswer(field.field || {});
      if (auto === null) {
        return {
          success: false,
          reason: `Required Ashby field needs manual answer: "${field.field?.title}"`,
          platform: "ashby",
        };
      }
      value = auto;
    }

    if (value !== null) {
      fields.push({ path: fid, value });
    }
  }

  if (DRY_RUN) {
    return { success: true, reason: "dry-run", platform: "ashby", org, jobId };
  }

  const res = await fetch("https://api.ashbyhq.com/applicationForm.submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobPostingId: jobId, fieldSubmissions: fields }),
  });

  if (res.status === 200 || res.status === 201) {
    return { success: true, platform: "ashby", org, jobId };
  }

  let body = "";
  try {
    body = await res.text();
  } catch {}
  return {
    success: false,
    reason: `HTTP ${res.status}: ${body.slice(0, 200)}`,
    platform: "ashby",
  };
}

// ─── Auto-answer common questions ────────────────────────────────────────────
function autoAnswer(question) {
  const label = (question.label || question.name || question.title || "").toLowerCase();

  // Work authorization (US)
  if (/authorized|authorization|eligible to work|legal.{0,10}work/i.test(label)) {
    if (question.values?.length) {
      return (
        question.values.find((v) => /^yes$/i.test(v.label))?.value ??
        question.values.find((v) => /yes|authorized|eligible/i.test(v.label))?.value ??
        null
      );
    }
    return "Yes";
  }

  // Sponsorship requirement
  if (/sponsor|visa.{0,10}require|require.{0,10}visa/i.test(label)) {
    if (question.values?.length) {
      return (
        question.values.find((v) => /^no$/i.test(v.label))?.value ??
        question.values.find((v) => /no|not require/i.test(v.label))?.value ??
        null
      );
    }
    return "No";
  }

  // LinkedIn URL
  if (/linkedin/i.test(label)) {
    return PROFILE.linkedin;
  }

  // GitHub
  if (/github/i.test(label)) {
    return PROFILE.github;
  }

  // Website / portfolio
  if (/website|portfolio|personal.{0,5}url/i.test(label)) {
    return PROFILE.website;
  }

  // Location / city
  if (/city|location|where.{0,10}based/i.test(label)) {
    return PROFILE.location;
  }

  // Remote OK
  if (/remote|work from home|wfh/i.test(label)) {
    if (question.values?.length) {
      return question.values.find((v) => /yes|comfortable|open|ok/i.test(v.label))?.value ?? null;
    }
    return "Yes";
  }

  // How did you hear
  if (/hear about|find.{0,10}(this|role|job|us)|source of/i.test(label)) {
    if (question.values?.length) {
      return (
        question.values.find((v) => /linkedin|job board|indeed|board/i.test(v.label))?.value ??
        question.values[0]?.value ??
        null
      );
    }
    return "LinkedIn";
  }

  // Salary expectations (provide a range)
  if (/salary|compensation|pay.{0,10}expect/i.test(label)) {
    return "200000-250000";
  }

  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log("=== CareerClaw Auto-Submit ===");
console.log(`Date:     ${new Date().toISOString().slice(0, 16)}`);
console.log(`Dry run:  ${DRY_RUN}`);
console.log(`Limit:    ${LIMIT}`);
console.log(`Min score: ${MIN_SCORE}`);
console.log("");

// 1. Fetch interested applications (with cover letters)
const applications = await supabaseGet(
  `applications?status=eq.interested&cover_letter=not.is.null&select=id,job_id,cover_letter,match_score,platform,priority&order=match_score.desc&limit=${LIMIT}`,
);

if (!applications.length) {
  console.log("No interested applications with cover letters found.");
  process.exit(0);
}

// 2. Fetch the corresponding jobs
const jobIds = [...new Set(applications.map((a) => a.job_id).filter(Boolean))];
const jobs = await supabaseGet(
  `jobs?id=in.(${jobIds.join(",")})&select=id,title,company,url,match_score`,
);
const jobMap = Object.fromEntries(jobs.map((j) => [j.id, j]));

// 3. Filter by score and detect platform
const submittable = applications.filter((a) => {
  const job = jobMap[a.job_id];
  if (!job?.url) {
    return false;
  }
  const platform = detectPlatform(job.url);
  if (!platform) {
    return false;
  }
  const score = a.match_score || job.match_score || 0;
  return score >= MIN_SCORE;
});

const unsubmittable = applications.filter((a) => {
  const job = jobMap[a.job_id];
  if (!job?.url) {
    return true;
  }
  return !detectPlatform(job.url);
});

console.log(`Interested applications: ${applications.length}`);
console.log(`Submittable (GH/Lever/Ashby): ${submittable.length}`);
console.log(`Needs manual submission: ${unsubmittable.length}`);
console.log("");

if (unsubmittable.length) {
  console.log("Manual submission needed:");
  for (const a of unsubmittable) {
    const job = jobMap[a.job_id];
    if (job) {
      console.log(`  [${a.match_score}] ${job.title} @ ${job.company} → ${job.url || "no url"}`);
    }
  }
  console.log("");
}

if (!submittable.length) {
  console.log("Nothing to auto-submit.");
  process.exit(0);
}

// 4. Submit each
let submitted = 0;
let failed = 0;
const TODAY = new Date().toISOString().slice(0, 10);

for (const [i, application] of submittable.entries()) {
  const job = jobMap[application.job_id];
  const platform = detectPlatform(job.url);
  const num = i + 1;

  console.log(
    `─── [${num}/${submittable.length}] ${job.title} @ ${job.company} (score: ${application.match_score}) ───`,
  );
  console.log(`    URL: ${job.url}`);
  console.log(`    Platform: ${platform}`);

  let result;
  try {
    if (platform === "greenhouse") {
      result = await submitGreenhouse(job, application);
    } else if (platform === "lever") {
      result = await submitLever(job, application);
    } else if (platform === "ashby") {
      result = await submitAshby(job, application);
    } else {
      result = { success: false, reason: "Unknown platform" };
    }
  } catch (err) {
    result = { success: false, reason: String(err) };
  }

  if (result.success) {
    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would submit to ${platform}`);
    } else {
      console.log(`    ✓ Submitted to ${platform}`);
      submitted++;

      // Update application status
      await supabasePatch("applications", application.id, {
        status: "applied",
        application_date: TODAY,
        notes: `Auto-submitted via ${platform} API on ${TODAY}`,
      });
    }
  } else {
    console.log(`    ✗ ${result.reason}`);
    // Update notes with failure reason for manual review
    if (!DRY_RUN) {
      await supabasePatch("applications", application.id, {
        notes: `Auto-submit failed (${platform}): ${result.reason}. Submit manually.`,
      });
    }
    failed++;
  }

  console.log("");

  // Rate limit pause
  if (i < submittable.length - 1) {
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// 5. Summary
console.log("=== Submit Complete ===");
if (DRY_RUN) {
  console.log(`Dry run: ${submittable.length} would be submitted to ATS platforms`);
} else {
  console.log(`Submitted:  ${submitted}`);
  console.log(`Failed:     ${failed}`);
  console.log(`Manual:     ${unsubmittable.length}`);
}
console.log("");
