import { supabase } from "./supabase";
import type { Json } from "./database.types";

// ─── Types ──────────────────────────────────────────────────────────

export interface DailySummaryStats {
  jobsAdded: number;
  applicationsCreated: number;
  applicationsSubmitted: number;
  failedSubmissions: number;
}

export interface SubmittedApplication {
  id: string;
  company: string;
  title: string;
  platform: string;
  matchScore: number | null;
  status: string;
  applicationDate: string | null;
  createdAt: string;
  url: string | null;
}

export interface FormQA {
  question: string;
  answer: string;
}

export interface FormQAByCompany {
  company: string;
  questions: FormQA[];
}

export interface FailedSubmission {
  id: string;
  company: string;
  title: string;
  failureReason: string;
  url: string | null;
  createdAt: string;
}

// ─── Date helpers ───────────────────────────────────────────────────

function dayStart(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

function dayEnd(dateStr: string): string {
  return `${dateStr}T23:59:59.999Z`;
}

// ─── Queries ────────────────────────────────────────────────────────

export async function getDailySummaryStats(
  date: string
): Promise<DailySummaryStats> {
  const start = dayStart(date);
  const end = dayEnd(date);

  const [jobsRes, appsCreatedRes, appsSubmittedRes, failedRes] =
    await Promise.all([
      // Jobs added today
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", start)
        .lte("created_at", end),

      // Applications created today
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .gte("created_at", start)
        .lte("created_at", end),

      // Applications submitted today (status=applied, application_date matches)
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "applied")
        .eq("application_date", date),

      // Failed submissions from automation_logs (action_type=application_submit, success=false)
      supabase
        .from("automation_logs")
        .select("id", { count: "exact", head: true })
        .eq("action_type", "application_submit")
        .eq("success", false)
        .gte("created_at", start)
        .lte("created_at", end),
    ]);

  return {
    jobsAdded: jobsRes.count ?? 0,
    applicationsCreated: appsCreatedRes.count ?? 0,
    applicationsSubmitted: appsSubmittedRes.count ?? 0,
    failedSubmissions: failedRes.count ?? 0,
  };
}

export async function getSubmittedApplications(
  date: string
): Promise<SubmittedApplication[]> {
  const { data, error } = await supabase
    .from("applications")
    .select(
      "id, status, platform, match_score, application_date, created_at, jobs(title, company, url)"
    )
    .eq("status", "applied")
    .eq("application_date", date)
    .order("created_at", { ascending: false });

  if (error) {throw error;}

  type AppRow = {
    id: string;
    status: string;
    platform: string;
    match_score: number | null;
    application_date: string | null;
    created_at: string;
    jobs: { title: string; company: string; url: string | null } | null;
  };

  return ((data ?? []) as unknown as AppRow[]).map((row) => ({
    id: row.id,
    company: row.jobs?.company ?? "Unknown",
    title: row.jobs?.title ?? "Unknown Role",
    platform: row.platform,
    matchScore: row.match_score,
    status: row.status,
    applicationDate: row.application_date,
    createdAt: row.created_at,
    url: row.jobs?.url ?? null,
  }));
}

export async function getFormQALogs(
  date: string
): Promise<FormQAByCompany[]> {
  const start = dayStart(date);
  const end = dayEnd(date);

  const { data, error } = await supabase
    .from("automation_logs")
    .select("details")
    .eq("action_type", "application_submit")
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: false });

  if (error) {throw error;}

  const companiesMap = new Map<string, FormQA[]>();

  for (const row of data ?? []) {
    const details = parseDetails(row.details);
    if (!details) {continue;}

    const formQa = details.form_qa;
    if (!formQa || typeof formQa !== "object") {continue;}

    for (const [company, qaPairs] of Object.entries(
      formQa as Record<string, unknown>
    )) {
      if (!Array.isArray(qaPairs)) {continue;}
      const existing = companiesMap.get(company) ?? [];
      for (const pair of qaPairs) {
        if (
          pair &&
          typeof pair === "object" &&
          "q" in pair &&
          "a" in pair
        ) {
          const typedPair = pair as { q: string; a: string };
          existing.push({
            question: String(typedPair.q),
            answer: String(typedPair.a),
          });
        }
      }
      companiesMap.set(company, existing);
    }
  }

  return Array.from(companiesMap.entries()).map(([company, questions]) => ({
    company,
    questions,
  }));
}

export async function getFailedSubmissions(
  date: string
): Promise<FailedSubmission[]> {
  const start = dayStart(date);
  const end = dayEnd(date);

  // Two sources of failed submissions:
  // 1. automation_logs with action_type=application_submit and success=false
  // 2. applications with notes containing "Auto-submit failed"

  const [logsRes, appsRes] = await Promise.all([
    supabase
      .from("automation_logs")
      .select("id, details, error_message, created_at")
      .eq("action_type", "application_submit")
      .eq("success", false)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false }),

    supabase
      .from("applications")
      .select(
        "id, notes, created_at, jobs(title, company, url)"
      )
      .like("notes", "%Auto-submit failed%")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false }),
  ]);

  if (logsRes.error) {throw logsRes.error;}
  if (appsRes.error) {throw appsRes.error;}

  const failures: FailedSubmission[] = [];
  const seen = new Set<string>();

  // From automation logs
  for (const log of logsRes.data ?? []) {
    const details = parseDetails(log.details);
    const company = extractString(details, "company") ?? "Unknown";
    const title = extractString(details, "title") ?? "Unknown Role";
    const url = extractString(details, "url") ?? null;
    const key = `${company}:${title}`;
    if (seen.has(key)) {continue;}
    seen.add(key);

    failures.push({
      id: log.id,
      company,
      title,
      failureReason:
        log.error_message ??
        extractString(details, "error") ??
        "Unknown error",
      url,
      createdAt: log.created_at,
    });
  }

  type AppFailRow = {
    id: string;
    notes: string | null;
    created_at: string;
    jobs: { title: string; company: string; url: string | null } | null;
  };

  // From applications with "Auto-submit failed" notes
  for (const app of (appsRes.data ?? []) as unknown as AppFailRow[]) {
    const company = app.jobs?.company ?? "Unknown";
    const title = app.jobs?.title ?? "Unknown Role";
    const key = `${company}:${title}`;
    if (seen.has(key)) {continue;}
    seen.add(key);

    failures.push({
      id: app.id,
      company,
      title,
      failureReason: extractFailureReason(app.notes),
      url: app.jobs?.url ?? null,
      createdAt: app.created_at,
    });
  }

  return failures;
}

// ─── Helpers ────────────────────────────────────────────────────────

function parseDetails(
  details: Json
): Record<string, unknown> | null {
  if (typeof details === "string") {
    try {
      const parsed: unknown = JSON.parse(details);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  if (details && typeof details === "object" && !Array.isArray(details)) {
    return details as Record<string, unknown>;
  }
  return null;
}

function extractString(
  obj: Record<string, unknown> | null,
  key: string
): string | null {
  if (!obj) {return null;}
  const val = obj[key];
  if (typeof val === "string" && val.length > 0) {return val;}
  return null;
}

function extractFailureReason(notes: string | null): string {
  if (!notes) {return "Unknown error";}
  // Try to extract the reason after "Auto-submit failed:"
  const match = notes.match(/Auto-submit failed:\s*(.+)/i);
  if (match) {return match[1].trim();}
  return notes;
}
