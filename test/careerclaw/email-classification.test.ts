import { describe, expect, it } from "vitest";

/**
 * Tests for email classification logic from track-email-responses.mjs.
 * Since those functions aren't exported, we replicate the patterns here
 * and test the classification logic directly.
 */

// ─── Replicated patterns from track-email-responses.mjs ──────────────────────

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
];

const INTERVIEW_PATTERNS = [
  /schedule (a|an|your) (phone|video|virtual|technical|onsite|on-site|final)?\s*interview/i,
  /like to (invite|schedule) you/i,
  /next (round|step|stage)/i,
  /meet with (the|our) (team|hiring|manager)/i,
  /phone screen/i,
  /book a time/i,
  /calendly\.com/i,
  /pick a (time|slot)/i,
  /availability for (a |an )?(call|chat|interview|meeting)/i,
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

function classifyEmail(subject: string, body: string): string {
  const text = `${subject} ${body}`;
  for (const p of OFFER_PATTERNS) {
    if (p.test(text)) {
      return "offer";
    }
  }
  for (const p of INTERVIEW_PATTERNS) {
    if (p.test(text)) {
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
  return "generic";
}

function classificationToStatus(classification: string): string | null {
  switch (classification) {
    case "rejection":
      return "rejected";
    case "interview":
      return "interview";
    case "assessment":
      return "phone_screen";
    case "offer":
      return "offer";
    default:
      return null;
  }
}

function emailDomain(email: string): string | null {
  const m = email.match(/@([a-z0-9.-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function coreDomain(domain: string | null): string | null {
  if (!domain) {
    return null;
  }
  const parts = domain.split(".");
  if (parts.length >= 3 && parts[parts.length - 2].length <= 3) {
    return parts[parts.length - 3];
  }
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

// ─── classifyEmail ───────────────────────────────────────────────────────────

describe("classifyEmail", () => {
  it("detects rejection emails", () => {
    expect(
      classifyEmail(
        "Update on your application",
        "We've decided to move forward with other candidates",
      ),
    ).toBe("rejection");
    expect(
      classifyEmail("Application Update", "Unfortunately, you were not selected for this position"),
    ).toBe("rejection");
    expect(
      classifyEmail(
        "RE: Product Manager Role",
        "After careful consideration, we've decided not to proceed",
      ),
    ).toBe("rejection");
    expect(classifyEmail("", "We regret to inform you that the position has been filled")).toBe(
      "rejection",
    );
    expect(classifyEmail("", "Your application was unsuccessful at this time")).toBe("rejection");
    expect(classifyEmail("", "We chose a different candidate for the role")).toBe("rejection");
  });

  it("detects interview invitations", () => {
    expect(
      classifyEmail("Interview Invitation", "We would like to schedule a phone interview"),
    ).toBe("interview");
    expect(classifyEmail("Next Steps", "We'd like to invite you to the next round")).toBe(
      "interview",
    );
    expect(classifyEmail("", "Please book a time at calendly.com/recruiter")).toBe("interview");
    expect(classifyEmail("", "Could you share your availability for a call?")).toBe("interview");
    expect(classifyEmail("Phone Screen", "We'd like to schedule a phone screen with you")).toBe(
      "interview",
    );
  });

  it("detects assessment requests", () => {
    expect(classifyEmail("Technical Assessment", "Please complete this coding challenge")).toBe(
      "assessment",
    );
    expect(classifyEmail("Your Assessment", "We use HackerRank for our evaluation process")).toBe(
      "assessment",
    );
    expect(classifyEmail("", "Please complete the technical assessment within 48 hours")).toBe(
      "assessment",
    );
    expect(classifyEmail("Take-Home Assignment", "Attached is a take-home assignment")).toBe(
      "assessment",
    );
    expect(classifyEmail("", "Please log in to Codility to begin your test")).toBe("assessment");
  });

  it("detects offer emails", () => {
    expect(classifyEmail("Offer Letter", "We are pleased to offer you the position")).toBe("offer");
    expect(classifyEmail("Congratulations!", "Please find attached your formal offer")).toBe(
      "offer",
    );
    expect(classifyEmail("", "We would like to extend an offer to join our team")).toBe("offer");
    expect(classifyEmail("Your Offer", "Here is your compensation package")).toBe("offer");
  });

  it("returns generic for unclassified emails", () => {
    expect(classifyEmail("Meeting Notes", "Here are the notes from yesterday's sync")).toBe(
      "generic",
    );
    expect(classifyEmail("Weekly Update", "Team performance metrics for this week")).toBe(
      "generic",
    );
    expect(classifyEmail("Thanks", "Thank you for your interest in our company")).toBe("generic");
  });

  it("prioritizes offer over interview when both match", () => {
    // "start date" matches offer, "schedule" matches interview
    expect(
      classifyEmail(
        "Offer Details",
        "Your start date would be March 15, we'd like to schedule an onboarding call",
      ),
    ).toBe("offer");
  });

  it("prioritizes interview over assessment", () => {
    // "next round" matches interview, which is checked before assessment
    expect(classifyEmail("", "Moving to the next round of our process")).toBe("interview");
  });
});

// ─── classificationToStatus ─────────────────────────────────────────────────

describe("classificationToStatus", () => {
  it("maps rejection to rejected", () => {
    expect(classificationToStatus("rejection")).toBe("rejected");
  });

  it("maps interview to interview", () => {
    expect(classificationToStatus("interview")).toBe("interview");
  });

  it("maps assessment to phone_screen", () => {
    expect(classificationToStatus("assessment")).toBe("phone_screen");
  });

  it("maps offer to offer", () => {
    expect(classificationToStatus("offer")).toBe("offer");
  });

  it("returns null for generic", () => {
    expect(classificationToStatus("generic")).toBe(null);
  });

  it("returns null for unknown", () => {
    expect(classificationToStatus("unknown")).toBe(null);
  });
});

// ─── emailDomain ────────────────────────────────────────────────────────────

describe("emailDomain", () => {
  it("extracts domain from email", () => {
    expect(emailDomain("recruiter@stripe.com")).toBe("stripe.com");
  });

  it("handles subdomains", () => {
    expect(emailDomain("noreply@mail.greenhouse.io")).toBe("mail.greenhouse.io");
  });

  it("handles complex domains", () => {
    expect(emailDomain("hr@company.co.uk")).toBe("company.co.uk");
  });

  it("returns null for invalid email", () => {
    expect(emailDomain("not-an-email")).toBe(null);
  });

  it("lowercases the domain", () => {
    expect(emailDomain("user@COMPANY.COM")).toBe("company.com");
  });
});

// ─── coreDomain ─────────────────────────────────────────────────────────────

describe("coreDomain", () => {
  it("extracts core from simple domain", () => {
    expect(coreDomain("stripe.com")).toBe("stripe");
  });

  it("extracts core from subdomain", () => {
    expect(coreDomain("mail.stripe.com")).toBe("stripe");
  });

  it("handles co.uk style TLDs", () => {
    expect(coreDomain("company.co.uk")).toBe("company");
  });

  it("handles deep subdomains", () => {
    expect(coreDomain("noreply.mail.reddit.com")).toBe("reddit");
  });

  it("returns null for null input", () => {
    expect(coreDomain(null)).toBe(null);
  });

  it("handles single-part domain", () => {
    expect(coreDomain("localhost")).toBe("localhost");
  });
});
