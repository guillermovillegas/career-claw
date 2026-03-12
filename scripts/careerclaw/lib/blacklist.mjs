/**
 * Company blacklist — shared across all CareerClaw pipeline scripts.
 *
 * Config: config/blacklist.json
 * Add companies there; this module provides the lookup.
 *
 * Usage:
 *   import { isBlacklisted } from './lib/blacklist.mjs';
 *   if (isBlacklisted(job.company)) { skip; }
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "../../../config/blacklist.json");

let _entries = null;

function load() {
  if (_entries) {
    return _entries;
  }
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    _entries = (raw.companies || []).map((c) => ({
      name: c.name.toLowerCase().trim(),
      reason: c.reason || "",
    }));
  } catch {
    console.error(`WARN: Cannot load blacklist from ${CONFIG_PATH}`);
    _entries = [];
  }
  return _entries;
}

/** Returns true if company name matches any blacklisted entry (case-insensitive substring). */
export function isBlacklisted(company) {
  if (!company) {
    return false;
  }
  const lower = company.toLowerCase().trim();
  return load().some((b) => lower.includes(b.name));
}

/** Returns the full blacklist entries (for logging/display). */
export function getBlacklist() {
  return load();
}
