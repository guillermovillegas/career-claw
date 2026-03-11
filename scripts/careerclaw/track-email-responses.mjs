#!/usr/bin/env node
/**
 * track-email-responses.mjs — Scan Gmail IMAP for job application responses.
 * Classifies emails (rejection, interview, assessment, offer, generic),
 * matches to applications by sender domain, and updates status.
 *
 * Usage:
 *   node scripts/careerclaw/track-email-responses.mjs [--dry-run] [--since YYYY-MM-DD] [--limit N]
 */

import { readFileSync } from "fs";
import http from "http";
import https from "https";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ImapFlow } from "imapflow";
import { isValidStatusTransition } from "./lib/validation.mjs";

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
const GMAIL_USER = envVars.GMAIL_USER || process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = envVars.GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: JOBCLAW_SUPABASE_URL and JOBCLAW_SUPABASE_KEY must be set");
  process.exit(1);
}
if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error("ERROR: GMAIL_USER and GMAIL_APP_PASSWORD must be set");
  process.exit(1);
}

// ─── Parse args ──────────────────────────────────────────────────────────────
let DRY_RUN = false;
let SINCE = new Date(Date.now() - 24 * 60 * 60 * 1000); // default: last 24h
let EMAIL_LIMIT = 500;

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--dry-run") {
    DRY_RUN = true;
  }
  if (process.argv[i] === "--since") {
    SINCE = new Date(process.argv[++i]);
  }
  if (process.argv[i] === "--limit") {
    EMAIL_LIMIT = parseInt(process.argv[++i]);
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

/** Paginated fetch — PostgREST caps at 1000 rows per request */
async function sbGetAll(basePath) {
  const PAGE_SIZE = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    const sep = basePath.includes("?") ? "&" : "?";
    const page = await sbGet(`${basePath}${sep}limit=${PAGE_SIZE}&offset=${offset}`);
    if (!Array.isArray(page) || page.length === 0) {
      break;
    }
    all = all.concat(page);
    if (page.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }
  return all;
}

function sbPost(path, data) {
  return request(SUPABASE_URL + path, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(data),
  });
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

// ─── Email Classification ────────────────────────────────────────────────────

const REJECTION_PATTERNS = [
  /we('ve| have) decided to (move|go) (forward )?with (other|another)/i,
  /not (moving|proceeding) forward/i,
  /position has been filled/i,
  /we('re| are) (unable|not able) to offer/i,
  /unfortunately.*not.*selected/i,
  /after careful (consideration|review)/i,
  /we will not be (moving|proceeding)/i,
  /decided not to (proceed|advance|continue)/i,
  /regret to inform/i,
  /not the right fit/i,
  /will not be advancing/i,
  /your application.*unsuccessful/i,
  /we (chose|selected) (a |an )?(other|another|different) candidate/i,
  /important information about your application/i,
  /update (regarding|on|about) your application/i,
  /not (be )?mov(e|ing) forward with your/i,
  /will not be pursuing/i,
  /won't be (moving|proceeding|advancing)/i,
  /no longer (being )?consider/i,
  /not .{0,20}right match/i,
  /decided to (go|move) in (a )?different direction/i,
  /pursue other candidates/i,
  /not .{0,20}(progress|continue|advance) (your|with)/i,
  /role has been (closed|filled|cancelled)/i,
  /we('ve| have) (decided|chosen) to .{0,20}other/i,
  /at this time.*not/i,
];

const INTERVIEW_PATTERNS = [
  /schedule (a|an|your) (phone|video|virtual|technical|onsite|on-site|final)?\s*interview/i,
  /like to (invite|schedule) you/i,
  /meet with (the|our) (team|hiring|manager)/i,
  /phone screen/i,
  /book a time/i,
  /calendly\.com\/[a-z]/i,
  /pick a (time|slot)/i,
  /availability for (a |an )?(call|chat|interview|meeting)/i,
  /next steps.*interview/i,
  /moving you forward/i,
];

const ASSESSMENT_PATTERNS = [
  /take-home (assignment|test|challenge|assessment)/i,
  /coding (challenge|test|assessment|exercise)/i,
  /technical (assessment|test|challenge|exercise)/i,
  /complete (this|the) (assessment|challenge|test)/i,
  /hackerrank/i,
  /codility/i,
  /codesignal/i,
  /homework assignment/i,
];

const OFFER_PATTERNS = [
  /pleased to (offer|extend)/i,
  /offer (letter|of employment)/i,
  /formal offer/i,
  /compensation package/i,
  /we('d| would) like to (offer|extend)/i,
  /start date/i,
];

/**
 * Classify an email body into a response type.
 * Returns: 'rejection' | 'interview' | 'assessment' | 'offer' | 'confirmation' | 'generic' | null
 */
function classifyEmail(subject, body) {
  const text = `${subject} ${body}`;

  // Skip security codes and verification emails (not actionable)
  if (/security code for your application/i.test(subject)) {
    return "generic";
  }

  // "Thank you for applying" subjects are confirmations unless body strongly says otherwise
  const isThankYouSubject = /thank you for (applying|your (interest|application))/i.test(subject);

  // Check in priority order (offer > interview > assessment > rejection)
  for (const p of OFFER_PATTERNS) {
    if (p.test(text)) {
      return "offer";
    }
  }
  for (const p of INTERVIEW_PATTERNS) {
    if (p.test(text)) {
      // If subject says "thank you for applying", only classify as interview if
      // the body genuinely mentions scheduling (not just boilerplate "next steps")
      if (isThankYouSubject) {
        const hasStrongInterview =
          /schedule.{0,20}interview|calendly\.com|book a time|pick a (time|slot)/i.test(body);
        if (!hasStrongInterview) {
          continue; // skip this match, let it fall through to confirmation
        }
      }
      return "interview";
    }
  }
  for (const p of ASSESSMENT_PATTERNS) {
    if (p.test(text)) {
      return "assessment";
    }
  }
  for (const p of REJECTION_PATTERNS) {
    if (p.test(text)) {
      return "rejection";
    }
  }

  // Subject-only heuristics for undecoded bodies
  if (
    /^(your application to|update from|update on your|update regarding)/i.test(subject) &&
    !/thank you|received|confirmation/i.test(subject)
  ) {
    // "Your application to X" and "Update from X" are overwhelmingly rejections
    return "rejection";
  }

  // Application confirmations (not status-changing but worth logging)
  if (
    /thank you for (applying|your (interest|application))|application (received|confirmation)|we got your application/i.test(
      subject,
    )
  ) {
    return "confirmation";
  }

  return "generic";
}

/**
 * Map email classification to application status.
 */
function classificationToStatus(classification) {
  switch (classification) {
    case "rejection":
      return "rejected";
    case "interview":
      return "interview";
    case "assessment":
      return "phone_screen"; // assessments go to phone_screen stage
    case "offer":
      return "offer";
    case "confirmation":
      return "applied"; // confirmation means we successfully applied
    default:
      return null; // generic emails don't change status
  }
}

/**
 * Extract the domain from an email address.
 */
function emailDomain(email) {
  const m = email.match(/@([a-z0-9.-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Extract the "core" domain (e.g., "stripe" from "stripe.com" or "mail.stripe.com").
 */
function coreDomain(domain) {
  if (!domain) {
    return null;
  }
  const parts = domain.split(".");
  // Handle known multi-part TLDs (co.uk, etc.)
  if (parts.length >= 3 && parts[parts.length - 2].length <= 3) {
    return parts[parts.length - 3];
  }
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

// ─── Main ────────────────────────────────────────────────────────────────────
console.log("=== CareerClaw Email Response Tracker ===");
console.log(`Since:    ${SINCE.toISOString().slice(0, 10)}`);
console.log(`Dry run:  ${DRY_RUN}`);
console.log(`Limit:    ${EMAIL_LIMIT}`);
console.log("");

// Fetch ALL applications and jobs (paginated — PostgREST caps at 1000 rows)
const [apps, jobs] = await Promise.all([
  sbGetAll("/rest/v1/applications?select=id,job_id,status,platform,notes&order=created_at.desc"),
  sbGetAll("/rest/v1/jobs?select=id,title,company,url"),
]);
console.log(`Loaded ${apps.length} applications, ${jobs.length} jobs`);

const jobMap = Object.fromEntries(jobs.map((j) => [j.id, j]));

// Build company domain → application mappings
// We match by: company name appearing in sender domain
const companyApps = new Map();
for (const app of apps) {
  const job = jobMap[app.job_id];
  if (!job?.company) {
    continue;
  }
  const companyKey = job.company.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!companyApps.has(companyKey)) {
    companyApps.set(companyKey, []);
  }
  companyApps.get(companyKey).push({ app, job });
  // Also index by first word of multi-word company names (e.g. "Grafana Labs" → "grafana")
  const firstWord = job.company
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)[0];
  if (firstWord && firstWord !== companyKey && firstWord.length >= 3) {
    if (!companyApps.has(firstWord)) {
      companyApps.set(firstWord, []);
    }
    companyApps.get(firstWord).push({ app, job });
  }
}

// Also build URL domain → application mappings (for greenhouse, lever, etc.)
const urlDomainApps = new Map();
for (const app of apps) {
  const job = jobMap[app.job_id];
  if (!job?.url) {
    continue;
  }
  try {
    const domain = new URL(job.url).hostname.toLowerCase();
    const core = coreDomain(domain);
    if (core && !["greenhouse", "lever", "ashby", "icims"].includes(core)) {
      if (!urlDomainApps.has(core)) {
        urlDomainApps.set(core, []);
      }
      urlDomainApps.get(core).push({ app, job });
    }
  } catch {}
}

// Connect to Gmail
const client = new ImapFlow({
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  logger: false,
});

let processed = 0;
let matched = 0;
let statusUpdated = 0;
let logged = 0;

try {
  await client.connect();
  await client.mailboxOpen("INBOX");

  // Search for emails since the target date
  const uids = await client.search({ since: SINCE });
  console.log(`Found ${uids.length} email(s) since ${SINCE.toISOString().slice(0, 10)}`);

  const toProcess = uids.slice(-EMAIL_LIMIT); // most recent N

  for (const uid of toProcess) {
    let msg;
    try {
      msg = await client.fetchOne(uid, {
        envelope: true,
        source: true,
      });
    } catch {
      continue;
    }

    const from = msg.envelope?.from?.[0];
    if (!from?.address) {
      continue;
    }

    const senderDomain = emailDomain(from.address);
    const senderCore = coreDomain(senderDomain);
    const subject = msg.envelope?.subject || "";

    // Decode body: handle base64 MIME parts, QP, and plain text
    const rawSource = msg.source?.toString("utf8") || "";
    let bodyText = "";
    {
      // Try to extract base64-encoded body parts
      const b64Matches = rawSource.matchAll(
        /Content-Transfer-Encoding:\s*base64\s*\r?\n\r?\n([\s\S]*?)(?:\r?\n--|\r?\n\r?\n[A-Z])/gi,
      );
      for (const m of b64Matches) {
        try {
          const decoded = Buffer.from(m[1].replace(/\s/g, ""), "base64").toString("utf8");
          bodyText += " " + decoded;
        } catch {}
      }
      // Also try QP-encoded parts
      const qpParts = rawSource.matchAll(
        /Content-Transfer-Encoding:\s*quoted-printable\s*\r?\n\r?\n([\s\S]*?)(?:\r?\n--|\r?\n\r?\n[A-Z])/gi,
      );
      for (const m of qpParts) {
        const decoded = m[1]
          .replace(/=([A-F0-9]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/=\r?\n/g, "");
        bodyText += " " + decoded;
      }
      // Fallback: use raw source after headers if no MIME parts found
      if (!bodyText.trim()) {
        const headerEnd = rawSource.indexOf("\r\n\r\n");
        if (headerEnd > 0) {
          bodyText = rawSource.slice(headerEnd + 4);
        } else {
          bodyText = rawSource;
        }
        // QP decode the fallback
        bodyText = bodyText
          .replace(/=([A-F0-9]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/=\r?\n/g, "");
      }
      // Strip HTML and normalize
      bodyText = bodyText
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&#\d+;/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 8000);
    }

    // Skip common non-job emails
    if (!senderCore) {
      continue;
    }
    const skipDomains = new Set([
      "google",
      "apple",
      "github",
      "amazon",
      "paypal",
      "stripe",
      "gmail",
      "noreply",
      "donotreply",
      "no-reply",
      "zoom",
      "slack",
      "calendar",
      "calendly",
      "notion",
      "figma",
      "vercel",
      "netlify",
      "heroku",
      "digitalocean",
      "sendgrid",
      "mailchimp",
      "intercom",
      "hubspot",
      "linkedin",
      "facebook",
      "twitter",
      "instagram",
      "youtube",
      "spotify",
      "dropbox",
      "atlassian",
      "jira",
      "confluence",
    ]);
    // Only skip if there's no matching company
    if (skipDomains.has(senderCore) && !companyApps.has(senderCore)) {
      continue;
    }

    // Classify
    const classification = classifyEmail(subject, bodyText);
    if (classification === "generic") {
      processed++;
      continue;
    }

    // Match to application
    let matchedEntries = [];

    // ATS relay match FIRST: greenhouse-mail.io, lever, gem.com, etc. — extract company from subject
    if (
      matchedEntries.length === 0 &&
      /greenhouse-mail|lever|ashby|icims|gem\.com|appreview\.gem/i.test(senderDomain || "")
    ) {
      // Normalize subject: strip non-printable chars (U+FFFC etc.) that break regex
      // eslint-disable-next-line no-control-regex
      const cleanSubject = subject.replace(/[\u0000-\u001f\ufffc-\uffff]/g, " ");
      const subjectCompanyPatterns = [
        // "applying to Staff engineer - AI Builder at Tomorrow.io" → "Tomorrow.io"
        /applying to .+ at (.+?)(?:\s*[-–|]|$)/i,
        // "Application Confirmation for Director of PM, Growth at Twin Health" → "Twin Health"
        /Application Confirmation for .+ at (.+?)(?:\s*[-–|]|$)/i,
        // "application to Hightouch" → "Hightouch"
        /application to (.+?)(?:\s*[-–|]|$)/i,
        // "applying to Glean" → "Glean"
        /applying to (.+?)(?:\s*[-–|]|$)/i,
        // "interest in X" → "X"
        /interest in (.+?)(?:\s*[-–|!]|$)/i,
        // "you.com Application Received!" → "you.com"
        /(.+?) Application Received/i,
        // "Lantern | Thank you for applying!" → "Lantern"
        /^(.+?)\s*[-–|]\s*(thank|your|important|update|application|next)/i,
        /Your (.+?) Application/i,
        /(.+?) - Next Steps/i,
        /from (.+?)$/i,
      ];
      for (const pat of subjectCompanyPatterns) {
        const m = cleanSubject.match(pat);
        if (m) {
          const extracted = m[1]
            .trim()
            .replace(/[^a-z0-9]/gi, "")
            .toLowerCase();
          if (extracted.length >= 3 && companyApps.has(extracted)) {
            matchedEntries = companyApps.get(extracted);
            break;
          }
          // Also try partial match (company name might be subset)
          for (const [companyKey, entries] of companyApps) {
            if (
              companyKey.length >= 4 &&
              (extracted.includes(companyKey) || companyKey.includes(extracted))
            ) {
              matchedEntries = entries;
              break;
            }
          }
          if (matchedEntries.length > 0) {
            break;
          }
        }
      }
    }

    // Direct company name match (non-ATS senders — skip for known ATS relay domains)
    const isAtsRelay = /greenhouse-mail|lever|ashby|icims|gem\.com|appreview\.gem/i.test(
      senderDomain || "",
    );
    if (matchedEntries.length === 0 && !isAtsRelay) {
      matchedEntries = companyApps.get(senderCore) || [];
    }
    if (matchedEntries.length === 0 && !isAtsRelay) {
      matchedEntries = urlDomainApps.get(senderCore) || [];
    }
    if (matchedEntries.length === 0) {
      // Fuzzy: sender domain contains any company name substring
      for (const [companyKey, entries] of companyApps) {
        if (companyKey.length >= 4 && senderDomain?.includes(companyKey)) {
          matchedEntries = entries;
          break;
        }
      }
    }

    // Subject-based company name scan: look for any known company name in subject
    // Use longest match to avoid false positives (e.g., "engine" inside "engineer")
    if (matchedEntries.length === 0) {
      const subjectLower = subject.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
      let bestMatch = null;
      let bestLen = 0;
      for (const [companyKey, entries] of companyApps) {
        if (
          companyKey.length >= 4 &&
          companyKey.length > bestLen &&
          subjectLower.includes(companyKey)
        ) {
          bestMatch = entries;
          bestLen = companyKey.length;
        }
      }
      if (bestMatch) {
        matchedEntries = bestMatch;
      }
    }

    // From-address company match: no-reply@companyname.com
    if (matchedEntries.length === 0 && from.address) {
      const fromLocal = from.address.split("@")[0]?.toLowerCase() || "";
      // Skip generic local parts
      if (
        ![
          "noreply",
          "no-reply",
          "donotreply",
          "jobs",
          "careers",
          "recruiting",
          "talent",
          "hr",
        ].includes(fromLocal.replace(/-/g, ""))
      ) {
        // Check if the from domain matches a company
        for (const [companyKey, entries] of companyApps) {
          if (companyKey.length >= 4 && senderDomain?.includes(companyKey)) {
            matchedEntries = entries;
            break;
          }
        }
      }
    }

    if (matchedEntries.length === 0) {
      if (classification !== "generic") {
        console.log(`  ? Unmatched ${classification}: "${subject}" from ${from.address}`);
      }
      processed++;
      continue;
    }

    matched++;
    // Pick the most recent application for this company
    const { app, job } = matchedEntries[0];
    const newStatus = classificationToStatus(classification);

    console.log(
      `  ${classification.toUpperCase()}: "${subject}" → ${job.title} @ ${job.company} (${app.status})`,
    );

    if (DRY_RUN) {
      if (newStatus && newStatus !== app.status) {
        if (isValidStatusTransition(app.status, newStatus)) {
          console.log(`    Would update status: ${app.status} → ${newStatus}`);
        } else {
          console.log(`    Skip invalid transition: ${app.status} → ${newStatus}`);
        }
      }
      processed++;
      continue;
    }

    // Update application status if valid transition
    if (newStatus && newStatus !== app.status && isValidStatusTransition(app.status, newStatus)) {
      const patchData = {
        status: newStatus,
        last_contact_date: new Date().toISOString().slice(0, 10),
        notes:
          (app.notes || "") + ` | Email ${classification} ${new Date().toISOString().slice(0, 10)}`,
      };
      const res = await sbPatch(`/rest/v1/applications?id=eq.${app.id}`, patchData);
      if (res.status === 204) {
        console.log(`    Status updated: ${app.status} → ${newStatus}`);
        statusUpdated++;
      } else {
        console.log(`    Status update failed (HTTP ${res.status})`);
      }
    } else if (newStatus && newStatus !== app.status) {
      console.log(`    Skipped invalid transition: ${app.status} → ${newStatus}`);
    }

    // Log to communication_log
    const logEntry = {
      entity_type: "application",
      entity_id: app.id,
      channel: "email",
      direction: "inbound",
      subject: subject.slice(0, 255),
      content_summary: `${classification}: ${subject}`.slice(0, 500),
      sentiment:
        classification === "rejection"
          ? "negative"
          : classification === "offer"
            ? "positive"
            : "neutral",
    };
    const logRes = await sbPost("/rest/v1/communication_log", logEntry);
    if (logRes.status === 201) {
      logged++;
    }

    processed++;
  }

  await client.logout();
} catch (err) {
  console.error(`IMAP error: ${err.message}`);
  try {
    await client.logout();
  } catch {}
}

console.log(`\n=== Done ===`);
console.log(`Processed: ${processed}`);
console.log(`Matched:   ${matched}`);
console.log(`Updated:   ${statusUpdated}`);
console.log(`Logged:    ${logged}`);
