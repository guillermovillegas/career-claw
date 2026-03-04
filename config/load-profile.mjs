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
  return `Write a 100-140 word cover letter. Applicant: ${cl.fullName}. Role: ${title} at ${company} (${mode}).

Structure (two paragraphs, no greeting, no "Dear..."):
- P1: State the role. Then one concrete achievement from his background that is directly relevant to THIS specific role type. Use the exact numbers.
- P2: One more relevant proof point (different from P1). End with "${cl.fullName}" on its own line.

Background:
${cl.backgroundText}

Match the proof points to the role type:
${cl.roleGuideText}

Rules:
- Do NOT make up anything about ${company} — you don't know what they do. Only reference the role title.
- Do NOT start with "At ${company}" or "I'm proud" or any variation. Start with a direct statement about the role or his work.
- Write in first person, direct tone. Short sentences. No filler.
- NEVER use these words/phrases: ${cl.bannedWords}
- No markdown, no quotes, no preamble. Output the letter text only.`;
}
