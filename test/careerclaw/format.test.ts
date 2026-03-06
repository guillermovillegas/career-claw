import { describe, expect, it, vi, afterEach } from "vitest";
import {
  formatCurrency,
  formatSalaryRange,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatLabel,
} from "../../apps/dashboard/src/lib/format";

// ─── formatCurrency ──────────────────────────────────────────────────────────

describe("formatCurrency", () => {
  it("formats a whole number as USD", () => {
    expect(formatCurrency(120000)).toBe("$120,000");
  });

  it("formats small numbers", () => {
    expect(formatCurrency(50)).toBe("$50");
  });

  it("returns '--' for null", () => {
    expect(formatCurrency(null)).toBe("--");
  });

  it("returns '--' for undefined", () => {
    expect(formatCurrency(undefined)).toBe("--");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0");
  });
});

// ─── formatSalaryRange ──────────────────────────────────────────────────────

describe("formatSalaryRange", () => {
  it("formats a full range", () => {
    expect(formatSalaryRange(80000, 120000)).toBe("$80k - $120k");
  });

  it("formats min only with + suffix", () => {
    expect(formatSalaryRange(100000, null)).toBe("$100k+");
  });

  it("formats max only with 'Up to' prefix", () => {
    expect(formatSalaryRange(null, 150000)).toBe("Up to $150k");
  });

  it("returns '--' when both are null", () => {
    expect(formatSalaryRange(null, null)).toBe("--");
  });

  it("returns '--' when both are undefined", () => {
    expect(formatSalaryRange(undefined, undefined)).toBe("--");
  });

  it("handles small values below 1000", () => {
    expect(formatSalaryRange(500, 900)).toBe("$500 - $900");
  });

  it("handles exact 1000 boundary", () => {
    expect(formatSalaryRange(1000, 2000)).toBe("$1k - $2k");
  });
});

// ─── formatDate ──────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("formats an ISO date string", () => {
    // Use full ISO datetime to avoid timezone shift from date-only parsing
    const result = formatDate("2025-06-15T12:00:00Z");
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2025/);
  });

  it("formats an ISO datetime string", () => {
    const result = formatDate("2025-01-05T14:30:00Z");
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/2025/);
  });

  it("returns '--' for null", () => {
    expect(formatDate(null)).toBe("--");
  });

  it("returns '--' for undefined", () => {
    expect(formatDate(undefined)).toBe("--");
  });

  it("returns '--' for empty string", () => {
    expect(formatDate("")).toBe("--");
  });
});

// ─── formatDateTime ─────────────────────────────────────────────────────────

describe("formatDateTime", () => {
  it("includes time component", () => {
    const result = formatDateTime("2025-06-15T14:30:00Z");
    // Should contain date parts and time
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2025/);
    // Should contain AM or PM
    expect(result).toMatch(/[AP]M/);
  });

  it("returns em-dash for null", () => {
    expect(formatDateTime(null)).toBe("\u2014");
  });

  it("returns em-dash for undefined", () => {
    expect(formatDateTime(undefined)).toBe("\u2014");
  });

  it("returns em-dash for empty string", () => {
    expect(formatDateTime("")).toBe("\u2014");
  });
});

// ─── formatRelativeTime ─────────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'just now' for < 1 minute ago", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const thirtySecondsAgo = new Date(now - 30_000).toISOString();
    expect(formatRelativeTime(thirtySecondsAgo)).toBe("just now");
  });

  it("returns minutes for < 1 hour", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const fiveMinAgo = new Date(now - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe("5m ago");
  });

  it("returns hours for < 24 hours", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const threeHoursAgo = new Date(now - 3 * 3_600_000).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe("3h ago");
  });

  it("returns days for < 30 days", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const fiveDaysAgo = new Date(now - 5 * 86_400_000).toISOString();
    expect(formatRelativeTime(fiveDaysAgo)).toBe("5d ago");
  });

  it("falls back to formatDate for >= 30 days", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const sixtyDaysAgo = new Date(now - 60 * 86_400_000).toISOString();
    const result = formatRelativeTime(sixtyDaysAgo);
    // Should be a date string, not "60d ago"
    expect(result).not.toContain("d ago");
    expect(result).toMatch(/\d{4}/); // year present
  });
});

// ─── formatLabel ────────────────────────────────────────────────────────────

describe("formatLabel", () => {
  it("replaces underscores with spaces and capitalizes", () => {
    expect(formatLabel("phone_screen")).toBe("Phone Screen");
  });

  it("capitalizes single word", () => {
    expect(formatLabel("applied")).toBe("Applied");
  });

  it("handles multiple underscores", () => {
    expect(formatLabel("job_search_daily")).toBe("Job Search Daily");
  });

  it("handles already capitalized input", () => {
    expect(formatLabel("Already_Done")).toBe("Already Done");
  });

  it("handles empty string", () => {
    expect(formatLabel("")).toBe("");
  });
});
