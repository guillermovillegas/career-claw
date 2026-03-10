/**
 * Shared validation for CareerClaw pipeline.
 * Single source of truth for cover letter, job, and application validation.
 */

import http from "http";
import https from "https";
import { getCoverLetterConfig } from "../../../config/load-profile.mjs";

// Build name-stripping regex from profile
const _clCfg = getCoverLetterConfig();
const _nameParts = _clCfg.fullName.split(/\s+/);
const _nameRegex = new RegExp(
  `\\n\\s*${_nameParts[0]}\\s*(${_nameParts.slice(1).join("\\s+")})?\\s*$`,
  "i",
);

// ─── Cover Letter Validation ──────────────────────────────────────────────────

export const MIN_CL_LENGTH = 800;
export const MAX_CL_LENGTH = 1600;

export const BANNED_PATTERNS = [
  /\bdear\b/i,
  /\bto whom it may concern\b/i,
  /\bI am writing to\b/i,
  /\bI am applying\b/i,
  /\bI am confident\b/i,
  /\bexcited\b/i,
  /\bpassionate\b/i,
  /\bthrilled\b/i,
  /\bleverage\b/i,
  /\bsynergy\b/i,
  /\bcutting-edge\b/i,
  /\binnovative\b/i,
  /\bgame-changer\b/i,
  /\bI'm proud\b/i,
  /\bproud to bring\b/i,
  /\baligns perfectly\b/i,
  /\baligns with\b/i,
  /\bperfect fit\b/i,
  /\bgreat fit\b/i,
  /\bworld-class\b/i,
  /\bdynamic\b/i,
  /\bdelighted\b/i,
  /\bas a seasoned\b/i,
  /\blove\b/i,
  /\bI believe\b/i,
  /\bI feel\b/i,
  /\bI think\b/i,
  /\brockstar\b/i,
  /\bguru\b/i,
  /\breach out\b/i,
  /\bhit the ground running\b/i,
  /\bmove the needle\b/i,
  /\bdisruptive\b/i,
  /\bthought leader\b/i,
  /\bfeel free\b/i,
  /\bcircle back\b/i,
  /!/,
];

/**
 * Validate a cover letter for length, banned patterns, and paragraph structure.
 * @returns {{ valid: boolean, reason?: string, issues?: string[] }}
 */
export function validateCoverLetter(letter) {
  if (!letter || typeof letter !== "string") {
    return { valid: false, reason: "missing or not a string" };
  }
  const issues = [];

  if (letter.length < MIN_CL_LENGTH) {
    issues.push(`too short (${letter.length} chars, need ${MIN_CL_LENGTH}+)`);
  }
  if (letter.length > MAX_CL_LENGTH) {
    issues.push(`too long (${letter.length} chars, max ${MAX_CL_LENGTH})`);
  }

  // Word count gate: 120-220 words
  const wordCount = letter.split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount < 120) {
    issues.push(`too few words (${wordCount}, need 120+)`);
  }
  if (wordCount > 240) {
    issues.push(`too many words (${wordCount}, max 240)`);
  }

  for (const pattern of BANNED_PATTERNS) {
    const match = letter.match(pattern);
    if (match) {
      issues.push(`banned phrase: "${match[0]}"`);
    }
  }

  // Paragraph structure: should have at least 2 line breaks (3 paragraphs)
  const paragraphs = letter.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length < 2) {
    issues.push(`weak structure (${paragraphs.length} paragraph(s), need 2+)`);
  }

  if (issues.length > 0) {
    return { valid: false, reason: issues[0], issues };
  }
  return { valid: true };
}

/**
 * Context-aware cover letter quality check.
 * Runs validateCoverLetter() plus checks company/role mention.
 * @param {string} letter
 * @param {string} company - company name to look for
 * @param {string} title - role title to look for
 * @returns {{ valid: boolean, reason?: string, issues?: string[] }}
 */
export function validateCoverLetterForJob(letter, company, title) {
  const base = validateCoverLetter(letter);
  const issues = base.issues ? [...base.issues] : [];

  if (letter && typeof letter === "string") {
    const clLower = letter.toLowerCase();

    // Company name must appear
    if (company && !clLower.includes(company.toLowerCase())) {
      issues.push(`never mentions company "${company}"`);
    }

    // Role title should be meaningfully referenced (2+ content words from the title)
    if (title) {
      const titleWords = title
        .toLowerCase()
        .split(/[\s,/()–—-]+/)
        .filter(
          (w) => w.length > 3 && !["senior", "staff", "lead", "principal", "head"].includes(w),
        );
      const hits = titleWords.filter((w) => clLower.includes(w));
      if (hits.length < Math.min(2, titleWords.length)) {
        issues.push(`barely references role "${title}"`);
      }
    }

    // Should not start with a bare number
    if (/^\d/.test(letter.trim())) {
      issues.push("opens with a number — reads impersonally");
    }

    // Bare name ending detection (AI spam signature)
    if (
      /\n\s*(Sincerely|Best regards?|Regards|Warm regards|Cheers|Thank you|Thanks),?\s*\n/i.test(
        letter,
      ) ||
      _nameRegex.test(letter)
    ) {
      issues.push("ends with bare sign-off/name — AI spam pattern");
    }
  }

  if (issues.length > 0) {
    return { valid: false, reason: issues[0], issues };
  }
  return { valid: true };
}

// ─── Job Validation ───────────────────────────────────────────────────────────

const VALID_JOB_TYPES = new Set(["full-time", "part-time", "contract", "freelance"]);
const VALID_WORK_MODES = new Set(["remote", "hybrid", "on-site"]);
const VALID_PLATFORMS = new Set([
  "linkedin",
  "indeed",
  "upwork",
  "fiverr",
  "direct",
  "referral",
  "other",
]);

const SUSPECT_URL_PATTERNS = [
  /JOBID/i, // placeholder URLs
  /example\.com/i,
  /localhost/i,
  /127\.0\.0\.1/,
];

/**
 * Validate a job record.
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateJob(job) {
  const issues = [];

  if (!job.title) {
    issues.push("missing title");
  }
  if (!job.company) {
    issues.push("missing company");
  }
  if (!job.platform) {
    issues.push("missing platform");
  }

  if (job.platform && !VALID_PLATFORMS.has(job.platform)) {
    issues.push(`invalid platform: "${job.platform}"`);
  }
  if (job.job_type && !VALID_JOB_TYPES.has(job.job_type)) {
    issues.push(`invalid job_type: "${job.job_type}"`);
  }
  if (job.work_mode && !VALID_WORK_MODES.has(job.work_mode)) {
    issues.push(`invalid work_mode: "${job.work_mode}"`);
  }

  if (job.match_score != null && (job.match_score < 0 || job.match_score > 100)) {
    issues.push(`match_score out of range: ${job.match_score}`);
  }

  if (job.url) {
    for (const pattern of SUSPECT_URL_PATTERNS) {
      if (pattern.test(job.url)) {
        issues.push(`suspect URL pattern: ${job.url}`);
        break;
      }
    }
  }

  if (job.deadline) {
    const deadline = new Date(job.deadline);
    if (!isNaN(deadline.getTime()) && deadline < new Date()) {
      issues.push(`past deadline: ${job.deadline}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

// ─── Application Validation ───────────────────────────────────────────────────

const VALID_STATUSES = new Set([
  "interested",
  "applied",
  "phone_screen",
  "interview",
  "final",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
]);

/**
 * Valid status transitions. Keys are "from" statuses, values are allowed "to" statuses.
 */
const STATUS_TRANSITIONS = {
  interested: new Set(["applied", "phone_screen", "interview", "rejected", "withdrawn"]),
  applied: new Set(["phone_screen", "interview", "rejected", "withdrawn"]),
  phone_screen: new Set(["interview", "rejected", "withdrawn"]),
  interview: new Set(["final", "offer", "rejected", "withdrawn"]),
  final: new Set(["offer", "rejected", "withdrawn"]),
  offer: new Set(["hired", "rejected", "withdrawn"]),
  hired: new Set(["withdrawn"]),
  rejected: new Set([]), // terminal
  withdrawn: new Set([]), // terminal
};

/**
 * Check if a status transition is valid.
 */
export function isValidStatusTransition(from, to) {
  if (!from || !to) {
    return false;
  }
  if (from === to) {
    return true;
  } // no-op is always valid
  const allowed = STATUS_TRANSITIONS[from];
  return allowed ? allowed.has(to) : false;
}

/**
 * Validate an application record.
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateApplication(app) {
  const issues = [];

  if (!app.status) {
    issues.push("missing status");
  } else if (!VALID_STATUSES.has(app.status)) {
    issues.push(`invalid status: "${app.status}"`);
  }

  if (app.match_score != null && (app.match_score < 0 || app.match_score > 100)) {
    issues.push(`match_score out of range: ${app.match_score}`);
  }

  if (app.priority != null && (app.priority < 1 || app.priority > 5)) {
    issues.push(`priority out of range: ${app.priority}`);
  }

  if (app.cover_letter) {
    const clCheck = validateCoverLetter(app.cover_letter);
    if (!clCheck.valid) {
      issues.push(`cover letter: ${clCheck.reason}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

// ─── URL Liveness Check ──────────────────────────────────────────────────────

/**
 * Check a URL to detect expired/dead job posts.
 * For Ashby URLs: does a GET and checks body for "posting":null / "Job not found"
 * (Ashby returns HTTP 200 for dead jobs with SSR "Job not found" text).
 * For others: HEAD-check with redirect/status detection.
 * Returns { alive: boolean, status: number|null, reason?: string }
 */
export function checkUrlLiveness(urlStr, timeoutMs = 10000) {
  return new Promise((resolve) => {
    if (!urlStr) {
      resolve({ alive: false, status: null, reason: "no URL" });
      return;
    }

    let resolved = false;
    const finish = (result) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      finish({ alive: false, status: null, reason: "timeout" });
    }, timeoutMs);

    try {
      const url = new URL(urlStr);
      const lib = url.protocol === "https:" ? https : http;
      const isAshby = url.hostname.includes("ashbyhq.com");
      const isGreenhouse =
        url.hostname.includes("greenhouse.io") || url.hostname.includes("greenhouse.com");
      // Use GET for Ashby (body check) and Greenhouse (redirect chain + body check)
      const useGet = isAshby || isGreenhouse;

      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: url.pathname + url.search,
          method: useGet ? "GET" : "HEAD",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          },
          timeout: timeoutMs,
        },
        (res) => {
          clearTimeout(timer);
          const status = res.statusCode;

          // Check for error redirects (Greenhouse pattern: ?error=true)
          const location = res.headers.location || "";
          if (location.includes("error=true") || location.includes("not-found")) {
            finish({ alive: false, status, reason: `redirect to error: ${location}` });
            return;
          }

          if (isAshby) {
            // Ashby returns 200 for dead postings — must check body
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => {
              if (/"posting"\s*:\s*null/.test(body) || /Job not found/i.test(body)) {
                finish({ alive: false, status, reason: "Ashby posting removed (posting=null)" });
              } else {
                finish({ alive: true, status });
              }
            });
            return;
          }

          if (isGreenhouse) {
            // Greenhouse dead jobs: 302 → ?error=true, or 200 with canonical to ?error=true
            // Follow one redirect level if 3xx
            if (status >= 300 && status < 400 && location) {
              try {
                const nextUrl = new URL(location, urlStr);
                if (
                  nextUrl.searchParams.get("error") === "true" ||
                  nextUrl.pathname === url.pathname.replace(/\/jobs\/.*/, "")
                ) {
                  finish({ alive: false, status, reason: `GH redirect to board: ${location}` });
                  return;
                }
                // Follow the redirect
                const lib2 = nextUrl.protocol === "https:" ? https : http;
                const req2 = lib2.request(
                  {
                    hostname: nextUrl.hostname,
                    port: nextUrl.port || (nextUrl.protocol === "https:" ? 443 : 80),
                    path: nextUrl.pathname + nextUrl.search,
                    method: "GET",
                    headers: {
                      "User-Agent":
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    },
                    timeout: timeoutMs,
                  },
                  (res2) => {
                    const loc2 = res2.headers.location || "";
                    if (loc2.includes("error=true") || loc2.includes("not-found")) {
                      finish({
                        alive: false,
                        status: res2.statusCode,
                        reason: `GH redirect chain to error: ${loc2}`,
                      });
                      res2.resume();
                      return;
                    }
                    let body = "";
                    res2.on("data", (c) => (body += c.toString().slice(0, 5000)));
                    res2.on("end", () => {
                      if (/error=true/.test(body) && /canonical/.test(body)) {
                        finish({
                          alive: false,
                          status: res2.statusCode,
                          reason: "GH canonical error page",
                        });
                      } else {
                        finish({ alive: true, status: res2.statusCode });
                      }
                    });
                  },
                );
                req2.on("error", () => finish({ alive: true, status }));
                req2.end();
              } catch {
                finish({ alive: true, status });
              }
              res.resume();
              return;
            }
            // Non-redirect: check body for error indicators
            let body = "";
            res.on("data", (c) => (body += c.toString().slice(0, 5000)));
            res.on("end", () => {
              if (/error=true/.test(body) && /canonical/.test(body)) {
                finish({ alive: false, status, reason: "GH error page (canonical)" });
              } else {
                finish({ alive: true, status });
              }
            });
            return;
          }

          if (status >= 200 && status < 400) {
            finish({ alive: true, status });
          } else if (status === 404 || status === 410) {
            finish({ alive: false, status, reason: `HTTP ${status}` });
          } else {
            // 403/5xx — might be bot-blocking, treat as uncertain but alive
            finish({ alive: true, status, reason: `HTTP ${status} (may be bot-blocked)` });
          }
        },
      );

      req.on("error", (err) => {
        clearTimeout(timer);
        finish({ alive: false, status: null, reason: err.message });
      });

      req.on("timeout", () => {
        req.destroy();
        clearTimeout(timer);
        finish({ alive: false, status: null, reason: "timeout" });
      });

      req.end();
    } catch (err) {
      clearTimeout(timer);
      finish({ alive: false, status: null, reason: err.message });
    }
  });
}
