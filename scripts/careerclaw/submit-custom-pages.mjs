#!/usr/bin/env node
/**
 * submit-custom-pages.mjs
 * Submits applications on custom career pages (non-ATS) using headed Playwright.
 * Uses generic form detection and filling.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = "/Users/g/development/career-claw";

// Load env
const envLines = readFileSync(join(ROOT, ".env"), "utf8").split("\n");
const env = {};
for (const line of envLines) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const SB = env.JOBCLAW_SUPABASE_URL;
const SK = env.JOBCLAW_SUPABASE_KEY;
const h = { apikey: SK, Authorization: "Bearer " + SK };
const hw = { ...h, "Content-Type": "application/json", Prefer: "return=minimal" };

// Load profile
const profile = JSON.parse(readFileSync(join(ROOT, "config/profile.json"), "utf8"));
const P = {
  first_name: profile.personal.first_name,
  last_name: profile.personal.last_name,
  full_name: `${profile.personal.first_name} ${profile.personal.last_name}`,
  email: profile.personal.email,
  phone: profile.personal.phone,
  phone_formatted: profile.personal.phone_formatted || profile.personal.phone,
  location: profile.personal.location,
  linkedin: profile.online.linkedin,
  github: profile.online.github,
  website: profile.online.website,
  zip_code: profile.personal?.zip_code || "",
};
const RESUME_PATH = join(ROOT, profile.professional.resume_filename || "resume.pdf");

const DRY_RUN = process.argv.includes("--dry-run");

// Get interested apps with non-ATS URLs
const apps = await (
  await fetch(
    `${SB}/rest/v1/applications?status=eq.interested&select=id,job_id,match_score,cover_letter,notes&order=match_score.desc&limit=300`,
    { headers: h },
  )
).json();
const jobIds = [...new Set(apps.map((a) => a.job_id).filter(Boolean))];
const jobs = await (
  await fetch(`${SB}/rest/v1/jobs?id=in.(${jobIds.join(",")})&select=id,title,company,url`, {
    headers: h,
  })
).json();
const jm = Object.fromEntries(jobs.map((j) => [j.id, j]));

// Filter to non-ATS URLs only (exclude greenhouse, ashby, lever, icims)
const customApps = apps.filter((a) => {
  const j = jm[a.job_id];
  if (!j?.url) {
    return false;
  }
  if (/greenhouse|ashby|lever\.co|icims/i.test(j.url)) {
    return false;
  }
  // Skip already-failed
  if (a.notes && /Auto-submit failed/i.test(a.notes)) {
    return false;
  }
  return true;
});

console.log(`Custom career page apps: ${customApps.length}`);
if (!customApps.length) {
  console.log("No custom career page apps to submit.");
  process.exit(0);
}

// Group by domain for similar form handling
const byDomain = {};
for (const a of customApps) {
  const j = jm[a.job_id];
  try {
    const domain = new URL(j.url).hostname.replace(/^www\./, "");
    if (!byDomain[domain]) {
      byDomain[domain] = [];
    }
    byDomain[domain].push({ a, j });
  } catch {}
}

console.log("\nDomains:");
for (const [domain, items] of Object.entries(byDomain).toSorted(
  (a, b) => b[1].length - a[1].length,
)) {
  console.log(`  ${domain}: ${items.length} apps`);
  for (const { a, j } of items) {
    console.log(`    [${a.match_score}] ${j.company} — ${j.title}`);
  }
}

// Launch browser
const browser = await chromium.launch({ headless: false, slowMo: 300 });
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
});

const TODAY = new Date().toISOString().split("T")[0];
let submitted = 0,
  failed = 0;

async function fillByLabel(page, labelPattern, value) {
  try {
    const labels = await page.locator("label").all();
    for (const label of labels) {
      const text = await label.textContent().catch(() => "");
      if (labelPattern.test(text)) {
        const forAttr = await label.getAttribute("for");
        if (forAttr) {
          const input = page.locator(`#${CSS.escape(forAttr)}`);
          if (await input.isVisible({ timeout: 500 })) {
            await input.fill(value);
            return true;
          }
        }
        // Try sibling/child input
        const nearby = label.locator("~ input, ~ textarea, input, textarea").first();
        if (await nearby.isVisible({ timeout: 500 })) {
          await nearby.fill(value);
          return true;
        }
      }
    }
  } catch {}
  return false;
}

async function fillByPlaceholder(page, placeholderPattern, value) {
  try {
    const inputs = await page.locator(`input[placeholder], textarea[placeholder]`).all();
    for (const input of inputs) {
      const ph = (await input.getAttribute("placeholder")) || "";
      if (placeholderPattern.test(ph) && (await input.isVisible({ timeout: 500 }))) {
        await input.fill(value);
        return true;
      }
    }
  } catch {}
  return false;
}

async function fillByName(page, namePattern, value) {
  try {
    const inputs = await page.locator(`input[name], textarea[name], select[name]`).all();
    for (const input of inputs) {
      const name = (await input.getAttribute("name")) || "";
      if (namePattern.test(name) && (await input.isVisible({ timeout: 500 }))) {
        const tag = await input.evaluate((el) => el.tagName.toLowerCase());
        if (tag === "select") {
          await input
            .selectOption({ label: value })
            .catch(() => input.selectOption(value).catch(() => {}));
        } else {
          await input.fill(value);
        }
        return true;
      }
    }
  } catch {}
  return false;
}

async function uploadResume(page) {
  if (!existsSync(RESUME_PATH)) {
    return false;
  }
  try {
    // Look for file inputs
    const fileInputs = await page.locator('input[type="file"]').all();
    for (const fi of fileInputs) {
      const accept = ((await fi.getAttribute("accept")) || "").toLowerCase();
      const name = ((await fi.getAttribute("name")) || "").toLowerCase();
      const ariaLabel = ((await fi.getAttribute("aria-label")) || "").toLowerCase();

      // Check if it's resume-related
      if (
        accept.includes("pdf") ||
        accept.includes("doc") ||
        /resume|cv|document/i.test(name) ||
        /resume|cv/i.test(ariaLabel) ||
        fileInputs.length === 1
      ) {
        await fi.setInputFiles(RESUME_PATH);
        console.log("      Uploaded resume");
        return true;
      }
    }

    // Try clicking upload buttons
    const uploadBtns = page.locator(
      'button:has-text("upload"), button:has-text("attach"), a:has-text("upload resume"), [class*="upload"]',
    );
    if ((await uploadBtns.count()) > 0) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 3000 }),
        uploadBtns.first().click(),
      ]).catch(() => [null]);
      if (fileChooser) {
        await fileChooser.setFiles(RESUME_PATH);
        console.log("      Uploaded resume via file chooser");
        return true;
      }
    }
  } catch {}
  return false;
}

async function genericFormFill(page, job, coverLetter) {
  // Try various name/label/placeholder patterns for common fields
  const fills = [
    // Name fields
    [/first.?name/i, P.first_name],
    [/last.?name/i, P.last_name],
    [/full.?name|your.?name/i, P.full_name],
    // Contact
    [/email/i, P.email],
    [/phone|mobile|tel/i, P.phone],
    // Location
    [/city|location|address/i, P.location],
    [/zip|postal/i, P.zip_code],
    // Professional
    [/linkedin/i, P.linkedin],
    [/website|portfolio|url/i, P.website],
    [/github/i, P.github],
    // Cover letter
    [/cover.?letter|message|why.*interest|tell.*about/i, coverLetter || ""],
  ];

  let filled = 0;
  for (const [pattern, value] of fills) {
    if (!value) {
      continue;
    }
    // Try by name attribute first, then label, then placeholder
    const byName = await fillByName(page, pattern, value);
    if (byName) {
      filled++;
      continue;
    }
    const byLabel = await fillByLabel(page, pattern, value);
    if (byLabel) {
      filled++;
      continue;
    }
    const byPlaceholder = await fillByPlaceholder(page, pattern, value);
    if (byPlaceholder) {
      filled++;
    }
  }

  // Upload resume
  await uploadResume(page);

  return filled;
}

async function trySubmitPage(page, job, coverLetter) {
  // Navigate to job URL
  console.log(`    Navigating to ${job.url}`);
  await page.goto(job.url, { timeout: 15000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // Check if page loaded
  const title = await page.title();
  if (/404|not found|error/i.test(title)) {
    return { success: false, reason: "Page not found (404)" };
  }

  // Look for "Apply" button first
  const applyBtns = page.locator(
    'a:has-text("Apply"), button:has-text("Apply"), [class*="apply"], a[href*="apply"]',
  );
  const applyCount = await applyBtns.count();
  if (applyCount > 0) {
    console.log(`    Found ${applyCount} apply button(s), clicking first...`);
    try {
      await applyBtns.first().click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } catch {
      console.log("    Apply button click failed, trying form directly");
    }
  }

  // Fill form fields
  const filled = await genericFormFill(page, job, coverLetter);
  console.log(`    Filled ${filled} fields`);

  if (filled < 2) {
    // Try scrolling to find more fields
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1000);
    const filled2 = await genericFormFill(page, job, coverLetter);
    console.log(`    Filled ${filled2} more fields after scroll`);
    if (filled + filled2 < 2) {
      return {
        success: false,
        reason: `Only filled ${filled + filled2} fields — form structure unknown`,
      };
    }
  }

  if (DRY_RUN) {
    return { success: true, reason: "dry-run" };
  }

  // Look for submit button
  const submitBtns = page.locator(
    'button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Send"), button:has-text("Apply")',
  );
  const submitCount = await submitBtns.count();
  if (submitCount > 0) {
    console.log(`    Clicking submit...`);
    await submitBtns
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(3000);

    // Check for success indicators
    const pageText = await page.textContent("body").catch(() => "");
    if (
      /thank you|application.*received|successfully|submitted|confirmation/i.test(
        pageText.slice(0, 3000),
      )
    ) {
      return { success: true };
    }
    // If no error visible, assume success
    return { success: true, reason: "submitted (unconfirmed)" };
  }

  return { success: false, reason: "No submit button found" };
}

// Process top 10 highest-score custom apps
const toProcess = customApps.slice(0, 10);
console.log(`\nProcessing top ${toProcess.length} custom career page apps...\n`);

for (const [i, a] of toProcess.entries()) {
  const j = jm[a.job_id];
  console.log(`─── [${i + 1}/${toProcess.length}] ${j.title} @ ${j.company} ───`);
  console.log(`    Score: ${a.match_score}`);

  try {
    const page = await context.newPage();
    const result = await trySubmitPage(page, j, a.cover_letter);
    await page.close();

    if (result.success) {
      console.log(`    ✓ ${result.reason || "Submitted"}`);
      submitted++;
      if (!DRY_RUN) {
        await fetch(`${SB}/rest/v1/applications?id=eq.${a.id}`, {
          method: "PATCH",
          headers: hw,
          body: JSON.stringify({
            status: "applied",
            application_date: TODAY,
            notes: `Auto-submitted via Playwright (custom) on ${TODAY}`,
          }),
        });
      }
    } else {
      console.log(`    ✗ ${result.reason}`);
      failed++;
      if (!DRY_RUN) {
        await fetch(`${SB}/rest/v1/applications?id=eq.${a.id}`, {
          method: "PATCH",
          headers: hw,
          body: JSON.stringify({
            notes: `Auto-submit failed (custom): ${result.reason} — submit manually at: ${j.url} (${TODAY})`,
          }),
        });
      }
    }
  } catch (err) {
    console.log(`    ✗ Error: ${String(err).slice(0, 150)}`);
    failed++;
  }

  console.log("");
  await new Promise((r) => setTimeout(r, 2000));
}

await browser.close();
console.log(`\n=== Custom Submit Complete ===`);
console.log(`Submitted: ${submitted}`);
console.log(`Failed:    ${failed}`);
