/**
 * load-profile.mjs — Shared profile loader for all CareerClaw scripts.
 *
 * Reads config/profile.json and returns structured objects used by:
 *   - submit-playwright.mjs (P object for form filling)
 *   - submit-applications.mjs (PROFILE object)
 *   - direct-apply.mjs (PROFILE text + ROLE_GUIDE + buildPrompt)
 *
 * Usage:
 *   import { loadProfile, getFormProfile, getCoverLetterConfig, buildCoverLetterPrompt } from '../config/load-profile.mjs';
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = join(__dirname, "profile.json");

let _cached = null;

/** Load and cache the raw profile.json */
export function loadProfile() {
  if (_cached) {
    return _cached;
  }
  try {
    _cached = JSON.parse(readFileSync(PROFILE_PATH, "utf8"));
  } catch {
    console.error(`ERROR: Cannot load profile from ${PROFILE_PATH}`);
    console.error("Run: cp config/profile.example.json config/profile.json");
    console.error("Then edit config/profile.json with your details.");
    process.exit(1);
  }
  return _cached;
}

/**
 * Returns the P object used by submit-playwright.mjs and submit-applications.mjs
 * for filling out web forms.
 */
export function getFormProfile() {
  const p = loadProfile();
  return {
    first_name: p.personal.first_name,
    last_name: p.personal.last_name,
    email: p.personal.email,
    phone: p.personal.phone,
    phone_formatted: p.personal.phone_formatted,
    location: p.personal.location,
    linkedin: p.online.linkedin,
    github: p.online.github,
    website: p.online.website,
    current_company: p.professional.current_company,
    years_total: p.professional.years_total,
    years_product: p.professional.years_product,
    years_ai: p.professional.years_ai,
    years_leadership: p.professional.years_leadership,
  };
}

/** Returns the resume filename from profile */
export function getResumeFilename() {
  const p = loadProfile();
  return p.professional.resume_filename || "resume.pdf";
}

/** Returns form answer text for various question types */
export function getFormAnswers() {
  const p = loadProfile();
  return {
    professional_summary: p.form_answers?.professional_summary || "",
    ai_experience: p.form_answers?.ai_experience || "",
    why_interested: p.form_answers?.why_interested || "",
    additional_info: p.form_answers?.additional_info || "",
    greatest_impact: p.form_answers?.greatest_impact || "",
    work_environment_attributes: p.form_answers?.work_environment_attributes || "",
    compensation_expectation: p.form_answers?.compensation_expectation || "",
    compensation_text: p.form_answers?.compensation_text || "Open to discussion",
    work_authorization: p.professional?.work_authorization || "US Citizen",
    needs_sponsorship: p.professional?.needs_sponsorship ?? false,
    zip_code: p.personal?.zip_code || "",
    pronouns: p.personal?.pronouns || "",
  };
}

/** Returns cover letter generation config for direct-apply.mjs */
export function getCoverLetterConfig() {
  const p = loadProfile();
  const cl = p.cover_letter || {};
  return {
    backgroundText: (cl.background_bullets || []).map((b) => `- ${b}`).join("\n"),
    roleGuideText: (cl.role_matching || []).map((r) => `- ${r}`).join("\n"),
    bannedWords: cl.banned_words || "",
    fullName: `${p.personal.first_name} ${p.personal.last_name}`,
  };
}

/**
 * Build a cover letter prompt for LLM generation.
 * Randomly selects 3 of 5 background bullets to force varied proof points across letters.
 * Used by direct-apply.mjs and fix-cover-letters.mjs.
 */
export function buildCoverLetterPrompt(title, company, mode) {
  const cl = getCoverLetterConfig();

  // Shuffle and pick 3 of 5 bullets for variety across letters
  const bullets = (cl.backgroundText || "").split("\n").filter((b) => b.trim());
  const shuffled = bullets.toSorted(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(3, shuffled.length)).join("\n");

  return `Write a cover letter (150-200 words) for ${cl.fullName} applying to: ${title} at ${company} (${mode}).

STRUCTURE — three paragraphs, 150-200 words total:

Paragraph 1 (4-5 sentences): Connect the most relevant achievement to the ${title} role at ${company}. Do NOT start with "I" as the first word. Lead with a fact, metric, or outcome. Name "${company}" at least once. Use exact numbers from the background below.

Paragraph 2 (4-5 sentences): A second, different proof point that shows range. Use at least 2 different metrics/numbers. If paragraph 1 used AI/ML experience, use business/portfolio here (or vice versa). Connect it to what a ${title} at ${company} would need.

Paragraph 3 (2-3 sentences): Forward-looking close. Reference ${company} by name again. End the letter with the last sentence — NO signature, NO name, NO sign-off after the final sentence.

BACKGROUND (use ONLY these facts — pick the most relevant for THIS role):
${selected}

ROLE-MATCHING GUIDE:
${cl.roleGuideText}

STRICT RULES — violating ANY makes the output unusable:
1. "${company}" MUST appear at least 2 times in the letter.
2. Reference the "${title}" role specifically, not just generic "product management".
3. Do NOT invent facts about ${company}. You know nothing about what they do.
4. Do NOT start with "I" as the very first word. Start with a fact, metric, or context.
5. Do NOT use "As a seasoned" or any synonym ("As an experienced", "As a veteran", etc.).
6. NEVER use these banned words/phrases: ${cl.bannedWords}
7. No exclamation points anywhere in the letter.
8. The letter ends with the last sentence of paragraph 3. NO signature line. NO "Sincerely". NO "${cl.fullName}" at the end. Just the sentence, then stop.
9. Use 2+ different concrete metrics (percentages, dollar amounts, team sizes, etc.).
10. Write in first person. Direct tone. Varied sentence length. No fluff.
11. Output ONLY the letter text. No markdown, no quotes, no preamble, no labels.
12. The letter MUST be 150-200 words. Count carefully. Shorter or longer is unusable.`;
}
