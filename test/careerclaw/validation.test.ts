import { describe, expect, it } from "vitest";

// Import the ESM validation module
const {
  validateCoverLetter,
  validateCoverLetterForJob,
  validateJob,
  validateApplication,
  isValidStatusTransition,
  checkUrlLiveness,
  MIN_CL_LENGTH,
  MAX_CL_LENGTH,
  BANNED_PATTERNS,
} = await import("../../scripts/careerclaw/lib/validation.mjs");

// ─── validateCoverLetter ─────────────────────────────────────────────────────

// Helper: a well-formed 150+ word cover letter that passes all checks
const makeGoodLetter = () =>
  [
    "At Levee, building a computer vision system that achieved 92% accuracy across 605 rooms reduced inspection time by 60%, earning recognition at HITEC and PhocusWire. That experience leading a zero-to-one AI product from prototype to production deployment directly applies to the challenges of scaling ML infrastructure at this company.",
    "",
    "Before Levee, managing a $250M smart-home portfolio at Chamberlain Group involved turning the Ring partnership from -11% to +68% IRR through strategic product repositioning. Leading cross-functional teams of engineers, designers, and data scientists across multiple product lines built the operational muscle needed for senior product leadership. The combination of hands-on AI development and large-scale portfolio management provides a unique perspective on balancing technical depth with business outcomes.",
    "",
    "The opportunity to bring both zero-to-one building experience and scaled product management to this team is compelling. A conversation about how these experiences map to the roadmap ahead would be a welcome next step.",
  ].join("\n");

describe("validateCoverLetter", () => {
  const goodLetter = makeGoodLetter();

  it("accepts a well-formed cover letter", () => {
    const result = validateCoverLetter(goodLetter);
    expect(result.valid).toBe(true);
  });

  it("rejects null/undefined input", () => {
    expect(validateCoverLetter(null).valid).toBe(false);
    expect(validateCoverLetter(undefined).valid).toBe(false);
    expect(validateCoverLetter("").valid).toBe(false);
  });

  it("rejects letters that are too short", () => {
    const result = validateCoverLetter("Too short.");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("too short");
  });

  it("rejects letters that are too long", () => {
    const longLetter = [
      "First paragraph with some content here. ".repeat(5),
      "",
      "Second paragraph. " + "x".repeat(MAX_CL_LENGTH),
    ].join("\n");
    const result = validateCoverLetter(longLetter);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("too long");
  });

  it("rejects letters with too few words", () => {
    // 800+ chars but under 120 words: long words padded to hit char minimum
    const fewWords = [
      "Supercalifragilistic ".repeat(40),
      "",
      "Antidisestablishmentarianism ".repeat(20),
    ].join("\n");
    const result = validateCoverLetter(fewWords);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("too few words")]),
    );
  });

  it("rejects letters with too many words", () => {
    // 230+ words (well over 220 limit)
    const manyWords = ["word ".repeat(80), "", "more ".repeat(80), "", "extra ".repeat(80)].join(
      "\n",
    );
    const result = validateCoverLetter(manyWords);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("too many words")]),
    );
  });

  it("rejects letters with banned phrases", () => {
    const letterWithBanned = makeGoodLetter().replace(
      "At Levee,",
      "At Levee, I am passionate about",
    );
    const result = validateCoverLetter(letterWithBanned);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("banned phrase");
    expect(result.reason).toContain("passionate");
  });

  it("rejects exclamation points", () => {
    const direct = makeGoodLetter().replace(
      "next step.",
      "next step. Count me in for this opportunity. Results speak for themselves.",
    );
    const directBang = direct.replace("themselves.", "themselves. This would be amazing!");
    const r3 = validateCoverLetter(directBang);
    expect(r3.valid).toBe(false);
    expect(r3.issues).toEqual(expect.arrayContaining([expect.stringContaining("banned phrase")]));
  });

  it("detects all banned patterns", () => {
    // Each banned pattern should trigger rejection
    const bannedWords = [
      "dear",
      "to whom it may concern",
      "I am writing to",
      "I am applying",
      "I am confident",
      "excited",
      "passionate",
      "thrilled",
      "leverage",
      "synergy",
      "cutting-edge",
      "innovative",
      "game-changer",
      "I'm proud",
      "proud to bring",
      "aligns perfectly",
      "aligns with",
      "perfect fit",
      "great fit",
      "world-class",
      "dynamic",
      "delighted",
      "as a seasoned",
      "love",
      "I believe",
      "I feel",
      "I think",
      "rockstar",
      "guru",
      "reach out",
      "hit the ground running",
      "move the needle",
      "disruptive",
      "thought leader",
      "feel free",
      "circle back",
    ];

    for (const word of bannedWords) {
      // Inject the banned word into a good letter
      const letter = makeGoodLetter().replace("At Levee,", `Testing ${word} detection at Levee,`);
      const result = validateCoverLetter(letter);
      expect(result.valid, `"${word}" should be caught`).toBe(false);
    }
  });

  it("checks paragraph structure (needs 2+ paragraphs)", () => {
    // Single long paragraph with no breaks — build one that meets char+word minimums
    const words = [];
    for (let i = 0; i < 150; i++) {
      words.push("experience");
    }
    const singleParagraph = words.join(" ");
    const result = validateCoverLetter(singleParagraph);
    expect(result.valid).toBe(false);
    expect(result.issues).toBeDefined();
    const structureIssue = result.issues?.find((i: string) => i.includes("structure"));
    expect(structureIssue).toBeDefined();
  });

  it("returns all issues when multiple problems exist", () => {
    const result = validateCoverLetter("Short and passionate.");
    expect(result.valid).toBe(false);
    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThanOrEqual(1);
  });

  it("respects length boundaries exactly", () => {
    // Build a letter at exactly MIN_CL_LENGTH chars with enough words and structure
    const buildLetterOfLength = (targetLen: number) => {
      const p1 =
        "First paragraph content with enough words to count toward the minimum requirement. ";
      const p2 =
        "\n\nSecond paragraph also has enough content and words to satisfy word count minimums here. ";
      const base = p1 + p2;
      const remaining = targetLen - base.length;
      if (remaining <= 0) {
        return base.slice(0, targetLen);
      }
      // Use real words to avoid word count issues
      const filler = "additional context words here that count toward minimums and provide filler ";
      const fillerRepeat = filler.repeat(Math.ceil(remaining / filler.length)).slice(0, remaining);
      return p1 + fillerRepeat + p2;
    };

    const atMin = buildLetterOfLength(MIN_CL_LENGTH);
    expect(atMin.length).toBe(MIN_CL_LENGTH);
    // Should not fail on char length (may fail on word count though)
    const result = validateCoverLetter(atMin);
    const charLengthIssues = (result.issues || []).filter(
      (i: string) => i.includes("too short") && i.includes("chars"),
    );
    expect(charLengthIssues.length).toBe(0);
  });
});

// ─── validateCoverLetterForJob ────────────────────────────────────────────────

describe("validateCoverLetterForJob", () => {
  const goodLetter = [
    "At Levee, building a computer vision system that achieved 92% accuracy across 605 rooms reduced inspection time by 60%, earning recognition at HITEC and PhocusWire. That experience leading a zero-to-one AI product from prototype to production directly applies to the Product Manager role at Stripe.",
    "",
    "Before Levee, managing a $250M smart-home portfolio at Chamberlain Group involved turning the Ring partnership from -11% to +68% IRR. Leading cross-functional teams of engineers and data scientists across Stripe product lines built the operational muscle needed for the ML Foundations team.",
    "",
    "The opportunity to bring both zero-to-one building experience and scaled product management to Stripe is compelling. A conversation about how these experiences map to the Product Manager, ML Foundations roadmap would be a welcome next step.",
  ].join("\n");

  it("accepts a letter that mentions company and role", () => {
    const result = validateCoverLetterForJob(
      goodLetter,
      "Stripe",
      "Product Manager, ML Foundations",
    );
    expect(result.valid).toBe(true);
  });

  it("rejects a letter that never mentions the company", () => {
    const generic = goodLetter.replace(/Stripe/g, "the company");
    const result = validateCoverLetterForJob(generic, "Stripe", "Product Manager, ML Foundations");
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("never mentions company")]),
    );
  });

  it("rejects a letter that barely references the role", () => {
    const noRole = goodLetter
      .replace(/Product Manager/g, "this position")
      .replace(/ML Foundations/g, "the team");
    const result = validateCoverLetterForJob(noRole, "Stripe", "Product Manager, ML Foundations");
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("barely references role")]),
    );
  });

  it("rejects a letter that opens with a number", () => {
    const numStart = makeGoodLetter().replace("At Levee,", "92%+ accuracy achieved at Levee,");
    const result = validateCoverLetterForJob(numStart, "Acme", "PM");
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("opens with a number")]),
    );
  });

  it("rejects a letter ending with bare sign-off", () => {
    const withSignoff = goodLetter + "\n\nSincerely,\nJane Doe";
    const result = validateCoverLetterForJob(
      withSignoff,
      "Stripe",
      "Product Manager, ML Foundations",
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining("sign-off")]));
  });

  it("rejects a letter ending with bare name", () => {
    const withName = goodLetter + "\n\nJane Doe";
    const result = validateCoverLetterForJob(withName, "Stripe", "Product Manager, ML Foundations");
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining("sign-off")]));
  });

  it("also catches base validation issues (banned words, length)", () => {
    const result = validateCoverLetterForJob("Too short", "Acme", "PM");
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining("too short")]));
  });
});

// ─── validateJob ─────────────────────────────────────────────────────────────

describe("validateJob", () => {
  const validJob = {
    title: "Staff Product Manager",
    company: "Acme Corp",
    platform: "linkedin",
    job_type: "full-time",
    work_mode: "remote",
    match_score: 85,
    url: "https://linkedin.com/jobs/view/123456",
  };

  it("accepts a valid job", () => {
    const result = validateJob(validJob);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects missing required fields", () => {
    expect(validateJob({ company: "X", platform: "linkedin" }).issues).toContain("missing title");
    expect(validateJob({ title: "X", platform: "linkedin" }).issues).toContain("missing company");
    expect(validateJob({ title: "X", company: "X" }).issues).toContain("missing platform");
  });

  it("rejects invalid enum values", () => {
    expect(validateJob({ ...validJob, platform: "monster" }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining("invalid platform")]),
    );
    expect(validateJob({ ...validJob, job_type: "full_time" }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining("invalid job_type")]),
    );
    expect(validateJob({ ...validJob, work_mode: "onsite" }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining("invalid work_mode")]),
    );
  });

  it("accepts all valid enum values", () => {
    const platforms = ["linkedin", "indeed", "upwork", "fiverr", "direct", "referral", "other"];
    for (const p of platforms) {
      expect(validateJob({ ...validJob, platform: p }).valid).toBe(true);
    }

    const jobTypes = ["full-time", "part-time", "contract", "freelance"];
    for (const jt of jobTypes) {
      expect(validateJob({ ...validJob, job_type: jt }).valid).toBe(true);
    }

    const workModes = ["remote", "hybrid", "on-site"];
    for (const wm of workModes) {
      expect(validateJob({ ...validJob, work_mode: wm }).valid).toBe(true);
    }
  });

  it("flags out-of-range match_score", () => {
    expect(validateJob({ ...validJob, match_score: -5 }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining("match_score out of range")]),
    );
    expect(validateJob({ ...validJob, match_score: 101 }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining("match_score out of range")]),
    );
  });

  it("detects suspect URL patterns", () => {
    expect(validateJob({ ...validJob, url: "https://greenhouse.io/jobs/JOBID" }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining("suspect URL")]),
    );
    expect(validateJob({ ...validJob, url: "http://localhost:3000/job" }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining("suspect URL")]),
    );
    expect(validateJob({ ...validJob, url: "https://example.com/job/123" }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining("suspect URL")]),
    );
  });

  it("flags past deadlines", () => {
    const result = validateJob({ ...validJob, deadline: "2020-01-01" });
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("past deadline")]),
    );
  });

  it("accepts future deadlines", () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = validateJob({ ...validJob, deadline: futureDate });
    expect(result.issues.filter((i: string) => i.includes("deadline"))).toHaveLength(0);
  });

  it("ignores null optional fields", () => {
    const result = validateJob({
      title: "PM",
      company: "Acme",
      platform: "direct",
      job_type: null,
      work_mode: null,
      match_score: null,
      url: null,
      deadline: null,
    });
    expect(result.valid).toBe(true);
  });
});

// ─── validateApplication ─────────────────────────────────────────────────────

describe("validateApplication", () => {
  it("accepts a valid application", () => {
    const result = validateApplication({
      status: "interested",
      match_score: 80,
      priority: 2,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects missing status", () => {
    const result = validateApplication({});
    expect(result.issues).toContain("missing status");
  });

  it("rejects invalid status values", () => {
    const result = validateApplication({ status: "pending" });
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("invalid status")]),
    );
  });

  it("accepts applied without cover letter (cover letters are optional)", () => {
    const result = validateApplication({ status: "applied" });
    expect(result.issues).not.toContain("applied without cover letter");
  });

  it("accepts applied with a good cover letter", () => {
    const result = validateApplication({
      status: "applied",
      cover_letter: makeGoodLetter(),
      match_score: 75,
      priority: 2,
    });
    expect(result.valid).toBe(true);
  });

  it("flags out-of-range match_score", () => {
    expect(validateApplication({ status: "interested", match_score: -1 }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining("match_score out of range")]),
    );
    expect(validateApplication({ status: "interested", match_score: 150 }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining("match_score out of range")]),
    );
  });

  it("flags out-of-range priority", () => {
    expect(validateApplication({ status: "interested", priority: 0 }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining("priority out of range")]),
    );
    expect(validateApplication({ status: "interested", priority: 6 }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining("priority out of range")]),
    );
  });

  it("validates embedded cover letter quality", () => {
    const result = validateApplication({
      status: "interested",
      cover_letter: "Too short",
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("cover letter:")]),
    );
  });
});

// ─── isValidStatusTransition ─────────────────────────────────────────────────

describe("isValidStatusTransition", () => {
  it("allows valid forward transitions", () => {
    expect(isValidStatusTransition("interested", "applied")).toBe(true);
    expect(isValidStatusTransition("applied", "phone_screen")).toBe(true);
    expect(isValidStatusTransition("applied", "interview")).toBe(true);
    expect(isValidStatusTransition("phone_screen", "interview")).toBe(true);
    expect(isValidStatusTransition("interview", "final")).toBe(true);
    expect(isValidStatusTransition("interview", "offer")).toBe(true);
    expect(isValidStatusTransition("final", "offer")).toBe(true);
    expect(isValidStatusTransition("offer", "hired")).toBe(true);
  });

  it("allows rejection from any active state", () => {
    const activeStates = ["interested", "applied", "phone_screen", "interview", "final", "offer"];
    for (const state of activeStates) {
      expect(isValidStatusTransition(state, "rejected"), `${state} -> rejected`).toBe(true);
    }
  });

  it("allows withdrawal from any active state", () => {
    const activeStates = [
      "interested",
      "applied",
      "phone_screen",
      "interview",
      "final",
      "offer",
      "hired",
    ];
    for (const state of activeStates) {
      expect(isValidStatusTransition(state, "withdrawn"), `${state} -> withdrawn`).toBe(true);
    }
  });

  it("disallows backward transitions", () => {
    expect(isValidStatusTransition("applied", "interested")).toBe(false);
    expect(isValidStatusTransition("interview", "applied")).toBe(false);
    expect(isValidStatusTransition("offer", "interview")).toBe(false);
    expect(isValidStatusTransition("hired", "offer")).toBe(false);
  });

  it("disallows transitions from terminal states", () => {
    expect(isValidStatusTransition("rejected", "interested")).toBe(false);
    expect(isValidStatusTransition("rejected", "applied")).toBe(false);
    expect(isValidStatusTransition("withdrawn", "interested")).toBe(false);
    expect(isValidStatusTransition("withdrawn", "applied")).toBe(false);
  });

  it("allows same-state no-op", () => {
    expect(isValidStatusTransition("interested", "interested")).toBe(true);
    expect(isValidStatusTransition("applied", "applied")).toBe(true);
    expect(isValidStatusTransition("rejected", "rejected")).toBe(true);
  });

  it("rejects null/undefined inputs", () => {
    expect(isValidStatusTransition(null, "applied")).toBe(false);
    expect(isValidStatusTransition("interested", null)).toBe(false);
    expect(isValidStatusTransition(undefined, undefined)).toBe(false);
  });

  it("disallows skipping too many stages forward", () => {
    expect(isValidStatusTransition("interested", "interview")).toBe(false);
    expect(isValidStatusTransition("interested", "offer")).toBe(false);
    expect(isValidStatusTransition("interested", "hired")).toBe(false);
  });
});

// ─── checkUrlLiveness ────────────────────────────────────────────────────────

describe("checkUrlLiveness", () => {
  it("returns not alive for empty/null URL", async () => {
    const result = await checkUrlLiveness("");
    expect(result.alive).toBe(false);
    expect(result.reason).toContain("no URL");
  });

  it("returns not alive for null URL", async () => {
    const result = await checkUrlLiveness(null);
    expect(result.alive).toBe(false);
  });

  it("returns not alive for invalid URL", async () => {
    const result = await checkUrlLiveness("not-a-url");
    expect(result.alive).toBe(false);
  });

  it("returns alive for a reachable URL", async () => {
    const result = await checkUrlLiveness("https://httpbin.org/status/200", 10000);
    expect(result.alive).toBe(true);
    expect(result.status).toBe(200);
  }, 15000);

  it("returns not alive for a 404 URL", async () => {
    const result = await checkUrlLiveness("https://httpbin.org/status/404", 10000);
    expect(result.alive).toBe(false);
    expect(result.status).toBe(404);
  }, 15000);

  it("handles timeout gracefully", async () => {
    // Use a very short timeout against a slow endpoint
    const result = await checkUrlLiveness("https://httpbin.org/delay/10", 1000);
    expect(result.alive).toBe(false);
    expect(result.reason).toContain("timeout");
  }, 5000);
});

// ─── Constants sanity checks ─────────────────────────────────────────────────

describe("validation constants", () => {
  it("has sensible length bounds", () => {
    expect(MIN_CL_LENGTH).toBe(800);
    expect(MAX_CL_LENGTH).toBe(1400);
    expect(MIN_CL_LENGTH).toBeLessThan(MAX_CL_LENGTH);
  });

  it("has at least 37 banned patterns", () => {
    expect(BANNED_PATTERNS.length).toBeGreaterThanOrEqual(37);
  });

  it("banned patterns are all RegExp instances", () => {
    for (const p of BANNED_PATTERNS) {
      expect(p).toBeInstanceOf(RegExp);
    }
  });
});
