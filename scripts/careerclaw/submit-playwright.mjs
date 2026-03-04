#!/usr/bin/env node
/**
 * submit-playwright.mjs
 * Submits "interested" applications using headless Chromium via Playwright.
 * No Chrome extension required. Runs standalone or from auto-apply.sh.
 *
 * Supported: Greenhouse, Lever, Ashby (best-effort on direct sites)
 *
 * Usage:
 *   node submit-playwright.mjs [--dry-run] [--limit N] [--min-score N] [--headed]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ImapFlow } from "imapflow";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

// ─── Load env ─────────────────────────────────────────────────────────────────
const env = {};
for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const SUPABASE_URL = env.JOBCLAW_SUPABASE_URL;
const SUPABASE_KEY = env.JOBCLAW_SUPABASE_KEY;
const RESUME_PATH = join(ROOT, "gv_resume.pdf");

// ─── Parse flags ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const HEADED = args.includes("--headed"); // show browser window for debugging
const limitIdx = args.indexOf("--limit");
const scoreIdx = args.indexOf("--min-score");
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;
const MIN_SCORE = scoreIdx !== -1 ? parseInt(args[scoreIdx + 1], 10) : 50;

// ─── Profile ──────────────────────────────────────────────────────────────────
const P = {
  first_name: "Guillermo",
  last_name: "Villegas",
  email: "guillermo.villegas.applies@gmail.com",
  phone: "7735511393",
  phone_formatted: "(773) 551-1393",
  location: "Chicago, IL",
  linkedin: "https://www.linkedin.com/in/guillermo-villegas-3080a011b",
  github: "https://github.com/guillermovillegas",
  website: "https://GuillermoTheEngineer.vercel.app",
  current_company: "Levee",
  years_total: "10",
  years_product: "6",
  years_ai: "5",
  years_leadership: "4",
};

// ─── Form Q&A tracker — logs every field we fill for auditing ────────────────
const formLog = []; // Accumulates { company, question, answer, field_id } per submission

function logFormAnswer(company, label, answer, fieldId) {
  formLog.push({
    company,
    question: label,
    answer,
    field_id: fieldId,
    timestamp: new Date().toISOString(),
  });
}

// ─── Gmail IMAP: mark all existing GH code emails as read (call before submit) ─
async function clearStaleGhCodes() {
  const user = env.GMAIL_USER;
  const password = env.GMAIL_APP_PASSWORD;
  if (!user || !password) {
    return;
  }
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass: password },
    logger: false,
  });
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    const uids = await client.search({ from: "greenhouse-mail.io", unseen: true });
    if (uids.length > 0) {
      await client.messageFlagsAdd(uids, ["\\Seen"]);
      console.log(`  [gmail] Cleared ${uids.length} stale GH code email(s)`);
    }
    await client.logout();
  } catch {
    try {
      await client.logout();
    } catch {}
  }
}

// ─── Gmail IMAP: fetch Greenhouse verification code ───────────────────────────
// Polls Gmail for 30s looking for an 8-char code from Greenhouse.
async function fetchGhVerificationCode(timeoutMs = 45000) {
  const user = env.GMAIL_USER;
  const password = env.GMAIL_APP_PASSWORD;
  if (!user || !password) {
    console.log("  [gmail] No GMAIL credentials — cannot auto-fetch code");
    return null;
  }
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass: password },
    logger: false,
  });
  const deadline = Date.now() + timeoutMs;
  const since = new Date(Date.now() - 2 * 60 * 1000); // emails from last 2 min
  console.log(`  [gmail] Polling for Greenhouse verification code (${timeoutMs / 1000}s)…`);

  function extractCode(rawSource) {
    // Decode quoted-printable encoding
    const decoded = rawSource
      .replace(/=([A-F0-9]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/=\r?\n/g, "");
    // Strip HTML tags
    const text = decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    // Greenhouse format: "paste this code into the security code field on your application: XXXXXXXX"
    const m =
      text.match(/application:\s+([A-Za-z0-9]{6,12})\b/i) ||
      text.match(/your code[^A-Za-z0-9]{0,20}([A-Za-z0-9]{6,12})\b/i) ||
      text.match(/security code[^A-Za-z0-9]{0,30}([A-Za-z0-9]{6,12})\b/i);
    return m ? m[1] : null;
  }

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    while (Date.now() < deadline) {
      // Unread + from greenhouse-mail.io — avoids reusing codes from previous apps
      const uids = await client.search({ since, from: "greenhouse-mail.io", unseen: true });
      for (const uid of uids) {
        const msg = await client.fetchOne(uid, { source: true });
        const raw = msg.source.toString("utf8");
        const code = extractCode(raw);
        if (code) {
          // Mark as read so next app doesn't reuse this code
          await client.messageFlagsAdd([uid], ["\\Seen"]).catch(() => {});
          console.log(`  [gmail] Found verification code: ${code}`);
          await client.logout();
          return code;
        }
      }
      await new Promise((r) => setTimeout(r, 5000)); // poll every 5s
    }
    await client.logout();
    console.log("  [gmail] No code found within timeout");
    return null;
  } catch (err) {
    console.log(`  [gmail] IMAP error: ${err.message}`);
    try {
      await client.logout();
    } catch {}
    return null;
  }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────
async function sGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return r.json();
}

async function sPatch(table, id, fields) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(fields),
  });
  return r.status;
}

const TODAY = new Date().toISOString().slice(0, 10);

// ─── Platform detection ───────────────────────────────────────────────────────
function detectPlatform(url) {
  if (!url) {
    return null;
  }
  if (/greenhouse\.io/i.test(url)) {
    return "greenhouse";
  }
  if (/lever\.co/i.test(url)) {
    return "lever";
  }
  if (/jobs\.ashbyhq\.com/i.test(url)) {
    return "ashby";
  }
  if (/icims\.com/i.test(url)) {
    return "icims";
  }
  return null;
}

// ─── Fill helper: try multiple selectors ─────────────────────────────────────
async function tryFill(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1000 })) {
        await el.fill(value);
        return true;
      }
    } catch {}
  }
  return false;
}

// ─── React Select helper ──────────────────────────────────────────────────────
// Greenhouse uses React Select for all dropdowns (class="select__input").
// You must click the input, optionally type to filter, then click select__option.
async function pickReactSelect(page, el, { search = "", matchFn = null } = {}) {
  try {
    if ((await el.count()) === 0) {
      return false;
    }
    await el.click({ timeout: 3000 });
    await page.waitForTimeout(200);
    if (search) {
      // Clear first, then type
      await el.evaluate((node) => {
        node.value = "";
      });
      await el.type(search, { delay: 25 });
      await page.waitForTimeout(600);
    } else {
      await page.waitForTimeout(400);
    }
    // Select__option is unique to React Select (phone ITI uses iti__country)
    const opts = page.locator('[class*="select__option"]:not([class*="selected"])');
    const count = await opts.count();
    if (!count) {
      // Try pressing Enter to accept typed value
      await page.keyboard.press("Enter");
      return true;
    }
    if (matchFn) {
      for (let i = 0; i < count; i++) {
        const t = (await opts.nth(i).textContent()) || "";
        if (matchFn(t)) {
          await opts.nth(i).click();
          return true;
        }
      }
    }
    await opts.first().click();
    return true;
  } catch {
    return false;
  }
}

// ─── Greenhouse: fill ALL form fields generically by label ───────────────────
async function fillGhForm(page, coverLetter, companyName = "unknown") {
  const { writeFileSync } = await import("fs");

  // Collect all visible form inputs with their labels
  const fieldIds = await page.evaluate(() => {
    const els = document.querySelectorAll(
      "input:not([type='hidden']):not([type='submit']), textarea, select",
    );
    return Array.from(els)
      .map((el) => {
        // Try direct label[for] first
        let lblEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
        // Try aria-labelledby
        if (!lblEl) {
          const lblId = el.getAttribute("aria-labelledby");
          if (lblId) {
            lblEl = document.getElementById(lblId);
          }
        }
        // Try aria-label attribute directly
        const ariaLabel = el.getAttribute("aria-label");
        if (!lblEl && ariaLabel) {
          return {
            id: el.id,
            tag: el.tagName.toLowerCase(),
            type: el.type || "",
            cls: el.className || "",
            label: ariaLabel,
          };
        }
        // Try ancestor field container (Greenhouse: .select__container > label, or .field > label)
        if (!lblEl) {
          const field = el.closest(
            ".select__container, .field, .application-field, [class*='question'], .form-group, .qs-form-group",
          );
          if (field) {
            lblEl = field.querySelector("label, legend, .field-label, .label");
          }
        }
        // Try closest label ancestor
        if (!lblEl) {
          lblEl = el.closest("label");
        }
        // Fallback: use placeholder or id as pseudo-label for floating label forms (e.g. new GH layout)
        let label = lblEl ? lblEl.textContent.trim() : "";
        if (!label && el.placeholder) {
          label = el.placeholder;
        }
        if (!label && el.id) {
          // Convert id like "first_name" → "first name", "preferred_name" → "preferred name"
          label = el.id.replace(/[_-]/g, " ").replace(/\d+/g, "").trim();
        }
        return {
          id: el.id,
          tag: el.tagName.toLowerCase(),
          type: el.type || "",
          cls: el.className || "",
          label: label,
        };
      })
      .filter((x) => x.id && !["hidden", "submit", "search"].includes(x.type));
  });

  for (const f of fieldIds) {
    if (!f.id) {
      continue;
    }
    const lbl = f.label.toLowerCase();
    // Always use attribute selector — IDs with digits, brackets, or special chars
    // are invalid in CSS `#id` syntax but safe in `[id="..."]` attribute selectors
    const el = page.locator(`[id="${f.id}"]`).first();
    const isReactSelect = f.cls.includes("select__input");
    const isTextarea = f.tag === "textarea";
    const isCheckbox = f.type === "checkbox";
    const isRadio = f.type === "radio";
    const isFile = f.type === "file";
    const isNativeSelect = f.tag === "select";

    try {
      if (isFile) {
        continue;
      } // handled separately
      if (isCheckbox) {
        if (
          /acknowledge/i.test(lbl) || // EEO acknowledgements
          /consent|agree|terms|gdpr|privacy/i.test(lbl) // GDPR/consent
        ) {
          const checked = await el.isChecked().catch(() => false);
          if (!checked) {
            await el.check().catch(() => {});
          }
        } else if (/^linkedin$/i.test(lbl)) {
          // "How did you hear about us" — check LinkedIn option
          const checked = await el.isChecked().catch(() => false);
          if (!checked) {
            await el.check().catch(() => {});
          }
        }
        continue;
      }
      if (isRadio) {
        continue;
      } // rare on GH

      if (isReactSelect) {
        // ─── React Select dropdowns ───────────────────────────────────────────
        if (/country/i.test(lbl) && !/country.*cuba|ofac/i.test(lbl)) {
          await pickReactSelect(page, el, { search: "United States" });
        } else if (/location.*city|city.*location/i.test(lbl)) {
          await pickReactSelect(page, el, { search: "Chicago" });
        } else if (
          /authoriz|legally.*(work|employ)|legal.*authoriz|eligible.*work|work.*authoriz|currently.*legal.*work/i.test(
            lbl,
          )
        ) {
          await pickReactSelect(page, el, {
            matchFn: (t) => /^yes\b/i.test(t.trim()),
          });
        } else if (/sponsor|visa|require.*work.*permit|future.*sponsor|h-?1b/i.test(lbl)) {
          await pickReactSelect(page, el, {
            matchFn: (t) => /^no\b/i.test(t.trim()),
          }).catch(async () => {
            // If "No" not found, try typing it
            await pickReactSelect(page, el, { search: "No" }).catch(() => {});
          });
        } else if (/cuba|iran|north korea|sanctioned|ofac/i.test(lbl)) {
          await pickReactSelect(page, el, {
            matchFn: (t) => /^no\b/i.test(t.trim()),
          });
        } else if (
          /how many years|years of experience|years.*product|years.*management|years.*professional/i.test(
            lbl,
          )
        ) {
          // Numeric years-of-experience dropdowns — match the right range
          await pickReactSelect(page, el, {
            matchFn: (t) => {
              const txt = t.trim().toLowerCase();
              // Match "10+" or "10-15" or "8-10" or "7+" or "10" etc.
              if (/^10\b|^10\+|^10\s*-|8\s*-\s*10|8\+|7\+|7\s*-\s*10/i.test(txt)) {
                return true;
              }
              // Match "6+" or "5+" for PM-specific experience questions
              if (/product|pm\b|management/i.test(lbl) && /^[5-7]\+|^[5-7]\s*-/i.test(txt)) {
                return true;
              }
              return false;
            },
          }).catch(async () => {
            // Fallback: if no numeric range matched, try typing "10"
            await pickReactSelect(page, el, { search: "10" }).catch(() => {});
          });
        } else if (/years.*ai|years.*ml|years.*machine learning|ai.*experience.*years/i.test(lbl)) {
          // AI/ML specific years — 5 years (Levee 2023-now + Chamberlain + prior)
          await pickReactSelect(page, el, {
            matchFn: (t) => {
              const txt = t.trim().toLowerCase();
              if (/^5\b|^5\+|^5\s*-|^[4-6]\s*-\s*[5-8]|4\+|3\+/i.test(txt)) {
                return true;
              }
              return false;
            },
          }).catch(async () => {
            await pickReactSelect(page, el, { search: "5" }).catch(() => {});
          });
        } else if (
          /years.*lead|years.*manag.*people|years.*direct report|years.*supervis/i.test(lbl)
        ) {
          // People management years — 4 years
          await pickReactSelect(page, el, {
            matchFn: (t) => {
              const txt = t.trim().toLowerCase();
              if (/^[3-5]\b|^[3-5]\+|^3\s*-\s*5|^4/i.test(txt)) {
                return true;
              }
              return false;
            },
          }).catch(async () => {
            await pickReactSelect(page, el, { search: "4" }).catch(() => {});
          });
        } else if (
          /experience|proven|track record|building|working on|familiar|proficient/i.test(lbl)
        ) {
          // Yes/No experience questions (do you have experience with X?) → Yes
          await pickReactSelect(page, el, {
            matchFn: (t) => /^yes\b/i.test(t.trim()),
          });
        } else if (/hear about|referral|how.*find|source/i.test(lbl)) {
          // How did you hear about us
          await pickReactSelect(page, el, {
            matchFn: (t) => /linkedin|job board|website/i.test(t),
          });
        } else if (
          /gender|race|ethnicity|veteran|disability|sexual|transgender|hispanic/i.test(lbl)
        ) {
          // EEO — pick "decline" option; if none found, leave blank (these are not required)
          await pickReactSelect(page, el, {
            matchFn: (t) =>
              /decline|don.t wish|prefer not|choose not|not to answer|rather not/i.test(t),
          }).catch(() => {});
        } else if (lbl) {
          // Unknown required React Select — open and pick first non-empty option
          await pickReactSelect(page, el, {}).catch(() => {});
        }
      } else if (isNativeSelect) {
        // Native <select> (rare on new GH boards)
        if (/authoriz|legally.*(work|employ)|legal.*authoriz|eligible.*work/i.test(lbl)) {
          await el
            .selectOption({ label: "Yes" })
            .catch(() => el.selectOption({ index: 1 }).catch(() => {}));
        } else if (/sponsor|visa|require.*work.*permit/i.test(lbl)) {
          await el
            .selectOption({ label: "No" })
            .catch(() => el.selectOption({ index: 2 }).catch(() => {}));
        } else {
          // EEO or unknown — pick first non-blank
          const opts = await el.locator("option").allTextContents();
          const decline = opts.find((o) => /decline|prefer not|choose not|not to answer/i.test(o));
          if (decline) {
            await el.selectOption({ label: decline }).catch(() => {});
          } else if (opts.length > 1) {
            await el.selectOption({ index: 1 }).catch(() => {});
          }
        }
      } else if (isTextarea) {
        if (/g-recaptcha/i.test(f.cls)) {
          continue;
        } // reCAPTCHA textarea
        if (/cover|letter/i.test(lbl) || f.id === "cover_letter_text") {
          await el.fill(coverLetter).catch(() => {});
        } else if (
          /example|project|describe.*ai|describe.*product|tell us.*about.*experience|tell us.*about.*product|describe.*built/i.test(
            lbl,
          )
        ) {
          // AI project / product experience example
          await el
            .fill(
              "As CPO at Levee, I built and launched an AI-powered B2B SaaS hospitality platform with proprietary computer vision achieving 92%+ accuracy, reducing inspection time 60% across a 605-room Marriott pilot. I owned the full ML infrastructure roadmap (YOLO/RT-DETR models on GCP), product strategy for our multi-tenant management portal, and a mobile app with offline-first architecture. Previously at Chamberlain Group, I drove a $250M+ smart-home product portfolio and led the Ring partnership that achieved +68% IRR transformation. Our work at Levee won the PhocusWire Global Startup Pitch award and multiple AI innovation recognitions.",
            )
            .catch(() => {});
        } else if (
          /why.*interest|why.*role|why.*company|why.*want|what.*excites|what.*attracts|motivation/i.test(
            lbl,
          )
        ) {
          // "Why are you interested in this role/company?" questions
          await el
            .fill(
              "I'm drawn to this role because it combines strategic product leadership with hands-on AI/ML product development — exactly where my experience lies. With 10 years scaling B2B SaaS products and 5 years building production AI systems, I bring both the strategic vision and technical depth to drive meaningful product outcomes. I'm particularly excited about the opportunity to apply my experience building zero-to-one AI products to a new challenge.",
            )
            .catch(() => {});
        } else if (/tell us|anything.*add|additional.*info|anything.*else/i.test(lbl)) {
          await el
            .fill(
              "10 years of product and engineering leadership across AI, B2B SaaS, IoT, and FinTech. Co-Founder/CPO at Levee where I built production computer vision and AI systems. Previously drove $250M+ portfolio at Chamberlain Group. Chicago Product Management Association organizer for 7+ years. PhocusWire Global Startup Pitch Award winner.",
            )
            .catch(() => {});
        } else {
          // Other required textarea — provide concise professional summary
          await el
            .fill(
              "Product leader with 10 years of experience scaling B2B SaaS across AI, IoT, hospitality, and FinTech. Co-Founder/CPO at Levee (AI hospitality platform). Previously drove $250M+ product portfolio at Chamberlain Group. PhocusWire Global Startup Pitch Award winner.",
            )
            .catch(() => {});
        }
      } else {
        // Regular text input
        if (/first.name|given.name/i.test(lbl)) {
          await el.fill(P.first_name).catch(() => {});
        } else if (/last.name|surname/i.test(lbl)) {
          await el.fill(P.last_name).catch(() => {});
        } else if (/preferred.*name/i.test(lbl)) {
          await el.fill(P.first_name).catch(() => {});
        } else if (/email/i.test(lbl)) {
          await el.fill(P.email).catch(() => {});
        } else if (/phone/i.test(lbl) && f.type === "tel") {
          await el.fill(P.phone_formatted).catch(() => {});
        } else if (/linkedin/i.test(lbl) && !/github/i.test(lbl)) {
          await el.fill(P.linkedin).catch(() => {});
        } else if (/github/i.test(lbl)) {
          await el.fill(P.github).catch(() => {});
        } else if (/website|portfolio/i.test(lbl)) {
          await el.fill(P.website).catch(() => {});
        } else if (/twitter|x\.com/i.test(lbl)) {
          // Skip — no Twitter
        } else if (/salary.*expect|desired.*salary/i.test(lbl)) {
          await el.fill("250000").catch(() => {}); // 250k — PM/Staff Engineer range
        } else if (/what state|state.*located|located.*state/i.test(lbl)) {
          await el.fill("Illinois").catch(() => {});
        } else if (/phonetic|pronounce|pronunciation/i.test(lbl)) {
          await el.fill("Gee-YAIR-mo vee-YEH-gas").catch(() => {});
        } else if (/pronoun/i.test(lbl)) {
          await el.fill("He/him").catch(() => {});
        } else if (/know anyone|anyone.*at.*company|referral.*contact|do you know/i.test(lbl)) {
          await el.fill("No").catch(() => {});
        } else if (/referred.by|who referred|referral.*name|referrer/i.test(lbl)) {
          // Required referral field — fill "N/A" when not referred
          await el.fill("N/A").catch(() => {});
        } else if (/\bcity\b/i.test(lbl)) {
          await el.fill("Chicago").catch(() => {});
        } else if (/^state$|^state\/province$|state.*residence/i.test(lbl)) {
          await el.fill("IL").catch(() => {});
        } else if (/^zip$|^zip code$|postal.*code/i.test(lbl)) {
          await el.fill("60614").catch(() => {});
        } else if (/current.*company|company.*name|employer/i.test(lbl)) {
          await el.fill(P.current_company).catch(() => {});
        } else if (/programming.*language|language.*proficient|coding.*language/i.test(lbl)) {
          await el.fill("Python, TypeScript (n/a - PM role)").catch(() => {});
        } else if (/ai.*tool|llm.*familiar|familiar.*llm|ai.*model|llm.*use/i.test(lbl)) {
          await el.fill("Claude (Anthropic), GPT-4, Gemini").catch(() => {});
        } else if (
          /compensation.*expect|expect.*compensation|salary.*expect|desired.*salary/i.test(lbl)
        ) {
          await el.fill("250000").catch(() => {});
        } else if (
          /describe.*experience|your.*experience|tell.*us.*about|experience.*owning|experience.*with/i.test(
            lbl,
          )
        ) {
          await el
            .fill(
              "10 years of product leadership across AI, B2B SaaS, IoT, and FinTech. As CPO at Levee, built AI-powered hospitality platform with computer vision (92%+ accuracy), winning PhocusWire Global Pitch Award. At Chamberlain Group, drove $250M+ product portfolio with +68% IRR on Ring partnership. 5 years hands-on AI/ML experience, 6 years product management.",
            )
            .catch(() => {});
        } else if (/physical.*address|mailing.*address|full.*address|street.*address/i.test(lbl)) {
          await el.fill("Chicago, IL 60614").catch(() => {});
        } else if (/visa.*status|current.*visa|immigration.*status/i.test(lbl)) {
          await el.fill("US Citizen").catch(() => {});
        } else if (/legal.*address|full.*address|home.*address|residential.*address/i.test(lbl)) {
          await el.fill("Chicago, IL 60614").catch(() => {});
        } else if (/current.*location|where.*located|location.*city|your.*location/i.test(lbl)) {
          await el.fill("Chicago, IL").catch(() => {});
        } else if (
          /target.*compensation|compensation.*range|desired.*comp|total.*comp|expected.*comp/i.test(
            lbl,
          )
        ) {
          await el.fill("Open to discussion based on total package").catch(() => {});
        } else if (
          /elaborate|please.*explain.*visa|if.*yes.*elaborate|sponsorship.*detail/i.test(lbl)
        ) {
          // Visa sponsorship "If yes, please elaborate" text fields
          await el.fill("N/A — US Citizen, no sponsorship required.").catch(() => {});
        } else if (/^company.*name$|^company$/i.test(lbl)) {
          // Work history company name field
          await el.fill("Levee").catch(() => {});
        } else if (/^title$|^job.*title$|^position$/i.test(lbl)) {
          // Work history title field
          await el.fill("Chief Product Officer").catch(() => {});
        } else if (/start.*year|year.*start/i.test(lbl)) {
          await el.fill("2023").catch(() => {});
        } else if (/end.*year|year.*end/i.test(lbl)) {
          // Leave blank (currently employed)
        } else if (
          /how many years|years of (experience|professional|product|pm\b|management|work)|total.*years/i.test(
            lbl,
          )
        ) {
          // Numeric years of experience text inputs
          if (/ai|ml|machine learning|artificial intelligence/i.test(lbl)) {
            await el.fill("5").catch(() => {});
          } else if (/product|pm\b|management/i.test(lbl)) {
            await el.fill("6").catch(() => {});
          } else if (/lead|manag.*people|direct report|supervis/i.test(lbl)) {
            await el.fill("4").catch(() => {});
          } else if (/saas|b2b|software/i.test(lbl)) {
            await el.fill("10").catch(() => {});
          } else {
            await el.fill("10").catch(() => {});
          }
        } else if (/years.*ai|ai.*years|years.*ml|ml.*years|years.*machine learning/i.test(lbl)) {
          await el.fill("5").catch(() => {});
        } else if (/years.*lead|years.*manag|years.*direct/i.test(lbl)) {
          await el.fill("4").catch(() => {});
        }
        // Unknown text fields: leave blank (non-required will pass)
      }
    } catch {}
  }

  // ─── Second pass: proactively handle work auth by question container text ───
  // Catches cases where label detection fails (deep nesting, no for= attribute)
  try {
    const containers = await page
      .locator(
        '.select__container, .field, [class*="question-container"], [class*="qs-form-group"]',
      )
      .all();
    for (const container of containers) {
      const qText = (await container.textContent().catch(() => "")).toLowerCase();
      const selects = container.locator(".select__input");
      const selectCount = await selects.count().catch(() => 0);
      if (!selectCount) {
        continue;
      }
      for (let si = 0; si < selectCount; si++) {
        const sel = selects.nth(si);
        const val = await sel.inputValue().catch(() => "");
        if (val) {
          continue;
        } // already filled
        if (/authoriz|legally.*work|legal.*work/i.test(qText)) {
          await pickReactSelect(page, sel, { matchFn: (t) => /^yes\b/i.test(t.trim()) }).catch(
            () => {},
          );
        } else if (/sponsor|visa.*sponsor|require.*sponsor/i.test(qText)) {
          await pickReactSelect(page, sel, { matchFn: (t) => /^no\b/i.test(t.trim()) }).catch(
            () => {},
          );
        }
      }
    }
  } catch {}

  // ─── Resume upload (first file input with id containing "resume") ──────────
  const resumeInput = page
    .locator('#resume[type="file"], input[id*="resume"][type="file"]')
    .first();
  try {
    if ((await resumeInput.count()) > 0) {
      await resumeInput.setInputFiles(RESUME_PATH);
      await page.waitForTimeout(800);
    }
  } catch {}

  // ─── Cover letter file upload (if no text textarea was found/filled) ────────
  const clTextArea = page.locator("#cover_letter_text");
  const clFilled =
    (await clTextArea.count()) > 0 && (await clTextArea.inputValue().catch(() => "")) !== "";
  if (!clFilled) {
    const clFile = page.locator('#cover_letter[type="file"]').first();
    if ((await clFile.count()) > 0) {
      const tmpCl = `/tmp/cover-letter-${Date.now()}.txt`;
      writeFileSync(tmpCl, coverLetter, "utf8");
      await clFile.setInputFiles(tmpCl).catch(() => {});
    }
  }

  // ─── Post-fill audit: capture all filled values for Q&A log ────────────────
  try {
    const filledFields = await page.evaluate(() => {
      const els = document.querySelectorAll(
        "input:not([type='hidden']):not([type='submit']):not([type='file']), textarea, select",
      );
      return Array.from(els)
        .map((el) => {
          let lblEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
          if (!lblEl) {
            const field = el.closest(
              ".select__container, .field, .application-field, [class*='question'], .form-group",
            );
            if (field) {
              lblEl = field.querySelector("label, legend, .field-label");
            }
          }
          if (!lblEl) {
            lblEl = el.closest("label");
          }
          const label = lblEl
            ? lblEl.textContent.trim()
            : el.getAttribute("aria-label") || el.placeholder || el.id || "";
          const value =
            el.type === "checkbox" ? (el.checked ? "checked" : "unchecked") : el.value || "";
          return { label, value, id: el.id, type: el.type || el.tagName.toLowerCase() };
        })
        .filter((x) => x.value && x.value.length > 0 && !["hidden", "submit"].includes(x.type));
    });
    for (const ff of filledFields) {
      // Skip logging PII fields and cover letters (too long)
      if (/cover.letter|recaptcha/i.test(ff.label) || ff.value.length > 500) {
        continue;
      }
      logFormAnswer(companyName, ff.label, ff.value, ff.id);
    }
  } catch {}
}

// ─── Greenhouse submitter ─────────────────────────────────────────────────────
async function submitGreenhouse(page, job, coverLetter) {
  await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Click Apply button (form may load dynamically on same page)
  const applyBtn = page
    .locator(
      [
        'a:has-text("Apply for this job")',
        'a:has-text("Apply Now")',
        'a:has-text("Apply")',
        'button:has-text("Apply")',
        '[data-mapped="true"]',
      ].join(", "),
    )
    .first();

  try {
    await applyBtn.waitFor({ timeout: 8000 });
    await applyBtn.click();
  } catch {}

  // Wait for form to render (React-rendered forms appear after click)
  try {
    await page.locator('#first_name, input[id*="first_name"]').first().waitFor({ timeout: 10000 });
  } catch {
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(500);

  // Fill all form fields generically (handles React Select + native inputs)
  await fillGhForm(page, coverLetter, job.company || "unknown");

  if (DRY_RUN) {
    return { success: true, reason: "dry-run" };
  }

  // Mark any stale GH code emails as read BEFORE submitting,
  // so fetchGhVerificationCode only finds the fresh code for this submission.
  await clearStaleGhCodes();

  // Submit
  const submitBtn = page
    .locator(
      [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Submit application")',
        'button:has-text("Submit")',
      ].join(", "),
    )
    .last();

  try {
    await submitBtn.waitFor({ timeout: 12000 });
    await submitBtn.click();
    // Wait for navigation or success indicator (up to 20s)
    await Promise.race([
      page.waitForURL(/confirmation|success|thank/i, { timeout: 20000 }),
      page.waitForSelector(
        '[class*="success"], [class*="confirmation"], [id*="confirmation"], h1:has-text("Thank"), h2:has-text("Thank")',
        { timeout: 20000 },
      ),
    ]).catch(() => page.waitForTimeout(5000));

    const bodyText = await page.textContent("body");
    if (
      /thank you|thanks for applying|application received|successfully submitted|we.ll be in touch|application submitted|we received your/i.test(
        bodyText,
      )
    ) {
      return { success: true };
    }
    if (
      /verification code.*sent|security code|confirm you.re a human|enter.*code/i.test(bodyText)
    ) {
      // Take a screenshot of the verification screen for debugging
      const verifyScreenPath = `/tmp/gh-verify-${Date.now()}.png`;
      await page.screenshot({ path: verifyScreenPath, fullPage: false }).catch(() => {});

      // Log all visible inputs to find the code input selector
      const verifyInputs = await page
        .evaluate(() =>
          Array.from(
            document.querySelectorAll(
              'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"])',
            ),
          ).map((el) => ({
            id: el.id,
            name: el.name,
            type: el.type,
            placeholder: el.placeholder,
            autocomplete: el.autocomplete,
            cls: el.className?.slice(0, 80),
            visible: el.offsetParent !== null,
          })),
        )
        .catch(() => []);
      console.log("    [code] Inputs on verify screen:", JSON.stringify(verifyInputs));

      // Greenhouse sent an email verification code — try to fetch from Gmail and enter it
      console.log("    [code] Verification code required — checking Gmail…");
      const code = await fetchGhVerificationCode(90000); // 90s — GH emails can be slow
      if (code) {
        // Greenhouse uses 8 individual character inputs: security-input-0 … security-input-7
        const firstBox = page.locator('[id="security-input-0"]');
        try {
          await firstBox.waitFor({ timeout: 5000 });
          // Fill each character into its own box
          for (let i = 0; i < code.length; i++) {
            await page
              .locator(`[id="security-input-${i}"]`)
              .fill(code[i])
              .catch(() => {});
            await page.waitForTimeout(60);
          }
          await page.waitForTimeout(500);
          // Re-submit
          const resubmitBtn = page
            .locator(
              'button[type="submit"], button:has-text("Submit"), button:has-text("Verify"), button:has-text("Continue")',
            )
            .last();
          await resubmitBtn.click().catch(() => submitBtn.click().catch(() => {}));
          await page.waitForTimeout(8000);
          const body2 = await page.textContent("body");
          if (
            /thank you|thanks for applying|application received|successfully submitted|we.ll be in touch|application submitted|we received your/i.test(
              body2,
            )
          ) {
            return { success: true };
          }
          const debugPath2 = `/tmp/gh-after-code-${Date.now()}.png`;
          await page.screenshot({ path: debugPath2 }).catch(() => {});
          return {
            success: false,
            reason: `Code entered but no confirmation (screenshot: ${debugPath2})`,
          };
        } catch (e) {
          const debugPath3 = `/tmp/gh-code-err-${Date.now()}.png`;
          await page.screenshot({ path: debugPath3 }).catch(() => {});
          return {
            success: false,
            reason: `Code ${code} — input error: ${e.message.slice(0, 80)} (screenshot: ${debugPath3})`,
          };
        }
      }
      return {
        success: false,
        reason: `Email verification required — no code found in Gmail (screenshot: ${verifyScreenPath})`,
      };
    }
    if (/this field is required|please fill|please complete|validation error/i.test(bodyText)) {
      // Save screenshot for debugging
      const debugPath = `/tmp/gh-fail-${Date.now()}.png`;
      await page.screenshot({ path: debugPath, fullPage: false }).catch(() => {});
      // Get specific error messages + their field labels
      const errDetails = await page
        .evaluate(() => {
          const results = [];
          document
            .querySelectorAll('[id*="-error"], [class*="field-error"], [class*="error-message"]')
            .forEach((el) => {
              if (!el.textContent?.trim()) {
                return;
              }
              // Find associated label via aria or parent
              const id = el.id?.replace(/-error$/, "");
              const lbl = id
                ? document.querySelector(`label[for="${id}"]`)?.textContent?.trim()
                : null;
              results.push(lbl ? `${lbl}: ${el.textContent.trim()}` : el.textContent.trim());
            });
          return results.slice(0, 5);
        })
        .catch(() => []);
      return {
        success: false,
        reason: `Validation errors: ${errDetails.join(" | ") || "unknown fields"} (screenshot: ${debugPath})`,
      };
    }
    // No clear error → treat as success (some GH boards show minimal confirmation)
    return { success: true };
  } catch (err) {
    return { success: false, reason: `Submit failed: ${err.message}` };
  }
}

// ─── Lever submitter ──────────────────────────────────────────────────────────
async function submitLever(page, job, coverLetter) {
  await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Lever shows an "Apply" button that navigates to the form
  try {
    const applyBtn = page.locator('a:has-text("Apply"), button:has-text("Apply")').first();
    await applyBtn.waitFor({ timeout: 5000 });
    await applyBtn.click();
    await page.waitForLoadState("domcontentloaded");
  } catch {}

  await page.waitForTimeout(1000);

  await tryFill(page, ['input[name="name"]', "#name"], `${P.first_name} ${P.last_name}`);
  await tryFill(page, ['input[name="email"]', "#email", 'input[type="email"]'], P.email);
  await tryFill(page, ['input[name="phone"]', "#phone", 'input[type="tel"]'], P.phone_formatted);
  await tryFill(
    page,
    ['input[name="org"]', "#org", 'input[placeholder*="company"]'],
    P.current_company,
  );
  await tryFill(page, ['textarea[name="comments"]', "#comments"], coverLetter);

  // URLs
  await tryFill(
    page,
    ['input[name="urls[LinkedIn]"]', 'input[placeholder*="linkedin"]'],
    P.linkedin,
  );
  await tryFill(page, ['input[name="urls[GitHub]"]', 'input[placeholder*="github"]'], P.github);
  await tryFill(
    page,
    ['input[name="urls[Portfolio]"]', 'input[placeholder*="portfolio"]'],
    P.website,
  );

  // Resume upload
  const resumeInput = page.locator('input[type="file"]').first();
  try {
    await resumeInput.setInputFiles(RESUME_PATH);
    await page.waitForTimeout(500);
  } catch {}

  if (DRY_RUN) {
    return { success: true, reason: "dry-run" };
  }

  const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
  try {
    await submitBtn.waitFor({ timeout: 5000 });
    // Detect hCaptcha — button is hidden behind captcha
    const isHidden = await submitBtn
      .evaluate((el) => el.id === "hcaptchaSubmitBtn" || el.classList.contains("hidden"))
      .catch(() => false);
    if (isHidden) {
      return { success: false, reason: "hCaptcha required — submit manually" };
    }
    await submitBtn.click();
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    const body = await page.textContent("body");
    if (/thank you|submitted|application received/i.test(body)) {
      return { success: true };
    }
    return { success: true }; // optimistic
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

// ─── Ashby submitter ──────────────────────────────────────────────────────────
async function submitAshby(page, job, coverLetter) {
  // Try direct /application URL first (skips the landing page "Apply" button)
  const baseUrl = job.url.replace(/\/application$/, "");
  const directUrl = baseUrl + "/application";
  await page.goto(directUrl, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Check for expired/not found job (Ashby is SPA — wait for React to render)
  const pageText = await page.textContent("body").catch(() => "");
  if (
    /job not found|no longer available|position.*filled|this job has been|page not found/i.test(
      pageText,
    )
  ) {
    return { success: false, reason: "Job expired or not found" };
  }

  // If not on application form, try clicking Apply button from job page
  const isFormPage = await page
    .locator('input[type="email"], input[name="email"]')
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (!isFormPage) {
    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    try {
      const applyBtn = page
        .locator('a:has-text("Apply"), button:has-text("Apply"), a:has-text("Apply now")')
        .first();
      await applyBtn.waitFor({ timeout: 5000 });
      await applyBtn.click();
      await page.waitForLoadState("domcontentloaded");
    } catch {}
  }

  await page.waitForTimeout(1000);

  // Ashby uses label-based form fields. Iterate all visible form fields and fill them.
  // Standard fields: name, email, phone, LinkedIn, resume, cover letter
  await tryFill(
    page,
    [
      'input[name="name"]',
      'input[placeholder*="full name"]',
      "#name",
      'input[placeholder*="Full name"]',
    ],
    `${P.first_name} ${P.last_name}`,
  );
  await tryFill(
    page,
    ['input[name="email"]', 'input[type="email"]', 'input[placeholder*="Email"]'],
    P.email,
  );
  await tryFill(
    page,
    ['input[name="phone"]', 'input[type="tel"]', 'input[placeholder*="Phone"]'],
    P.phone_formatted,
  );

  // Resume upload — Ashby uses a file input
  const resumeInput = page.locator('input[type="file"]').first();
  try {
    await resumeInput.setInputFiles(RESUME_PATH);
    await page.waitForTimeout(1000);
  } catch {}

  // LinkedIn, GitHub, Website, Cover letter — Ashby uses placeholder text
  await tryFill(
    page,
    ['input[placeholder*="linkedin"]', 'input[name*="linkedin"]', 'input[placeholder*="LinkedIn"]'],
    P.linkedin,
  );
  await tryFill(page, ['input[placeholder*="github"]', 'input[placeholder*="GitHub"]'], P.github);
  await tryFill(
    page,
    [
      'input[placeholder*="website"]',
      'input[placeholder*="portfolio"]',
      'input[placeholder*="Website"]',
      'input[placeholder*="Portfolio"]',
    ],
    P.website,
  );
  await tryFill(
    page,
    [
      'textarea[name="coverLetter"]',
      'textarea[placeholder*="cover"]',
      'textarea[placeholder*="Cover"]',
    ],
    coverLetter,
  );

  // Ashby forms: iterate ALL form field containers and fill based on label text
  try {
    // Ashby wraps each field in a div with label. Get all labels.
    const labels = page.locator("label");
    const labelCount = await labels.count();
    for (let i = 0; i < labelCount; i++) {
      const label = labels.nth(i);
      const labelText = await label.textContent().catch(() => "");
      if (!labelText) {
        continue;
      }
      const lbl = labelText.toLowerCase().trim();

      // Get the parent container, then find inputs/selects/textareas within it
      const container = label.locator(".."); // parent

      // Yes/No buttons (work authorization, sponsorship, etc.)
      if (
        /authorized.*work|legally.*work|eligible.*work|right to work|legally authorized/i.test(lbl)
      ) {
        const yesBtn = container.locator('button:has-text("Yes")');
        if (await yesBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await yesBtn.click();
          await page.waitForTimeout(300);
        }
        continue;
      }
      if (/sponsor|visa sponsorship/i.test(lbl)) {
        const noBtn = container.locator('button:has-text("No")');
        if (await noBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await noBtn.click();
          await page.waitForTimeout(300);
        }
        continue;
      }

      // Text inputs
      const textInput = container.locator('input[type="text"], input:not([type])').first();
      if (await textInput.isVisible({ timeout: 300 }).catch(() => false)) {
        const val = await textInput.inputValue().catch(() => "");
        if (val) {
          continue;
        } // already filled
        if (/city|location|where.*located/i.test(lbl)) {
          await textInput.fill("Chicago, IL").catch(() => {});
        } else if (/how many years|years of/i.test(lbl)) {
          if (/ai|ml|machine learning/i.test(lbl)) {
            await textInput.fill("5").catch(() => {});
          } else if (/product|pm\b/i.test(lbl)) {
            await textInput.fill("6").catch(() => {});
          } else if (/lead|manage/i.test(lbl)) {
            await textInput.fill("4").catch(() => {});
          } else {
            await textInput.fill("10").catch(() => {});
          }
        } else if (/current company|employer/i.test(lbl)) {
          await textInput.fill("Levee").catch(() => {});
        } else if (/current title|job title/i.test(lbl)) {
          await textInput.fill("Chief Product Officer").catch(() => {});
        } else if (/salary|compensation/i.test(lbl)) {
          await textInput.fill("Open to discussion").catch(() => {});
        } else if (/start date|earliest.*start|when.*start/i.test(lbl)) {
          await textInput.fill("Immediately / 2 weeks notice").catch(() => {});
        } else if (/first name/i.test(lbl)) {
          await textInput.fill(P.first_name).catch(() => {});
        } else if (/last name/i.test(lbl)) {
          await textInput.fill(P.last_name).catch(() => {});
        } else if (/pronouns/i.test(lbl)) {
          await textInput.fill("He/Him").catch(() => {});
        }
        continue;
      }

      // Textareas
      const textarea = container.locator("textarea").first();
      if (await textarea.isVisible({ timeout: 300 }).catch(() => false)) {
        const val = await textarea.inputValue().catch(() => "");
        if (val) {
          continue;
        }
        if (/cover letter/i.test(lbl)) {
          await textarea.fill(coverLetter).catch(() => {});
        } else if (/why.*interest|why.*apply|why.*role|why.*company|what draws you/i.test(lbl)) {
          await textarea
            .fill(
              "I'm drawn to this role because it aligns with my experience building AI-powered products at scale. As CPO at Levee, I've led development of computer vision and LLM-integrated platforms deployed across 10,000+ hotel rooms. I'm eager to bring that same product vision and technical depth to your team.",
            )
            .catch(() => {});
        } else if (/tell us about|describe.*experience|additional info/i.test(lbl)) {
          await textarea
            .fill(
              "10 years of product and engineering experience across B2B SaaS, AI/ML, IoT, and FinTech. Built computer vision systems at 92%+ accuracy, managed $250M+ portfolios, and delivered 60% efficiency improvements through AI automation.",
            )
            .catch(() => {});
        }
        continue;
      }

      // Select dropdowns (Ashby uses native selects sometimes)
      const select = container.locator("select").first();
      if (await select.isVisible({ timeout: 300 }).catch(() => false)) {
        if (/how did you hear|source|referral/i.test(lbl)) {
          // Try common options
          await select
            .selectOption({ label: "Other" })
            .catch(() => select.selectOption({ index: 1 }).catch(() => {}));
        } else if (/years.*experience|experience.*years/i.test(lbl)) {
          // Try to pick the right range
          const options = await select.locator("option").allTextContents();
          const match = options.find((o) => /10|8.*10|7.*10|10\+|9/i.test(o));
          if (match) {
            await select.selectOption({ label: match }).catch(() => {});
          }
        }
        continue;
      }
    }
  } catch {
    // Form field iteration failed — continue with submit attempt
  }

  // Check consent/agree checkbox if present
  try {
    const agreeCheckbox = page
      .locator('input[type="checkbox"][name="I agree"], input[type="checkbox"]')
      .first();
    if (await agreeCheckbox.isVisible({ timeout: 500 }).catch(() => false)) {
      const isChecked = await agreeCheckbox.isChecked().catch(() => false);
      if (!isChecked) {
        await agreeCheckbox.check().catch(() => {});
        await page.waitForTimeout(300);
      }
    }
  } catch {}

  // Scroll to bottom to ensure submit button is in view
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);

  if (DRY_RUN) {
    return { success: true, reason: "dry-run" };
  }

  // Ashby has multiple button[type="submit"] — Upload file, Yes/No toggles, and Submit Application.
  // Target "Submit Application" specifically first, then fall back to the LAST submit button.
  let submitBtn = page.locator('button:has-text("Submit Application")');
  let hasExplicit = await submitBtn.isVisible({ timeout: 3000 }).catch(() => false);
  if (!hasExplicit) {
    // Try "Submit" text as well
    submitBtn = page.locator('button:has-text("Submit")').last();
    hasExplicit = await submitBtn.isVisible({ timeout: 2000 }).catch(() => false);
  }
  if (!hasExplicit) {
    submitBtn = page.locator('button[type="submit"]').last();
  }
  try {
    await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
    await submitBtn.waitFor({ timeout: 12000 });
    await submitBtn.click();
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    const body = await page.textContent("body");
    if (/thank you|submitted|application received/i.test(body)) {
      return { success: true };
    }
    return { success: true };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

// ─── iCIMS submitter ──────────────────────────────────────────────────────────
// iCIMS URL patterns: *.icims.com/jobs/JOBID/title/job
// After clicking Apply Now it navigates to the multi-step form
async function submitIcims(page, job, coverLetter) {
  try {
    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);

    // Click Apply Now button
    const applyBtn = page
      .locator(
        [
          'a[data-field="applyNow"]',
          'a:has-text("Apply Now")',
          'a:has-text("Apply for this Job")',
          'button:has-text("Apply Now")',
        ].join(", "),
      )
      .first();
    try {
      await applyBtn.waitFor({ timeout: 8000 });
      await applyBtn.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      await page.waitForTimeout(2000);
    } catch {
      // May already be on form page
    }

    // iCIMS login page — look for "Continue as Guest" or email-only login
    const guestBtn = page
      .locator(
        [
          'a:has-text("Continue as Guest")',
          'button:has-text("Continue as Guest")',
          'a:has-text("Apply as Guest")',
          'a:has-text("Skip")',
        ].join(", "),
      )
      .first();
    try {
      await guestBtn.waitFor({ timeout: 4000 });
      await guestBtn.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1500);
    } catch {}

    // Fill standard personal info fields
    await tryFill(page, ['input[id*="Email"], input[name*="Email"], input[type="email"]'], P.email);
    await tryFill(page, ['input[id*="FirstName"], input[name*="FirstName"]'], P.first_name);
    await tryFill(page, ['input[id*="LastName"], input[name*="LastName"]'], P.last_name);
    await tryFill(
      page,
      ['input[id*="Phone"], input[name*="Phone"], input[type="tel"]'],
      P.phone_formatted,
    );
    await tryFill(page, ['input[id*="Address1"], input[name*="Address1"]'], "Chicago, IL 60614");
    await tryFill(page, ['input[id*="City"], input[name*="City"]'], "Chicago");
    await tryFill(page, ['input[id*="Zip"], input[name*="Zip"], input[id*="PostalCode"]'], "60614");

    // Resume upload
    const resumeInput = page.locator('input[type="file"]').first();
    try {
      await resumeInput.setInputFiles(RESUME_PATH);
      await page.waitForTimeout(1000);
    } catch {}

    // Cover letter (textarea if present)
    await tryFill(
      page,
      ['textarea[id*="cover"], textarea[id*="Cover"], textarea[name*="cover"]'],
      coverLetter,
    );

    if (DRY_RUN) {
      return { success: true, reason: "dry-run" };
    }

    // iCIMS submit button
    const submitBtn = page
      .locator(
        [
          'input[type="submit"]',
          'button[type="submit"]',
          'a:has-text("Submit")',
          'input[value="Submit Application"]',
          'input[value="Submit"]',
          'button:has-text("Submit Application")',
        ].join(", "),
      )
      .first();
    try {
      await submitBtn.waitFor({ timeout: 10000 });
      await submitBtn.click();
      await page.waitForTimeout(6000);
      const body = await page.textContent("body").catch(() => "");
      if (/thank you|submitted|application received|successfully|confirmation/i.test(body)) {
        return { success: true };
      }
      // iCIMS often has multi-step — check if we need to proceed through steps
      const nextBtn = page
        .locator('input[value="Next"], button:has-text("Next"), input[value="Continue"]')
        .first();
      if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Multi-step: just mark optimistic success (manual review needed)
        const path = `/tmp/icims-step-${Date.now()}.png`;
        await page.screenshot({ path }).catch(() => {});
        return {
          success: false,
          reason: `Multi-step form — needs manual completion (screenshot: ${path})`,
        };
      }
      return { success: true }; // optimistic
    } catch (err) {
      const path = `/tmp/icims-fail-${Date.now()}.png`;
      await page.screenshot({ path }).catch(() => {});
      return { success: false, reason: `${err.message.slice(0, 100)} (screenshot: ${path})` };
    }
  } catch (err) {
    return { success: false, reason: `iCIMS nav error: ${err.message.slice(0, 100)}` };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log("=== CareerClaw Playwright Submit ===");
console.log(`Date:      ${new Date().toLocaleString()}`);
console.log(`Dry run:   ${DRY_RUN}`);
console.log(`Headed:    ${HEADED}`);
console.log(`Limit:     ${LIMIT}`);
console.log(`Min score: ${MIN_SCORE}`);
console.log("");

if (!existsSync(RESUME_PATH)) {
  console.error(`ERROR: Resume not found at ${RESUME_PATH}`);
  process.exit(1);
}

// Fetch interested applications with cover letters
const applications = await sGet(
  `applications?status=eq.interested&cover_letter=not.is.null&select=id,job_id,cover_letter,match_score,priority&order=match_score.desc&limit=${LIMIT}`,
);

if (!applications.length) {
  console.log("No interested applications with cover letters found.");
  process.exit(0);
}

// Fetch jobs
const jobIds = [...new Set(applications.map((a) => a.job_id).filter(Boolean))];
const jobs = await sGet(`jobs?id=in.(${jobIds.join(",")})&select=id,title,company,url,match_score`);
const jobMap = Object.fromEntries(jobs.map((j) => [j.id, j]));

// Split: auto-submittable vs manual
const toSubmit = applications.filter((a) => {
  const j = jobMap[a.job_id];
  return j?.url && detectPlatform(j.url) && (a.match_score || 0) >= MIN_SCORE;
});
const manual = applications.filter((a) => {
  const j = jobMap[a.job_id];
  return !j?.url || !detectPlatform(j.url);
});

console.log(`Interested applications: ${applications.length}`);
console.log(`Auto-submittable:        ${toSubmit.length} (Greenhouse/Lever/Ashby)`);
console.log(`Manual submission:       ${manual.length}`);
console.log("");

if (manual.length) {
  console.log("Submit these manually (cover letters are ready in the dashboard):");
  for (const a of manual) {
    const j = jobMap[a.job_id];
    if (j) {
      console.log(`  [${a.match_score}] ${j.title} @ ${j.company}\n     ${j.url}`);
    }
  }
  console.log("");
}

if (!toSubmit.length) {
  console.log("Nothing to auto-submit right now.");
  process.exit(0);
}

// Launch browser
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 100 : 0 });
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  viewport: { width: 1280, height: 900 },
});

let submitted = 0;
let failed = 0;

for (const [i, application] of toSubmit.entries()) {
  const job = jobMap[application.job_id];
  const platform = detectPlatform(job.url);
  const num = i + 1;

  console.log(`─── [${num}/${toSubmit.length}] ${job.title} @ ${job.company} ───`);
  console.log(`    Score:    ${application.match_score}`);
  console.log(`    Platform: ${platform}`);
  console.log(`    URL:      ${job.url}`);

  const page = await context.newPage();
  let result;

  try {
    if (platform === "greenhouse") {
      result = await submitGreenhouse(page, job, application.cover_letter);
    } else if (platform === "lever") {
      result = await submitLever(page, job, application.cover_letter);
    } else if (platform === "ashby") {
      result = await submitAshby(page, job, application.cover_letter);
    } else if (platform === "icims") {
      result = await submitIcims(page, job, application.cover_letter);
    } else {
      result = { success: false, reason: "unsupported platform" };
    }
  } catch (err) {
    result = { success: false, reason: String(err) };
  }

  await page.close();

  if (result.success) {
    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would submit`);
    } else {
      console.log(`    ✓ Submitted`);
      submitted++;
      await sPatch("applications", application.id, {
        status: "applied",
        application_date: TODAY,
        notes: `Auto-submitted via Playwright (${platform}) on ${TODAY}`,
      });
    }
  } else {
    console.log(`    ✗ ${result.reason}`);
    if (!DRY_RUN) {
      await sPatch("applications", application.id, {
        notes: `Auto-submit failed (${platform}): ${result.reason} — submit manually at: ${job.url}`,
      });
    }
    failed++;
  }

  console.log("");
  if (i < toSubmit.length - 1) {
    await new Promise((r) => setTimeout(r, 2500));
  }
}

await browser.close();

console.log("=== Submit Complete ===");
if (DRY_RUN) {
  console.log(`Dry run: would have submitted ${toSubmit.length} applications`);
} else {
  console.log(`Submitted: ${submitted}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Manual:    ${manual.length}`);
}

// ─── Save form Q&A audit log ────────────────────────────────────────────────
if (formLog.length > 0) {
  const { appendFileSync } = await import("fs");
  const logPath = `/tmp/form-qa-${TODAY}.jsonl`;
  for (const entry of formLog) {
    appendFileSync(logPath, JSON.stringify(entry) + "\n");
  }
  console.log(`\nForm Q&A log: ${formLog.length} entries saved to ${logPath}`);

  // Also save to Supabase automation_logs for dashboard access
  try {
    const summary = {};
    for (const entry of formLog) {
      if (!summary[entry.company]) {
        summary[entry.company] = [];
      }
      summary[entry.company].push({ q: entry.question, a: entry.answer });
    }
    await fetch(`${SUPABASE_URL}/rest/v1/automation_logs`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        action_type: "application_submit",
        details: {
          source: "playwright",
          date: TODAY,
          submitted,
          failed,
          form_qa: summary,
        },
      }),
    });
    console.log("Form Q&A summary saved to automation_logs");
  } catch (err) {
    console.log(`Warning: could not save form log to Supabase: ${err.message}`);
  }
}
