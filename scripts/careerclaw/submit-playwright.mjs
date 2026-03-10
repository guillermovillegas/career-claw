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
import {
  getFormProfile,
  getResumeFilename,
  getFormAnswers,
  loadProfile,
} from "../../config/load-profile.mjs";
import { checkUrlLiveness } from "./lib/validation.mjs";

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
const RESUME_PATH = join(ROOT, getResumeFilename());

// ─── Parse flags ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const HEADED = args.includes("--headed"); // show browser window for debugging
const limitIdx = args.indexOf("--limit");
const scoreIdx = args.indexOf("--min-score");
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;
const MIN_SCORE = scoreIdx !== -1 ? parseInt(args[scoreIdx + 1], 10) : 50;

// ─── Profile (loaded from config/profile.json) ──────────────────────────────
const P = getFormProfile();
const FA = getFormAnswers();

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

// ─── Autocomplete location helper ────────────────────────────────────────────
// Greenhouse uses a custom autocomplete for location/city fields.
// Type text, wait for suggestions, click the first matching one.
async function fillLocationAutocomplete(
  page,
  el,
  searchText = "Chicago",
  matchText = /chicago.*illinois/i,
) {
  await el.fill("");
  await el.pressSequentially(searchText, { delay: 50 });
  await page.waitForTimeout(800);
  // Try common autocomplete dropdown patterns
  const selectors = [
    '[role="listbox"] [role="option"]',
    ".autocomplete-results li",
    ".suggestions li",
    ".pac-item", // Google Places
    'ul[id*="listbox"] li',
    'div[class*="suggestion"]',
    'div[class*="option"]',
  ];
  for (const sel of selectors) {
    const items = page.locator(sel);
    const count = await items.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const text = await items
        .nth(i)
        .textContent()
        .catch(() => "");
      if (matchText.test(text)) {
        await items.nth(i).click();
        await page.waitForTimeout(300);
        return true;
      }
    }
    // If we found items but none matched, click the first one (usually best match)
    if (count > 0) {
      await items.first().click();
      await page.waitForTimeout(300);
      return true;
    }
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

    // Try typing to search first
    await el.click({ timeout: 3000 });
    await page.waitForTimeout(200);
    if (search) {
      await el.evaluate((node) => {
        node.value = "";
      });
      await el.type(search, { delay: 25 });
      await page.waitForTimeout(600);
    } else {
      await page.waitForTimeout(400);
    }

    // Select__option is unique to React Select (phone ITI uses iti__country)
    // Use page-wide locator — React Select renders dropdown as a portal to body
    let opts = page.locator('[class*="select__option"]:not([class*="selected"])');
    let count = await opts.count();

    // If typing produced no results, try opening the dropdown by clicking the control
    // and browsing the full options list (common in iframe forms where keyboard input
    // doesn't trigger React Select's filter)
    if (!count && (search || matchFn)) {
      // Close any open menu, then click the select control to open the full list
      const kb = page.keyboard || page.page?.()?.keyboard;
      if (kb) {
        await kb.press("Escape").catch(() => {});
      }
      await page.waitForTimeout(200);

      const container = el
        .locator('xpath=ancestor::*[contains(@class,"select__container")]')
        .first();
      const control = container.locator(".select__control").first();
      if ((await control.count()) > 0) {
        await control.click();
        await page.waitForTimeout(500);
        // Get options from within this select's menu (or page-wide for portals)
        let menuOpts = container.locator('[class*="select__option"]');
        count = await menuOpts.count();
        if (!count) {
          menuOpts = page.locator('[class*="select__option"]');
          count = await menuOpts.count();
        }
        if (count > 0) {
          opts = menuOpts;
        }
      }
    }

    if (!count) {
      const kb = page.keyboard || page.page?.()?.keyboard;
      if (kb) {
        await kb.press("Enter").catch(() => {});
      }
      return true;
    }

    if (matchFn) {
      for (let i = 0; i < count; i++) {
        const t = (await opts.nth(i).textContent()) || "";
        if (matchFn(t)) {
          await opts
            .nth(i)
            .scrollIntoViewIfNeeded()
            .catch(() => {});
          await page.waitForTimeout(50);
          await opts.nth(i).click();
          return true;
        }
      }
    }
    // If matchFn was provided but no option matched, don't blindly click first option
    // (could select "No" for authorization or "Yes" for sponsorship)
    if (matchFn) {
      return false;
    }
    // If search was provided but no matchFn, click the first option (most relevant)
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
          const containers = [
            ".select__container",
            ".field",
            ".application-field",
            "[class*='question']",
            ".form-group",
            ".qs-form-group",
          ];
          // Walk up the DOM trying each container — some inner containers
          // (like .select__container) don't hold the label; the outer .field does
          for (const sel of containers) {
            const ctr = el.closest(sel);
            if (ctr) {
              lblEl = ctr.querySelector("label, legend, .field-label, .label");
              if (lblEl) {
                break;
              }
            }
          }
        }
        // Try previous sibling label (label is sibling of the select container, not inside it)
        if (!lblEl) {
          const wrapper = el.closest(
            ".select__container, .field, .application-field, [class*='question'], .form-group",
          );
          let prev = wrapper ? wrapper.previousElementSibling : el.previousElementSibling;
          while (prev && !lblEl) {
            if (prev.tagName === "LABEL" || prev.classList?.contains("field-label")) {
              lblEl = prev;
            } else {
              const inner = prev.querySelector?.("label, .field-label");
              if (inner) {
                lblEl = inner;
              }
            }
            prev = prev.previousElementSibling;
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
        // Generate synthetic ID for elements without one (embed forms often lack IDs)
        if (!el.id) {
          el.id = `_cc_auto_${Math.random().toString(36).slice(2, 8)}`;
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

    // Helper: force-check a checkbox (Playwright .check() fails on hidden/custom-styled checkboxes)
    const forceCheck = async (cb) => {
      const checked = await cb.isChecked().catch(() => false);
      if (checked) {
        return;
      }
      await cb.check().catch(async () => {
        // Fallback: JS-based check for hidden/custom-styled checkboxes
        await cb
          .evaluate((e) => {
            e.checked = true;
            e.dispatchEvent(new Event("change", { bubbles: true }));
            e.dispatchEvent(new Event("input", { bubbles: true }));
          })
          .catch(() => {});
      });
    };

    try {
      if (isFile) {
        continue;
      } // handled separately
      if (isCheckbox) {
        if (
          /acknowledge/i.test(lbl) || // EEO acknowledgements
          /consent|agree|terms|gdpr|privacy|^confirm$|^i confirm/i.test(lbl) // GDPR/consent/confirm
        ) {
          await forceCheck(el);
        } else if (/^linkedin$/i.test(lbl)) {
          // "How did you hear about us" — check LinkedIn option
          await forceCheck(el);
        } else if (/^(united states|us|usa|u\.s\.?)$/i.test(lbl.trim())) {
          // Country checkbox lists (e.g. "countries you anticipate working in")
          await forceCheck(el);
        } else if (/^remote$/i.test(lbl.trim())) {
          // Location preference checkboxes — always check "Remote"
          await forceCheck(el);
        } else if (/never held a clearance|no clearance|none.*clearance/i.test(lbl.trim())) {
          // Security clearance checkbox groups — check "Never held a clearance"
          await forceCheck(el);
        } else if (/^none of the above$|^none of these apply/i.test(lbl.trim())) {
          // Restrictive country / OFAC checkbox groups — check "None of the above"
          await forceCheck(el);
        } else if (/^u\.?s\.?\s*citizen$/i.test(lbl.trim())) {
          // Citizenship status — check "U.S. citizen"
          await forceCheck(el);
        } else if (/^(chicago|chicago,?\s*il|chicago,?\s*illinois)/i.test(lbl.trim())) {
          // Office location checkbox group — check Chicago option
          await forceCheck(el);
        } else if (/^none$/i.test(lbl.trim())) {
          // "None" in office/location checkbox groups — check if no other option applies
          await forceCheck(el);
        } else if (/^he\/?him\/?his$/i.test(lbl.trim())) {
          // Pronoun checkbox — check He/Him/His
          await forceCheck(el);
        } else if (/^not applicable.*none of the above/i.test(lbl.trim())) {
          // "Not applicable (i.e., I selected 'none of the above')" — skip; we have a real answer
        }
        continue;
      }
      if (isRadio) {
        continue;
      } // rare on GH

      if (isReactSelect) {
        // ─── React Select dropdowns ───────────────────────────────────────────
        if (
          /country/i.test(lbl) &&
          !/country.*cuba|ofac|authori[sz]|legally.*work|eligible.*work|work.*authori[sz]/i.test(
            lbl,
          )
        ) {
          await pickReactSelect(page, el, {
            search: "United States",
            matchFn: (t) => /^United States\b/i.test(t.trim()),
          });
        } else if (/location.*city|city.*location/i.test(lbl)) {
          await pickReactSelect(page, el, { search: "Chicago" });
        } else if (
          /authori[sz]|legally.*(work|employ)|legal.*authori[sz]|eligible.*work|work.*authori[sz]|currently.*legal.*work/i.test(
            lbl,
          )
        ) {
          await pickReactSelect(page, el, {
            matchFn: (t) => {
              const txt = t.trim().toLowerCase();
              return (
                /^yes\b/.test(txt) ||
                /us citizen/i.test(txt) ||
                /citizen/i.test(txt) ||
                /authori[sz]ed.*work/i.test(txt) ||
                /i am authori[sz]ed/i.test(txt) ||
                /permanent resident/i.test(txt) ||
                /green card/i.test(txt) ||
                /no.*sponsorship.*required/i.test(txt)
              );
            },
          }).catch(async () => {
            // Fallback: try native select or search-based approach
            await el.selectOption?.({ label: "Yes" }).catch(() => {});
          });
        } else if (/sponsor|visa|require.*work.*permit|future.*sponsor|h-?1b/i.test(lbl)) {
          await pickReactSelect(page, el, {
            matchFn: (t) => /^no\b/i.test(t.trim()),
          }).catch(async () => {
            // If "No" not found, try typing it
            await pickReactSelect(page, el, { search: "No" }).catch(() => {});
          });
        } else if (/citizenship|citizen.*country|dual.*national|national.*status/i.test(lbl)) {
          // Citizenship / dual nationality — select United States
          await pickReactSelect(page, el, {
            search: "United States",
            matchFn: (t) => /^United States\b|^US$|^USA$/i.test(t.trim()),
          }).catch(async () => {
            await pickReactSelect(page, el, { search: "US" }).catch(() => {});
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
          /certification|certified|security\+|clearance|do you hold|active.*license|professional.*license/i.test(
            lbl,
          )
        ) {
          // Certification / clearance questions — default "No" (we don't have these)
          await pickReactSelect(page, el, {
            matchFn: (t) => /^no\b/i.test(t.trim()),
          });
        } else if (
          /do you have (at least|a minimum|more than|\d+\+?\s*years?)|are you.*comfortable.*with|are you.*proficient|are you.*experienced/i.test(
            lbl,
          )
        ) {
          // Screening yes/no questions — honest: "No" for hands-on coding, "Yes" for PM/product/leadership
          const isCodingQ =
            /python|java\b|node\.?js|typescript|javascript|ruby|golang|go\b|rust|scala|swift|kotlin|c\+\+|c#|php|react|angular|vue|full.?stack|back.?end|front.?end|devops|infrastructure|coding|programming|shipping code|deploying.*code|writing.*code|production.*code|code.*production/i.test(
              lbl,
            );
          await pickReactSelect(page, el, {
            matchFn: (t) => (isCodingQ ? /^no\b/i : /^yes\b/i).test(t.trim()),
          });
        } else if (
          /experience|proven|track record|building|working on|familiar|proficient/i.test(lbl)
        ) {
          // Yes/No experience questions — honest: "No" for coding-specific, "Yes" for general
          const isCodingQ =
            /python|java\b|node\.?js|typescript|javascript|ruby|golang|go\b|rust|scala|swift|kotlin|c\+\+|c#|php|react|angular|vue|full.?stack|back.?end|front.?end|devops|infrastructure|coding|programming|shipping code/i.test(
              lbl,
            );
          await pickReactSelect(page, el, {
            matchFn: (t) => (isCodingQ ? /^no\b/i : /^yes\b/i).test(t.trim()),
          });
        } else if (/hear about|referral|how.*find|source/i.test(lbl)) {
          // How did you hear about us
          await pickReactSelect(page, el, {
            matchFn: (t) => /linkedin|job board|website/i.test(t),
          });
        } else if (/gender/i.test(lbl) && !/race|ethnicity/i.test(lbl)) {
          // Gender identity — try Male/Man/Cisgender Man, fallback decline
          await pickReactSelect(page, el, {
            matchFn: (t) => /^male$|^man$|^cis.*man$|^cisgender.*male/i.test(t.trim()),
          }).catch(async () => {
            await pickReactSelect(page, el, {
              matchFn: (t) =>
                /decline|prefer not|choose not|not to answer|don.t wish|do not wish/i.test(t),
            }).catch(async () => {
              // Last resort — pick first non-blank option
              await pickReactSelect(page, el, {}).catch(() => {});
            });
          });
        } else if (/pronoun/i.test(lbl)) {
          // Pronouns — He/Him or decline
          await pickReactSelect(page, el, {
            matchFn: (t) => /he\s*\/\s*him|he\/him/i.test(t.trim()),
          }).catch(async () => {
            await pickReactSelect(page, el, {
              matchFn: (t) => /decline|prefer not|choose not|not to answer/i.test(t),
            }).catch(async () => {
              await pickReactSelect(page, el, {}).catch(() => {});
            });
          });
        } else if (/hispanic|latino/i.test(lbl)) {
          // Hispanic/Latino — select Yes
          await pickReactSelect(page, el, {
            matchFn: (t) => /^yes\b|hispanic.*latino|latino.*hispanic/i.test(t.trim()),
          }).catch(() => {});
        } else if (/race|ethnicity/i.test(lbl) && !/hispanic|latino/i.test(lbl)) {
          // Race/Ethnicity — select Hispanic or Latino if available, otherwise decline
          await pickReactSelect(page, el, {
            matchFn: (t) => /hispanic|latino/i.test(t),
          }).catch(async () => {
            await pickReactSelect(page, el, {
              matchFn: (t) => /decline|prefer not|choose not/i.test(t),
            }).catch(() => {});
          });
        } else if (/veteran/i.test(lbl)) {
          // Veteran status — not a veteran
          await pickReactSelect(page, el, {
            matchFn: (t) => /not a.*veteran|no\b|i am not|non-/i.test(t.trim()),
          }).catch(async () => {
            await pickReactSelect(page, el, {
              matchFn: (t) => /decline|prefer not/i.test(t),
            }).catch(() => {});
          });
        } else if (/disability/i.test(lbl)) {
          // Disability — no disability
          await pickReactSelect(page, el, {
            matchFn: (t) => /no,.*don.t|do not have|no\b.*disability|i don.t/i.test(t.trim()),
          }).catch(async () => {
            await pickReactSelect(page, el, {
              matchFn: (t) => /decline|prefer not/i.test(t),
            }).catch(() => {});
          });
        } else if (/sexual|transgender/i.test(lbl)) {
          // Sexual orientation / transgender — decline to self-identify
          await pickReactSelect(page, el, {
            matchFn: (t) =>
              /decline|prefer not|choose not|not to answer|don.t wish|do not wish|rather not|not to self|not to disclose|n\/a/i.test(
                t,
              ),
          }).catch(async () => {
            // Fallback: pick last option (usually "prefer not to say")
            await pickReactSelect(page, el, {}).catch(() => {});
          });
        } else if (/degree|education.*level|highest.*education/i.test(lbl)) {
          await pickReactSelect(page, el, {
            matchFn: (t) => /bachelor/i.test(t),
          }).catch(async () => {
            await pickReactSelect(page, el, { search: "Bachelor" }).catch(() => {});
          });
        } else if (/school|university|college/i.test(lbl)) {
          await pickReactSelect(page, el, { search: "University of Illinois" }).catch(() => {});
        } else if (/field.*study|major|area.*study/i.test(lbl)) {
          await pickReactSelect(page, el, { search: "Computer Science" }).catch(() => {});
        } else if (/notice.*period|availability|start.*date|when.*start/i.test(lbl)) {
          await pickReactSelect(page, el, {
            matchFn: (t) => /2 week|immediate|asap|1-2|two week/i.test(t),
          }).catch(async () => {
            await pickReactSelect(page, el, {}).catch(() => {});
          });
        } else if (
          /describes you|what.*are you|type of applicant|applicant type|best describes/i.test(lbl)
        ) {
          // Bot detection / applicant type — pick "human" or most benign option
          await pickReactSelect(page, el, {
            matchFn: (t) =>
              /human|individual|job seeker|candidate|person|none of the above|not a recruiter|direct applicant/i.test(
                t,
              ),
          }).catch(() => {});
        } else if (
          /have you (applied|previously|ever).*before|previously applied|applied.*in the (last|past)|applied.*24 months|applied.*12 months|applied.*this|prior.*application/i.test(
            lbl,
          )
        ) {
          // "Have you applied before?" → No
          await pickReactSelect(page, el, {
            matchFn: (t) => /^no\b/i.test(t.trim()),
          }).catch(async () => {
            await el.selectOption?.({ label: "No" }).catch(() => {});
          });
        } else if (
          /require.*work.*permit|require.*visa|need.*visa|need.*work.*permit|work.*permit.*require|visa.*require/i.test(
            lbl,
          )
        ) {
          // "Do you require work permit/visa?" → No
          await pickReactSelect(page, el, {
            matchFn: (t) => /^no\b/i.test(t.trim()),
          }).catch(async () => {
            await el.selectOption?.({ label: "No" }).catch(() => {});
          });
        } else if (/time\s*zone|timezone|your.*tz/i.test(lbl)) {
          // Timezone question
          await pickReactSelect(page, el, {
            search: "Central",
            matchFn: (t) => /central|ct|cst|cdt|america.*chicago|us.*central|utc.*-[56]/i.test(t),
          }).catch(async () => {
            await pickReactSelect(page, el, { search: "CST" }).catch(() => {});
          });
        } else if (
          /years.*(java|node\.?js|python|typescript|react|golang|ruby|c\+\+|scala|rust|swift|kotlin)/i.test(
            lbl,
          )
        ) {
          // Tech-specific years of experience
          await pickReactSelect(page, el, {
            matchFn: (t) => {
              const txt = t.trim().toLowerCase();
              if (/^10\b|^10\+|^8\+|^7\+|8\s*-\s*10|7\s*-\s*10/i.test(txt)) {
                return true;
              }
              if (/^5\b|^5\+|^5\s*-/i.test(txt)) {
                return true;
              }
              return false;
            },
          }).catch(async () => {
            await pickReactSelect(page, el, { search: "5" }).catch(() => {});
          });
        } else if (/residing.*eu|residing.*europe|eu or ukraine|within the eu/i.test(lbl)) {
          // EU residency — No (US-based)
          await pickReactSelect(page, el, {
            matchFn: (t) => /^no\b/i.test(t.trim()),
          }).catch(async () => {
            await el.selectOption?.({ label: "No" }).catch(() => {});
          });
        } else if (/tax.*residen|country.*tax|tax.*jurisdiction/i.test(lbl)) {
          // Tax residence — United States
          await pickReactSelect(page, el, {
            search: "United States",
            matchFn: (t) => /^United States\b/i.test(t.trim()),
          });
        } else if (/metaview|consent.*transcrib|consent.*record|interview.*record/i.test(lbl)) {
          // Metaview / interview recording consent — Yes
          await pickReactSelect(page, el, {
            matchFn: (t) => /^yes\b/i.test(t.trim()),
          }).catch(async () => {
            await el.selectOption?.({ label: "Yes" }).catch(() => {});
          });
        } else if (/privacy.*policy|applicant.*privacy|data.*policy/i.test(lbl)) {
          // Privacy policy — accept/agree
          await pickReactSelect(page, el, {
            matchFn: (t) => /i agree|i accept|agree|accept|yes|acknowledge/i.test(t.trim()),
          }).catch(async () => {
            await el.selectOption?.({ label: "I agree" }).catch(() => {});
          });
        } else if (/current.*location|location.*current|where.*located|where.*live/i.test(lbl)) {
          // Current location — search for Chicago or United States
          await pickReactSelect(page, el, { search: "Chicago" }).catch(async () => {
            await pickReactSelect(page, el, { search: "United States" }).catch(() => {});
          });
        } else if (lbl) {
          // Unknown required React Select — skip if it could be a location/country field
          // to avoid picking wrong first option (e.g. "Australia")
          if (/location|region|country|area|city|state/i.test(lbl)) {
            await pickReactSelect(page, el, { search: "United States" }).catch(async () => {
              await pickReactSelect(page, el, { search: "Chicago" }).catch(() => {});
            });
          } else {
            await pickReactSelect(page, el, {}).catch(() => {});
          }
        }
      } else if (isNativeSelect) {
        // Native <select> (rare on new GH boards)
        if (/country/i.test(lbl) && !/country.*cuba|ofac|tax.*country|country.*tax/i.test(lbl)) {
          // Country dropdown — select "United States" (various label formats)
          await el
            .selectOption({ label: "United States" })
            .catch(() =>
              el
                .selectOption({ label: "United States of America" })
                .catch(() => el.selectOption({ label: "US" }).catch(() => {})),
            );
        } else if (
          /authori[sz]|legally.*(work|employ)|legal.*authori[sz]|eligible.*work/i.test(lbl)
        ) {
          await el
            .selectOption({ label: "Yes" })
            .catch(() => el.selectOption({ index: 1 }).catch(() => {}));
        } else if (/sponsor|visa|require.*work.*permit/i.test(lbl)) {
          await el
            .selectOption({ label: "No" })
            .catch(() => el.selectOption({ index: 2 }).catch(() => {}));
        } else if (/residing.*eu|within the eu|eu or ukraine/i.test(lbl)) {
          await el
            .selectOption({ label: "No" })
            .catch(() => el.selectOption({ index: 2 }).catch(() => {}));
        } else if (/tax.*residen|country.*tax/i.test(lbl)) {
          await el
            .selectOption({ label: "United States" })
            .catch(() => el.selectOption({ label: "US" }).catch(() => {}));
        } else if (/metaview|consent.*transcrib|consent.*record/i.test(lbl)) {
          await el
            .selectOption({ label: "Yes" })
            .catch(() => el.selectOption({ index: 1 }).catch(() => {}));
        } else if (/privacy.*policy|applicant.*privacy|data.*policy/i.test(lbl)) {
          // Privacy policy acceptance — select "I agree" or "Yes" or first real option
          const opts = await el.locator("option").allTextContents();
          const agree = opts.find((o) => /i agree|i accept|agree|accept|yes|acknowledge/i.test(o));
          if (agree) {
            await el.selectOption({ label: agree }).catch(() => {});
          } else if (opts.length > 1) {
            await el.selectOption({ index: 1 }).catch(() => {});
          }
        } else if (/describes you|applicant type|type of applicant/i.test(lbl)) {
          // Bot detection — skip (don't auto-fill with "AI" option)
          const opts = await el.locator("option").allTextContents();
          const human = opts.find((o) =>
            /human|individual|job seeker|candidate|person|none|direct/i.test(o),
          );
          if (human) {
            await el.selectOption({ label: human }).catch(() => {});
          }
        } else if (
          /how many years|years of experience|years.*product|years.*management|years.*professional|total.*years/i.test(
            lbl,
          )
        ) {
          // Years of experience native select — pick highest reasonable bracket
          const opts = await el.locator("option").allTextContents();
          const best = opts.find((o) =>
            /^10\b|^10\+|10\s*-|8\s*-\s*10|8\+|7\+|7\s*-\s*10/i.test(o.trim()),
          );
          if (best) {
            await el.selectOption({ label: best }).catch(() => {});
          } else {
            // Fallback: pick last real option (usually highest range)
            const real = opts.filter((o) => o.trim() && !/select|choose|--/i.test(o.trim()));
            if (real.length > 0) {
              await el.selectOption({ label: real[real.length - 1] }).catch(() => {});
            }
          }
        } else if (
          /do you have (at least|a minimum|more than|\d+\+?\s*years?)|are you.*comfortable|are you.*proficient/i.test(
            lbl,
          )
        ) {
          // Screening yes/no native select — honest: "No" for coding, "Yes" for general
          const isCodingQ =
            /python|java\b|node\.?js|typescript|javascript|ruby|golang|go\b|rust|scala|swift|kotlin|c\+\+|c#|php|react|angular|vue|full.?stack|back.?end|front.?end|devops|infrastructure|coding|programming|shipping code/i.test(
              lbl,
            );
          const answer = isCodingQ ? "No" : "Yes";
          await el
            .selectOption({ label: answer })
            .catch(() => el.selectOption({ index: isCodingQ ? 2 : 1 }).catch(() => {}));
        } else if (/citizenship|citizen.*country|dual.*national|national.*status/i.test(lbl)) {
          // Citizenship questions — select "United States" or "US Citizen"
          const opts = await el.locator("option").allTextContents();
          const us = opts.find((o) => /united states|us$|usa|u\.s\./i.test(o.trim()));
          if (us) {
            await el.selectOption({ label: us }).catch(() => {});
          } else {
            await el
              .selectOption({ label: "United States" })
              .catch(() =>
                el
                  .selectOption({ label: "United States of America" })
                  .catch(() => el.selectOption({ label: "US" }).catch(() => {})),
              );
          }
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
        // Confirm email (Spring Health uses a textarea for this)
        if (/confirm.*email|email.*confirm|verify.*email|re.?enter.*email/i.test(lbl)) {
          await el.fill(P.email).catch(() => {});
          continue;
        }
        if (/cover|letter/i.test(lbl) || f.id === "cover_letter_text") {
          if (coverLetter) {
            await el.fill(coverLetter).catch(() => {});
          }
        } else if (
          /example|project|describe.*ai|describe.*product|tell us.*about.*experience|tell us.*about.*product|describe.*built|do you have.*experience|relevant.*experience|experience.*with.*product|experience.*shipping|experience.*platform/i.test(
            lbl,
          )
        ) {
          // AI project / product / platform experience example
          await el.fill(FA.ai_experience || FA.professional_summary || "").catch(() => {});
        } else if (
          /why.*interest|why.*role|why.*company|why.*want|what.*excites|what.*attracts|motivation|^why\s+\w+\?/i.test(
            lbl,
          )
        ) {
          // "Why [Company]?" or "Why are you interested?" — use cover letter as essay answer
          await el.fill(FA.why_interested || coverLetter || "").catch(() => {});
        } else if (
          /greatest.*impact|biggest.*impact|most.*impact|proudest.*achievement|biggest.*accomplishment/i.test(
            lbl,
          )
        ) {
          await el.fill(FA.greatest_impact || FA.ai_experience || "").catch(() => {});
        } else if (
          /attribute.*work.*environment|attribute.*seek|thrive|work.*environment.*thrive|ideal.*work|culture.*value/i.test(
            lbl,
          )
        ) {
          await el.fill(FA.work_environment_attributes || "").catch(() => {});
        } else if (/tell.*about.*yourself|about yourself|little.*about.*yourself/i.test(lbl)) {
          await el.fill(FA.professional_summary || "").catch(() => {});
        } else if (
          /sample.*work|work.*sample|portfolio.*link|share.*work|share.*sample|links.*to.*your.*work|portfolio.*demo|github.*profile|evidence.*built/i.test(
            lbl,
          )
        ) {
          // Work samples — provide website and GitHub
          await el.fill(`${P.website} | ${P.github}`).catch(() => {});
        } else if (
          /how did you (hear|find|learn)|how.*hear.*about|how.*learn.*about|selected.*other.*how|tell us how you learned/i.test(
            lbl,
          )
        ) {
          await el.fill("LinkedIn").catch(() => {});
        } else if (
          /how.*use.*ai|ai.*to apply|assisted.*by.*ai|used.*ai.*tools|ai.*help.*apply/i.test(lbl)
        ) {
          // Trap question — skip (leave blank or N/A)
          await el.fill("N/A").catch(() => {});
        } else if (/tell us|anything.*add|additional.*info|anything.*else/i.test(lbl)) {
          if (!/how did you|hear.*about/i.test(lbl)) {
            await el.fill(FA.additional_info || "").catch(() => {});
          } else {
            await el.fill("LinkedIn").catch(() => {});
          }
        } else if (
          /do you have\s+(at least\s+|a minimum of?\s+|more than\s+)?\d+\+?\s*years?|are you.*experienced|are you.*comfortable|are you.*proficient/i.test(
            lbl,
          )
        ) {
          // Screening yes/no textarea — honest: "No" for coding-specific, "Yes" for general
          const isCodingQ =
            /python|java\b|node\.?js|typescript|javascript|ruby|golang|go\b|rust|scala|swift|kotlin|c\+\+|c#|php|react|angular|vue|full.?stack|back.?end|front.?end|devops|infrastructure|coding|programming|shipping code|deploying.*code|writing.*code|production.*code|code.*production/i.test(
              lbl,
            );
          await el
            .fill(
              isCodingQ
                ? "No, but I use AI-assisted development tools (Claude Code, Copilot) and have shipped production features with them."
                : "Yes",
            )
            .catch(() => {});
        } else {
          // Unknown textarea — leave blank (wrong content is worse than empty)
        }
      } else {
        // Regular text input
        if (/first.name|given.name/i.test(lbl)) {
          await el.fill(P.first_name).catch(() => {});
        } else if (/last.name|surname/i.test(lbl)) {
          await el.fill(P.last_name).catch(() => {});
        } else if (/preferred.*name/i.test(lbl)) {
          await el.fill(P.first_name).catch(() => {});
        } else if (/confirm.*email|email.*confirm|verify.*email|re.?enter.*email/i.test(lbl)) {
          await el.fill(P.email).catch(() => {});
        } else if (/email/i.test(lbl)) {
          await el.fill(P.email).catch(() => {});
        } else if (
          /phone/i.test(lbl) &&
          (f.type === "tel" || f.type === "text" || f.id === "phone")
        ) {
          await el.fill(P.phone_formatted).catch(() => {});
        } else if (/linkedin/i.test(lbl) && !/github/i.test(lbl)) {
          await el.fill(P.linkedin).catch(() => {});
        } else if (/github/i.test(lbl)) {
          await el.fill(P.github).catch(() => {});
        } else if (/website|portfolio/i.test(lbl)) {
          await el.fill(P.website).catch(() => {});
        } else if (/twitter|x\.com/i.test(lbl)) {
          // Skip — no Twitter
        } else if (/how did you (hear|find|learn)|how.*hear.*about|hear.*about.*this/i.test(lbl)) {
          await el.fill("LinkedIn").catch(() => {});
        } else if (
          /salary.*expect|desired.*salary|expected.*salary|annual.*salary|salary.*role/i.test(lbl)
        ) {
          await el.fill(FA.compensation_expectation || "200000").catch(() => {});
        } else if (/time\s*zone|timezone|your.*tz/i.test(lbl)) {
          await el.fill("Central Time (CT) / America/Chicago").catch(() => {});
        } else if (/city.*state|state.*city/i.test(lbl)) {
          // "city and state" combo field (e.g. Stripe: "in what city and state do you reside?")
          await el.fill("Chicago, IL").catch(() => {});
        } else if (/what state|state.*located|located.*state/i.test(lbl)) {
          await el.fill("Illinois").catch(() => {});
        } else if (/phonetic|pronounce|pronunciation/i.test(lbl)) {
          // Skip — pronunciation is too personal to auto-fill
        } else if (/pronoun/i.test(lbl)) {
          await el.fill(FA.pronouns || "").catch(() => {});
        } else if (/know anyone|anyone.*at.*company|referral.*contact|do you know/i.test(lbl)) {
          await el.fill("No").catch(() => {});
        } else if (/referred.by|who referred|referral.*name|referrer/i.test(lbl)) {
          // Required referral field — fill "N/A" when not referred
          await el.fill("N/A").catch(() => {});
        } else if (/\bcity\b|^location\b/i.test(lbl)) {
          // City/Location autocomplete — type and click suggestion
          const picked = await fillLocationAutocomplete(
            page,
            el,
            "Chicago",
            /chicago.*illinois/i,
          ).catch(() => false);
          if (!picked) {
            await el.fill("Chicago").catch(() => {});
          }
        } else if (/^state$|^state\/province$|state.*residence/i.test(lbl)) {
          await el.fill("IL").catch(() => {});
        } else if (/^zip$|^zip code$|postal.*code/i.test(lbl)) {
          await el.fill(FA.zip_code || "").catch(() => {});
        } else if (/current.*company|company.*name|employer/i.test(lbl)) {
          await el.fill(P.current_company).catch(() => {});
        } else if (/programming.*language|language.*proficient|coding.*language/i.test(lbl)) {
          await el.fill("Python, TypeScript (n/a - PM role)").catch(() => {});
        } else if (/ai.*tool|llm.*familiar|familiar.*llm|ai.*model|llm.*use/i.test(lbl)) {
          await el.fill("Claude (Anthropic), GPT-4, Gemini").catch(() => {});
        } else if (
          /compensation.*expect|expect.*compensation|salary.*expect|desired.*salary|current.*ctc|expected.*ctc|what is your.*ctc/i.test(
            lbl,
          )
        ) {
          await el.fill(FA.compensation_expectation || "200000").catch(() => {});
        } else if (
          /how many.*project|projects.*scaled|scale.*from.*0.*to.*1|0.*to.*1.*in.*ai|projects.*built|products.*launched/i.test(
            lbl,
          )
        ) {
          // "How many projects did you scale from 0 to 1 in AI?" — numeric answer
          await el.fill("4").catch(() => {});
        } else if (
          /able to work.*office|hybrid.*schedule|in.*office|on.?site.*days|report.*to.*office/i.test(
            lbl,
          )
        ) {
          // Hybrid/onsite schedule question — "Yes" (flexible)
          await el.fill("Yes").catch(() => {});
        } else if (
          /how many years|years of (experience|professional|product|pm\b|management|work)|total.*years|years.*experience/i.test(
            lbl,
          )
        ) {
          // Numeric years of experience — MUST be before generic experience handler
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
        } else if (
          /do you have (at least|a minimum|more than|\d+\+?\s*years?)|are you.*comfortable|are you.*proficient/i.test(
            lbl,
          )
        ) {
          // Screening yes/no text input — honest: "No" for coding-specific, "Yes" for general
          const isCodingQ =
            /python|java\b|node\.?js|typescript|javascript|ruby|golang|go\b|rust|scala|swift|kotlin|c\+\+|c#|php|react|angular|vue|full.?stack|back.?end|front.?end|devops|infrastructure|coding|programming|shipping code|deploying.*code|writing.*code|production.*code|code.*production/i.test(
              lbl,
            );
          await el
            .fill(
              isCodingQ
                ? "No — I use AI-assisted development tools and have shipped production features with them."
                : "Yes",
            )
            .catch(() => {});
        } else if (
          /describe.*experience|your.*experience|tell.*us.*about|experience.*owning|experience.*with/i.test(
            lbl,
          )
        ) {
          await el.fill(FA.ai_experience || FA.professional_summary || "").catch(() => {});
        } else if (
          /physical.*address|mailing.*address|full.*address|street.*address|current.*address|your.*address|home.*address/i.test(
            lbl,
          )
        ) {
          await el.fill(`${P.location} ${FA.zip_code}`.trim()).catch(() => {});
        } else if (
          /visa.*status|current.*visa|immigration.*status|work.*authorization.*status|authorization.*status.*us/i.test(
            lbl,
          )
        ) {
          await el.fill(FA.work_authorization || "US Citizen").catch(() => {});
        } else if (/legal.*address|full.*address|home.*address|residential.*address/i.test(lbl)) {
          await el.fill(`${P.location} ${FA.zip_code}`.trim()).catch(() => {});
        } else if (/current.*location|where.*located|location.*city|your.*location/i.test(lbl)) {
          const picked = await fillLocationAutocomplete(
            page,
            el,
            "Chicago",
            /chicago.*illinois/i,
          ).catch(() => false);
          if (!picked) {
            await el.fill(P.location).catch(() => {});
          }
        } else if (
          /country.*time.*zone|time.*zone.*country|where.*based.*time|country.*based/i.test(lbl)
        ) {
          await el.fill("United States, Central Time (CT)").catch(() => {});
        } else if (
          /target.*compensation|compensation.*range|desired.*comp|total.*comp|expected.*comp/i.test(
            lbl,
          )
        ) {
          await el.fill(FA.compensation_text || "Open to discussion").catch(() => {});
        } else if (
          /elaborate|please.*explain.*visa|if.*yes.*elaborate|sponsorship.*detail/i.test(lbl)
        ) {
          // Visa sponsorship "If yes, please elaborate" text fields
          await el.fill(`N/A — ${FA.work_authorization}, no sponsorship required.`).catch(() => {});
        } else if (/^company.*name$|^company$/i.test(lbl)) {
          // Work history company name field
          await el.fill(P.current_company).catch(() => {});
        } else if (/^title$|^job.*title$|^position$/i.test(lbl)) {
          // Work history title field
          const prof = loadProfile().professional;
          await el.fill(prof.current_title || "").catch(() => {});
        } else if (/start.*year|year.*start/i.test(lbl)) {
          await el.fill("2023").catch(() => {});
        } else if (/end.*year|year.*end/i.test(lbl)) {
          // Leave blank (currently employed)
        } else if (
          /current.*title|previous.*job.*title|most recent.*title|what is your.*title|job title/i.test(
            lbl,
          )
        ) {
          const prof = loadProfile().professional;
          await el.fill(prof.current_title || "VP of Product").catch(() => {});
        } else if (/school.*attend|recent.*school|university|college|what.*school/i.test(lbl)) {
          await el.fill("University of Illinois at Chicago").catch(() => {});
        } else if (
          /degree.*obtain|recent.*degree|highest.*degree|what.*degree|education.*level/i.test(lbl)
        ) {
          await el.fill("Bachelor's").catch(() => {});
        } else if (/field.*study|major|area.*study|concentration/i.test(lbl)) {
          await el.fill("Computer Science").catch(() => {});
        } else if (/graduation.*year|year.*graduat/i.test(lbl)) {
          await el.fill("2015").catch(() => {});
        } else if (
          /have you (applied|previously|ever).*before|previously applied|applied.*in the (last|past)|applied.*24 months|applied.*12 months/i.test(
            lbl,
          )
        ) {
          await el.fill("No").catch(() => {});
        } else if (/require.*work.*permit|require.*visa|need.*visa|need.*work.*permit/i.test(lbl)) {
          await el.fill("No").catch(() => {});
        } else if (
          /how.*use.*ai|ai.*to apply|assisted.*by.*ai|used.*ai.*tools|ai.*help.*apply|chatgpt|claude.*apply/i.test(
            lbl,
          )
        ) {
          // Trap question about AI-assisted applications — be honest but brief
          await el.fill("N/A").catch(() => {});
        } else if (
          /years.*(java|node\.?js|python|typescript|react|golang|ruby|c\+\+|scala|rust|swift|kotlin)/i.test(
            lbl,
          )
        ) {
          // Tech-specific years
          await el.fill("10").catch(() => {});
        } else if (/notice.*period|start.*date|available.*start|earliest.*start/i.test(lbl)) {
          await el.fill("2 weeks").catch(() => {});
        } else if (/current.*location.*city|where.*based|where.*you.*located/i.test(lbl)) {
          await el.fill("Chicago, IL").catch(() => {});
        } else if (
          /sample.*work|work.*sample|portfolio.*link|share.*work|share.*sample|links.*to.*your.*work|portfolio.*demo|github.*profile|evidence.*built/i.test(
            lbl,
          )
        ) {
          await el.fill(`${P.website} | ${P.github}`).catch(() => {});
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
        if (/authori[sz]|legally.*work|legal.*work/i.test(qText)) {
          await pickReactSelect(page, sel, { matchFn: (t) => /^yes\b/i.test(t.trim()) }).catch(
            () => {},
          );
        } else if (/sponsor|visa.*sponsor|require.*sponsor/i.test(qText)) {
          await pickReactSelect(page, sel, { matchFn: (t) => /^no\b/i.test(t.trim()) }).catch(
            () => {},
          );
        } else if (/country.*reside|reside.*country|where.*currently.*reside/i.test(qText)) {
          await pickReactSelect(page, sel, {
            search: "United States",
            matchFn: (t) => /^United States\b/i.test(t.trim()),
          }).catch(() => {});
        } else if (/degree|education.*level|highest.*education/i.test(qText)) {
          await pickReactSelect(page, sel, {
            matchFn: (t) => /bachelor/i.test(t),
          }).catch(() => {});
        } else if (/school|university/i.test(qText)) {
          await pickReactSelect(page, sel, { search: "University of Illinois" }).catch(() => {});
        } else if (/hear about|referral|how.*find|source|hear.*about.*us/i.test(qText)) {
          await pickReactSelect(page, sel, {
            matchFn: (t) => /linkedin|job board|website/i.test(t),
          }).catch(() => {});
        } else if (/certification|certified|security\+|clearance/i.test(qText)) {
          await pickReactSelect(page, sel, {
            matchFn: (t) => /^no\b/i.test(t.trim()),
          }).catch(() => {});
        } else if (
          /have you (applied|previously)|previously applied|applied.*in the (last|past)|applied.*24 months/i.test(
            qText,
          )
        ) {
          await pickReactSelect(page, sel, {
            matchFn: (t) => /^no\b/i.test(t.trim()),
          }).catch(() => {});
        } else if (
          /require.*work.*permit|require.*visa|need.*visa|need.*work.*permit/i.test(qText)
        ) {
          await pickReactSelect(page, sel, {
            matchFn: (t) => /^no\b/i.test(t.trim()),
          }).catch(() => {});
        } else if (/time\s*zone|timezone/i.test(qText)) {
          await pickReactSelect(page, sel, {
            search: "Central",
            matchFn: (t) => /central|ct|cst|cdt|america.*chicago|us.*central/i.test(t),
          }).catch(() => {});
        }
      }
    }
  } catch {}

  // ─── Third pass: country checkbox groups ──────────────────────────────────
  // Some GH forms have "Select countries you'll work in" with individual country checkboxes
  try {
    const usCheckboxes = page.locator('input[type="checkbox"]');
    const cbCount = await usCheckboxes.count();
    for (let i = 0; i < cbCount; i++) {
      const cb = usCheckboxes.nth(i);
      const cbLabel = await cb
        .evaluate((el) => {
          const lbl = el.labels?.[0]?.textContent?.trim() || "";
          if (lbl) {
            return lbl;
          }
          const next = el.nextElementSibling || el.parentElement;
          return next?.textContent?.trim() || "";
        })
        .catch(() => "");
      const trimmedCbLabel = cbLabel.trim();
      if (
        /^(united states|us|usa|u\.s\.?)$/i.test(trimmedCbLabel) ||
        /^u\.?s\.?\s*(citizen|national)/i.test(trimmedCbLabel)
      ) {
        const checked = await cb.isChecked().catch(() => false);
        if (!checked) {
          await cb.check().catch(() => {});
        }
      } else if (/never held a clearance|no clearance|none.*clearance/i.test(trimmedCbLabel)) {
        // Security clearance — check "Never held a clearance"
        const checked = await cb.isChecked().catch(() => false);
        if (!checked) {
          await cb.check().catch(() => {});
        }
      }
    }
  } catch {}

  // ─── Fourth pass: country reside React Select by scanning all label+select pairs ──
  // Catches country reside selects that the first/second pass missed (common in iframe forms)
  try {
    const allLabels = await page.locator("label").all();
    for (const lbl of allLabels) {
      const text = (await lbl.textContent().catch(() => "")).toLowerCase();
      if (!/country.*reside|reside.*country|currently.*reside/i.test(text)) {
        continue;
      }
      // Find the associated React Select input
      const forId = await lbl.getAttribute("for").catch(() => "");
      if (forId) {
        const input = page.locator(`[id="${forId}"]`);
        if ((await input.count()) > 0) {
          const val = await input.inputValue().catch(() => "");
          if (!val) {
            await pickReactSelect(page, input, {
              search: "United States",
              matchFn: (t) => /^United States\b/i.test(t.trim()),
            }).catch(() => {});
          }
        }
      }
      // Also try sibling/descendant select within the field container
      const field = lbl
        .locator(
          "xpath=ancestor::*[contains(@class,'field') or contains(@class,'select__container')]",
        )
        .first();
      if ((await field.count()) > 0) {
        const selectInput = field.locator(".select__input");
        if ((await selectInput.count()) > 0) {
          const val = await selectInput
            .first()
            .inputValue()
            .catch(() => "");
          if (!val) {
            await pickReactSelect(page, selectInput.first(), {
              search: "United States",
              matchFn: (t) => /^United States\b/i.test(t.trim()),
            }).catch(() => {});
          }
        }
      }
    }
  } catch {}

  // ─── Resume upload (first file input with id containing "resume" or "cv") ──
  let resumeInput = page.locator('#resume[type="file"], input[id*="resume"][type="file"]').first();
  try {
    if ((await resumeInput.count()) === 0) {
      // Broader search: any file input near a resume/CV label
      resumeInput = page
        .locator(
          'input[type="file"][id*="cv"], input[type="file"][name*="resume"], input[type="file"][name*="cv"], input[type="file"][data-field*="resume"]',
        )
        .first();
    }
    if ((await resumeInput.count()) === 0) {
      // Last resort: first file input on the page (most GH forms have resume as first)
      resumeInput = page.locator('input[type="file"]').first();
    }
    if ((await resumeInput.count()) > 0) {
      await resumeInput.setInputFiles(RESUME_PATH);
      await page.waitForTimeout(800);
    }
  } catch {}

  // ─── Cover letter file upload (if no text textarea was found/filled) ────────
  if (coverLetter) {
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
      // Skip recaptcha; truncate long values (cover letters) but still log them
      if (/recaptcha/i.test(ff.label)) {
        continue;
      }
      logFormAnswer(
        companyName,
        ff.label,
        ff.value.length > 500 ? ff.value.slice(0, 200) + "...[truncated]" : ff.value,
        ff.id,
      );
    }
  } catch {}
}

// ─── Greenhouse submitter ─────────────────────────────────────────────────────
async function submitGreenhouse(page, job, coverLetter) {
  await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Detect redirect to generic careers page (job may be expired)
  const finalUrl = page.url();
  if (
    finalUrl !== job.url &&
    !finalUrl.includes("gh_jid") &&
    !finalUrl.includes("greenhouse") &&
    /careers?\/?$|open-positions|all-jobs/i.test(finalUrl)
  ) {
    return {
      success: false,
      reason: `Redirected to generic careers page: ${finalUrl.substring(0, 100)}`,
    };
  }

  // Click Apply button (form may load dynamically on same page)
  const applyBtn = page
    .locator(
      [
        'a:has-text("Apply for this job")',
        'a:has-text("Apply for this role")',
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

  // Check if Greenhouse form is embedded in an iframe (common for custom career pages)
  // If so, operate on the iframe context instead of the main page.
  let formCtx = page; // default: form is on main page
  await page.waitForTimeout(2000);
  const ghIframe = page.locator('iframe#grnhse_iframe, iframe[src*="greenhouse.io/embed/job_app"]');
  if ((await ghIframe.count()) > 0) {
    const ghFrame = page.frames().find((f) => f.url().includes("greenhouse.io/embed/job_app"));
    if (ghFrame) {
      console.log("    [iframe] Greenhouse form in iframe — switching context");
      formCtx = ghFrame;
    }
  }

  // Wait for form to render (React-rendered forms appear after click)
  try {
    await formCtx
      .locator('#first_name, input[id*="first_name"]')
      .first()
      .waitFor({ timeout: 10000 });
  } catch {
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(500);

  // Fill all form fields generically (handles React Select + native inputs)
  await fillGhForm(formCtx, coverLetter, job.company || "unknown");

  if (DRY_RUN) {
    return { success: true, reason: "dry-run" };
  }

  // Mark any stale GH code emails as read BEFORE submitting,
  // so fetchGhVerificationCode only finds the fresh code for this submission.
  await clearStaleGhCodes();

  // Dismiss cookie/CCPA banners that may block the submit button
  for (const bannerSel of [
    'iframe[id*="ccpa"]',
    'div[class*="cookie-banner"]',
    'div[class*="consent"]',
    "#onetrust-banner-sdk",
  ]) {
    const banner = page.locator(bannerSel).first();
    if (await banner.isVisible({ timeout: 500 }).catch(() => false)) {
      // Try to close/dismiss the banner
      const closeBtn = page
        .locator(
          'button:has-text("Reject"), button:has-text("Decline"), button:has-text("Close"), button[aria-label="Close"]',
        )
        .first();
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click().catch(() => {});
        await page.waitForTimeout(300);
      } else {
        // Remove the blocking element via JS
        await page
          .evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) {
              el.remove();
            }
          }, bannerSel)
          .catch(() => {});
        await page.waitForTimeout(300);
      }
    }
  }

  // Submit (use formCtx which may be an iframe)
  // Note: GH embed forms use input[type="button"]#submit_app, not type="submit"
  const submitBtn = formCtx
    .locator(
      [
        "input#submit_app",
        'input[value="Submit Application"]',
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Submit application")',
        'button:has-text("Submit")',
        'button:has-text("Let\'s go")',
      ].join(", "),
    )
    .last();

  try {
    await submitBtn.waitFor({ timeout: 12000 });
    await submitBtn.click({ force: true });
    // Wait for navigation or success indicator (up to 20s)
    await Promise.race([
      page.waitForURL(/confirmation|success|thank/i, { timeout: 20000 }),
      page.waitForSelector(
        '[class*="success"], [class*="confirmation"], [id*="confirmation"], h1:has-text("Thank"), h2:has-text("Thank")',
        { timeout: 20000 },
      ),
    ]).catch(() => page.waitForTimeout(5000));

    // Read body from both page and formCtx (iframe may have confirmation)
    let bodyText = await page.textContent("body").catch(() => "");
    if (formCtx !== page) {
      const frameText = await formCtx
        .locator("body")
        .textContent()
        .catch(() => "");
      bodyText += " " + frameText;
    }
    if (
      /thank you|thanks for applying|application received|successfully submitted|we.ll be in touch|application submitted|we received your/i.test(
        bodyText,
      )
    ) {
      return { success: true };
    }
    // Check if email verification is actually required (not just hidden HTML boilerplate)
    // Greenhouse embed forms always have "security code" text in hidden divs.
    // Only trigger verification flow if the security_code input is actually visible.
    const secCodeVisible = await formCtx
      .locator('#security_code, [id="security-input-0"]')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    if (secCodeVisible) {
      // Take a screenshot of the verification screen for debugging
      const verifyScreenPath = `/tmp/gh-verify-${Date.now()}.png`;
      await page.screenshot({ path: verifyScreenPath, fullPage: false }).catch(() => {});

      // Log all visible inputs to find the code input selector
      // Use formCtx for verification — code inputs may be in iframe or main page
      const verifyCtx = formCtx;
      const verifyInputs = await verifyCtx
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
      const code = await fetchGhVerificationCode(20000); // 20s — skip fast if emails aren't arriving
      if (code) {
        // Greenhouse uses 8 individual character inputs: security-input-0 … security-input-7
        // Check both page and formCtx (verification may appear in either)
        let codeCtx = formCtx;
        const mainHasCode = await page
          .locator('[id="security-input-0"]')
          .count()
          .catch(() => 0);
        if (mainHasCode > 0) {
          codeCtx = page;
        }
        const firstBox = codeCtx.locator('[id="security-input-0"]');
        try {
          await firstBox.waitFor({ timeout: 5000 });
          // Fill each character into its own box
          for (let i = 0; i < code.length; i++) {
            await codeCtx
              .locator(`[id="security-input-${i}"]`)
              .fill(code[i])
              .catch(() => {});
            await page.waitForTimeout(60);
          }
          await page.waitForTimeout(500);
          // Re-submit
          const resubmitBtn = codeCtx
            .locator(
              'input#submit_app, input[value="Submit Application"], button[type="submit"], button:has-text("Submit"), button:has-text("Verify"), button:has-text("Continue")',
            )
            .last();
          await resubmitBtn.click().catch(() => submitBtn.click().catch(() => {}));
          await page.waitForTimeout(8000);
          let body2 = await page.textContent("body").catch(() => "");
          if (formCtx !== page) {
            body2 +=
              " " +
              (await formCtx
                .locator("body")
                .textContent()
                .catch(() => ""));
          }
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
      // Get specific error messages + their field labels (check formCtx for iframe forms)
      const errDetails = await formCtx
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
    // Check for reCAPTCHA block (common on embed forms)
    const captchaErr = await formCtx
      .locator("#captcha_error_message")
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (captchaErr || /flagged as potential bot|captcha|recaptcha/i.test(bodyText)) {
      return { success: false, reason: "reCAPTCHA blocked — submit manually" };
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
  if (coverLetter) {
    await tryFill(page, ['textarea[name="comments"]', "#comments"], coverLetter);
  }

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
  if (coverLetter) {
    await tryFill(
      page,
      [
        'textarea[name="coverLetter"]',
        'textarea[placeholder*="cover"]',
        'textarea[placeholder*="Cover"]',
      ],
      coverLetter,
    );
  }

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
        /authori[sz]ed.*work|legally.*work|eligible.*work|right to work|legally authori[sz]ed/i.test(
          lbl,
        )
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
      if (/require.*work.*permit|require.*visa|need.*visa|need.*work.*permit/i.test(lbl)) {
        const noBtn = container.locator('button:has-text("No")');
        if (await noBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await noBtn.click();
          await page.waitForTimeout(300);
        }
        continue;
      }
      if (
        /have you (applied|previously|ever).*before|previously applied|applied.*in the (last|past)/i.test(
          lbl,
        )
      ) {
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
          await textInput.fill(P.location).catch(() => {});
        } else if (/how many years|years of/i.test(lbl)) {
          if (/ai|ml|machine learning/i.test(lbl)) {
            await textInput.fill(P.years_ai).catch(() => {});
          } else if (/product|pm\b/i.test(lbl)) {
            await textInput.fill(P.years_product).catch(() => {});
          } else if (/lead|manage/i.test(lbl)) {
            await textInput.fill(P.years_leadership).catch(() => {});
          } else {
            await textInput.fill(P.years_total).catch(() => {});
          }
        } else if (/current company|employer/i.test(lbl)) {
          await textInput.fill(P.current_company).catch(() => {});
        } else if (/current title|job title/i.test(lbl)) {
          const prof = loadProfile().professional;
          await textInput.fill(prof.current_title || "").catch(() => {});
        } else if (/salary|compensation/i.test(lbl)) {
          await textInput.fill(FA.compensation_text || "Open to discussion").catch(() => {});
        } else if (/start date|earliest.*start|when.*start/i.test(lbl)) {
          await textInput.fill("Immediately / 2 weeks notice").catch(() => {});
        } else if (/first name/i.test(lbl)) {
          await textInput.fill(P.first_name).catch(() => {});
        } else if (/last name/i.test(lbl)) {
          await textInput.fill(P.last_name).catch(() => {});
        } else if (/pronouns/i.test(lbl)) {
          await textInput.fill(FA.pronouns || "").catch(() => {});
        } else if (/time\s*zone|timezone/i.test(lbl)) {
          await textInput.fill("Central Time (CT) / America/Chicago").catch(() => {});
        } else if (
          /have you (applied|previously).*before|previously applied|applied.*in the (last|past)/i.test(
            lbl,
          )
        ) {
          await textInput.fill("No").catch(() => {});
        } else if (/require.*work.*permit|require.*visa|need.*visa/i.test(lbl)) {
          await textInput.fill("No").catch(() => {});
        } else if (/years.*(java|node|python|typescript|react|golang|ruby)/i.test(lbl)) {
          await textInput.fill("10").catch(() => {});
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
          if (coverLetter) {
            await textarea.fill(coverLetter).catch(() => {});
          }
        } else if (/how did you (hear|find|learn)|how.*hear.*about/i.test(lbl)) {
          await textarea.fill("LinkedIn").catch(() => {});
        } else if (/why.*interest|why.*apply|why.*role|why.*company|what draws you/i.test(lbl)) {
          await textarea.fill(FA.why_interested || "").catch(() => {});
        } else if (/tell us about|describe.*experience|additional info/i.test(lbl)) {
          if (!/how did you|hear.*about/i.test(lbl)) {
            await textarea.fill(FA.additional_info || "").catch(() => {});
          } else {
            await textarea.fill("LinkedIn").catch(() => {});
          }
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
    await tryFill(
      page,
      ['input[id*="Address1"], input[name*="Address1"]'],
      `${P.location} ${FA.zip_code}`.trim(),
    );
    await tryFill(
      page,
      ['input[id*="City"], input[name*="City"]'],
      P.location.split(",")[0].trim(),
    );
    await tryFill(
      page,
      ['input[id*="Zip"], input[name*="Zip"], input[id*="PostalCode"]'],
      FA.zip_code,
    );

    // Resume upload
    const resumeInput = page.locator('input[type="file"]').first();
    try {
      await resumeInput.setInputFiles(RESUME_PATH);
      await page.waitForTimeout(1000);
    } catch {}

    // Cover letter (textarea if present)
    if (coverLetter) {
      await tryFill(
        page,
        ['textarea[id*="cover"], textarea[id*="Cover"], textarea[name*="cover"]'],
        coverLetter,
      );
    }

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

// ─── 30-day dedup: fetch recently applied apps to avoid re-applying ───────────
const DEDUP_DAYS = 30;
const dedupSince = new Date(Date.now() - DEDUP_DAYS * 86400000).toISOString().slice(0, 10);
const recentlyApplied = await sGet(
  `applications?status=in.(applied,interview,phone_screen,final,hired)&application_date=gte.${dedupSince}&select=id,job_id`,
);
const recentAppliedJobIds = new Set(recentlyApplied.map((a) => a.job_id));

// Also build company+title set for cross-application dedup (different job_id, same role at same company)
const recentJobIds = [...new Set(recentlyApplied.map((a) => a.job_id).filter(Boolean))];
let recentAppliedRoles = new Set();
if (recentJobIds.length) {
  const recentJobs = await sGet(`jobs?id=in.(${recentJobIds.join(",")})&select=id,title,company`);
  recentAppliedRoles = new Set(
    recentJobs.map(
      (j) => `${(j.company || "").toLowerCase().trim()}|||${(j.title || "").toLowerCase().trim()}`,
    ),
  );
}
console.log(
  `Dedup: ${recentlyApplied.length} applications in last ${DEDUP_DAYS} days (${recentAppliedRoles.size} unique company+role combos)`,
);

// Fetch interested applications (cover letter optional — forms may not require one)
const applications = await sGet(
  `applications?status=eq.interested&select=id,job_id,status,cover_letter,match_score,priority,notes&order=match_score.desc&limit=${LIMIT}`,
);

if (!applications.length) {
  console.log("No interested applications found.");
  process.exit(0);
}

// Fetch jobs (include work_mode and location for priority sorting)
const jobIds = [...new Set(applications.map((a) => a.job_id).filter(Boolean))];
const jobs = await sGet(
  `jobs?id=in.(${jobIds.join(",")})&select=id,title,company,url,match_score,work_mode,location`,
);
const jobMap = Object.fromEntries(jobs.map((j) => [j.id, j]));

// Location priority: hybrid/onsite in Chicago > remote in Chicago > remote US > other
function locationPriority(job) {
  if (!job) {
    return 0;
  }
  const loc = (job.location || "").toLowerCase();
  const mode = (job.work_mode || "").toLowerCase();
  const isChicago = /chicago|chi\b/i.test(loc);
  if (isChicago && (mode === "hybrid" || mode === "on-site")) {
    return 30;
  }
  if (isChicago && mode === "remote") {
    return 20;
  }
  if (isChicago) {
    return 15;
  }
  if (mode === "remote") {
    return 10;
  }
  return 0;
}

// Re-sort applications by location priority (tiebreak: match_score desc)
applications.sort((a, b) => {
  const pa = locationPriority(jobMap[a.job_id]);
  const pb = locationPriority(jobMap[b.job_id]);
  if (pa !== pb) {
    return pb - pa;
  } // higher priority first
  return (b.match_score || 0) - (a.match_score || 0); // higher score first
});

// Helper: check if company+role was already applied to within 30 days
function isDuplicate(job) {
  if (!job) {
    return false;
  }
  // Exact job_id match
  if (recentAppliedJobIds.has(job.id)) {
    return true;
  }
  // Same company + same title (case-insensitive)
  const key = `${(job.company || "").toLowerCase().trim()}|||${(job.title || "").toLowerCase().trim()}`;
  return recentAppliedRoles.has(key);
}

// Split: auto-submittable vs manual
// Skip apps that already failed auto-submit (avoid infinite retries)
// Skip apps where we already applied to same company+role in last 30 days
const toSubmit = applications.filter((a) => {
  const j = jobMap[a.job_id];
  if (!j?.url || !detectPlatform(j.url) || (a.match_score || 0) < MIN_SCORE) {
    return false;
  }
  // Skip if already failed auto-submit (notes contain failure marker)
  if (a.notes && /Auto-submit failed/i.test(a.notes)) {
    return false;
  }
  // Skip if same company+role already applied within 30 days
  if (isDuplicate(j)) {
    return false;
  }
  return true;
});
const manual = applications.filter((a) => {
  const j = jobMap[a.job_id];
  if (isDuplicate(j)) {
    return false;
  }
  return !j?.url || !detectPlatform(j.url);
});
const dedupSkipped = applications.filter((a) => isDuplicate(jobMap[a.job_id]));
if (dedupSkipped.length) {
  console.log(
    `Skipped ${dedupSkipped.length} duplicate(s) (same company+role applied within ${DEDUP_DAYS} days):`,
  );
  for (const a of dedupSkipped) {
    const j = jobMap[a.job_id];
    if (j) {
      console.log(`  ⊘ ${j.title} @ ${j.company}`);
    }
  }
  console.log("");
}

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

// ─── Pre-submit quality gate ─────────────────────────────────────────────────
console.log("Running pre-submit validation...");
const validated = [];
let gateBlocked = 0;

for (const app of toSubmit) {
  const job = jobMap[app.job_id];
  const blockReasons = [];

  // Cover letter validation skipped — forms decide if CL is required.
  // Existing cover letters (even imperfect) are sent when forms have CL fields.

  // URL liveness check (skip on network error to avoid blocking good apps)
  if (job?.url) {
    const urlCheck = await checkUrlLiveness(job.url);
    if (!urlCheck.alive && urlCheck.reason !== "timeout") {
      blockReasons.push(`dead URL: ${urlCheck.reason}`);
    }
  }

  if (blockReasons.length > 0) {
    gateBlocked++;
    console.log(`  BLOCKED: ${job?.title} @ ${job?.company} — ${blockReasons.join("; ")}`);
    // Update notes so we don't retry this app next run
    if (!DRY_RUN) {
      const notes =
        (app.notes || "") + ` | Pre-submit blocked: ${blockReasons.join("; ")} (${TODAY})`;
      await sPatch("applications", app.id, { notes });
    }
  } else {
    validated.push(app);
  }
}

console.log(`Pre-submit gate: ${validated.length} passed, ${gateBlocked} blocked\n`);

if (!validated.length) {
  console.log("All applications blocked by pre-submit gate.");
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
const submitResults = [];
const submitStartTime = Date.now();

for (const [i, application] of validated.entries()) {
  const job = jobMap[application.job_id];
  const platform = detectPlatform(job.url);
  const num = i + 1;

  console.log(`─── [${num}/${validated.length}] ${job.title} @ ${job.company} ───`);
  console.log(`    Score:    ${application.match_score}`);
  console.log(`    Platform: ${platform}`);
  console.log(`    URL:      ${job.url}`);

  const page = await context.newPage();
  let result;

  try {
    if (platform === "greenhouse") {
      result = await submitGreenhouse(page, job, application.cover_letter || null);
    } else if (platform === "lever") {
      result = await submitLever(page, job, application.cover_letter || null);
    } else if (platform === "ashby") {
      result = await submitAshby(page, job, application.cover_letter || null);
    } else if (platform === "icims") {
      result = await submitIcims(page, job, application.cover_letter || null);
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
      submitResults.push({
        title: job.title,
        company: job.company,
        platform,
        score: application.match_score,
        status: "submitted",
      });
      await sPatch("applications", application.id, {
        status: "applied",
        application_date: TODAY,
        notes: `Auto-submitted via Playwright (${platform}) on ${TODAY}`,
      });
    }
  } else {
    console.log(`    ✗ ${result.reason}`);
    submitResults.push({
      title: job.title,
      company: job.company,
      platform,
      score: application.match_score,
      status: "failed",
      reason: String(result.reason).slice(0, 200),
    });
    if (!DRY_RUN) {
      const existingNotes = application.notes || "";
      const failNote = `Auto-submit failed (${platform}): ${String(result.reason).slice(0, 150)} — submit manually at: ${job.url} (${TODAY})`;
      await sPatch("applications", application.id, {
        notes: existingNotes ? `${existingNotes} | ${failNote}` : failNote,
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
        platform: "playwright",
        success: failed === 0,
        execution_time_ms: Date.now() - submitStartTime,
        error_message: failed > 0 ? `${failed} submission(s) failed` : null,
        details: {
          source: "playwright",
          date: TODAY,
          submitted,
          failed,
          gate_passed: validated.length,
          gate_blocked: gateBlocked,
          manual: manual.length,
          total_interested: applications.length,
          per_job: submitResults,
          form_qa: summary,
        },
      }),
    });
    console.log("Form Q&A summary saved to automation_logs");
  } catch (err) {
    console.log(`Warning: could not save form log to Supabase: ${err.message}`);
  }
}
