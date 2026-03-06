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
 * Used by direct-apply.mjs.
 */
export function buildCoverLetterPrompt(title, company, mode) {
  const cl = getCoverLetterConfig();
  return `Write a cover letter (150-200 words) for ${cl.fullName} applying to: ${title} at ${company} (${mode}).

STRUCTURE — three paragraphs:

Paragraph 1 (3-4 sentences): Open with a direct statement connecting his strongest relevant achievement to the ${title} role at ${company}. Name "${company}" and the role title. Lead with the most relevant proof point from the background below — use exact numbers. Explain WHY this experience matters for this specific role.

Paragraph 2 (3-4 sentences): A second, different proof point that shows range. If paragraph 1 used AI/ML experience, use the business/portfolio experience here (or vice versa). Connect it to what a ${title} would need to do.

Paragraph 3 (1-2 sentences): A forward-looking close. Reference the ${title} role at ${company} by name. End with interest in discussing further. Then "${cl.fullName}" alone on the final line.

BACKGROUND (use these facts — pick the most relevant for THIS role):
${cl.backgroundText}

ROLE-MATCHING GUIDE (which facts to lead with per role type):
${cl.roleGuideText}

STRICT RULES — violating ANY makes the output unusable:
1. You MUST mention "${company}" by name at least once in the letter.
2. You MUST reference the "${title}" role specifically, not just generic "product management".
3. Do NOT invent facts about ${company}. You know nothing about what they do. Only reference the role title and company name.
4. Do NOT start with any greeting or filler opener. No "Dear", "To Whom", "I am writing", "I am applying", "As a seasoned". Start with a concrete fact or achievement.
5. NEVER use these banned words/phrases: ${cl.bannedWords}
6. Write in first person. Direct tone. Varied sentence length. No fluff.
7. Output ONLY the letter text. No markdown, no quotes, no preamble, no labels.
8. The letter MUST be 150-200 words. Shorter is unusable.
9. Do NOT end paragraphs or the letter with just a name. The name goes ONLY on the very last line after the closing paragraph.`;
}
