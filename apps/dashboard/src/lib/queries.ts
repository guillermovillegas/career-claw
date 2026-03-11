import { supabase } from "./supabase";
import type {
  Job,
  Application,
  ApplicationWithJob,
  ApplicationDetail,
  FreelanceProposal,
  AutomationLog,
  CalendarEvent,
  CommunicationLog,
  Database,
} from "./database.types";

type JobPlatform = Database["public"]["Tables"]["jobs"]["Row"]["platform"];
type JobType = Database["public"]["Tables"]["jobs"]["Row"]["job_type"];
type WorkMode = Database["public"]["Tables"]["jobs"]["Row"]["work_mode"];
type ProposalPlatform =
  Database["public"]["Tables"]["freelance_proposals"]["Row"]["platform"];

// ─── Dashboard Metrics ───────────────────────────────────────────────

export async function getDashboardMetrics() {
  const [jobsRes, appsRes, proposalsRes, clientsRes] = await Promise.all([
    supabase.from("jobs").select("id", { count: "exact", head: true }),
    supabase.from("applications").select("id, status"),
    supabase
      .from("freelance_proposals")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);

  const statusCounts: Record<string, number> = {};
  if (appsRes.data) {
    for (const app of appsRes.data) {
      statusCounts[app.status] = (statusCounts[app.status] ?? 0) + 1;
    }
  }

  return {
    totalJobs: jobsRes.count ?? 0,
    totalApplications: appsRes.data?.length ?? 0,
    applicationsByStatus: statusCounts,
    totalProposals: proposalsRes.count ?? 0,
    activeClients: clientsRes.count ?? 0,
  };
}

// ─── Pipeline Data ───────────────────────────────────────────────────

const PIPELINE_STAGES = [
  "interested",
  "applied",
  "phone_screen",
  "interview",
  "final",
  "offer",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export async function getPipelineData(): Promise<
  { stage: PipelineStage; count: number }[]
> {
  const { data } = await supabase.from("applications").select("status");

  const counts: Record<string, number> = {};
  for (const stage of PIPELINE_STAGES) {
    counts[stage] = 0;
  }
  if (data) {
    for (const row of data) {
      if (row.status in counts) {
        counts[row.status]++;
      }
    }
  }

  return PIPELINE_STAGES.map((stage) => ({ stage, count: counts[stage] }));
}

// ─── Top Matches ─────────────────────────────────────────────────────

export async function getTopMatches(limit = 10): Promise<Job[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .not("match_score", "is", null)
    .order("match_score", { ascending: false })
    .limit(limit);

  if (error) {throw error;}
  return (data as Job[]) ?? [];
}

// ─── Recent Activity ─────────────────────────────────────────────────

export async function getRecentActivity(
  limit = 10
): Promise<AutomationLog[]> {
  const { data, error } = await supabase
    .from("automation_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {throw error;}
  return (data as AutomationLog[]) ?? [];
}

// ─── Automation Logs (full history) ──────────────────────────────────

export async function getAutomationLogs(
  limit = 50
): Promise<AutomationLog[]> {
  const { data, error } = await supabase
    .from("automation_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {throw error;}
  return (data as AutomationLog[]) ?? [];
}

// ─── Upcoming Events & Follow-ups ────────────────────────────────────

export async function getUpcomingEvents(
  limit = 10
): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .gte("start_time", new Date().toISOString())
    .eq("status", "scheduled")
    .order("start_time", { ascending: true })
    .limit(limit);

  if (error) {throw error;}
  return (data as CalendarEvent[]) ?? [];
}

export async function getOverdueFollowups(): Promise<ApplicationWithJob[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*, jobs(title, company, location, salary_min, salary_max)")
    .lt("next_followup_date", new Date().toISOString().split("T")[0])
    .not("status", "in", '("rejected","withdrawn","hired")')
    .order("next_followup_date", { ascending: true });

  if (error) {throw error;}
  return (data as unknown as ApplicationWithJob[]) ?? [];
}

// ─── Jobs Page ───────────────────────────────────────────────────────

export interface JobFilters {
  platform?: string;
  job_type?: string;
  work_mode?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

// Job with the best application status joined in
export type JobWithAppStatus = Job & {
  application_status: string | null;
  application_id: string | null;
  is_closed: boolean; // true when deadline is set to a past date (link was dead)
};

export async function getJobs(
  filters: JobFilters = {}
): Promise<JobWithAppStatus[]> {
  // Exclude freelance platforms — those belong in the Proposals tab
  let query = supabase
    .from("jobs")
    .select("*, applications(id, status)")
    .not("platform", "in", '("upwork","fiverr")');

  if (filters.platform) {
    query = query.eq("platform", filters.platform as JobPlatform);
  }
  if (filters.job_type) {
    query = query.eq("job_type", filters.job_type as NonNullable<JobType>);
  }
  if (filters.work_mode) {
    query = query.eq("work_mode", filters.work_mode as NonNullable<WorkMode>);
  }

  const sortCol = filters.sort_by ?? "created_at";
  const sortDir = filters.sort_dir ?? "desc";
  query = query.order(sortCol, { ascending: sortDir === "asc" });

  const { data, error } = await query;
  if (error) {throw error;}

  // Flatten: pick the most advanced application status per job
  const STATUS_RANK: Record<string, number> = {
    hired: 8, offer: 7, final: 6, interview: 5,
    phone_screen: 4, applied: 3, interested: 2, withdrawn: 1, rejected: 0,
  };

  return ((data ?? []) as (Job & { applications: { id: string; status: string }[] | null })[]).map(
    (job) => {
      const apps = job.applications ?? [];
      let best: { id: string; status: string } | null = null;
      for (const app of apps) {
        if (!best || (STATUS_RANK[app.status] ?? -1) > (STATUS_RANK[best.status] ?? -1)) {
          best = app;
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { applications: _apps, ...jobFields } = job;
      const today = new Date().toISOString().split("T")[0];
      const isClosed = Boolean(job.deadline && job.deadline < today);
      return {
        ...jobFields,
        application_status: best?.status ?? null,
        application_id: best?.id ?? null,
        is_closed: isClosed,
      } as JobWithAppStatus;
    }
  );
}

// ─── Job Detail ──────────────────────────────────────────────────────

export type JobDetailApplication = Application & {
  cover_letter: string | null;
  notes: string | null;
};

export type JobDetail = Job & {
  applications: JobDetailApplication[];
};

export async function getJobDetail(id: string): Promise<JobDetail | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*, applications(*)")
    .eq("id", id)
    .single();

  if (error) {
    // PGRST116 = row not found — return null so the page can call notFound()
    if (error.code === "PGRST116") {return null;}
    throw error;
  }

  return data as unknown as JobDetail;
}

// Fetch automation_logs from within 2 hours of when the job was created.
// This surfaces the cron run that discovered the job.
export async function getJobAutomationContext(
  jobCreatedAt: string
): Promise<AutomationLog[]> {
  const center = new Date(jobCreatedAt).getTime();
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const from = new Date(center - TWO_HOURS_MS).toISOString();
  const to = new Date(center + TWO_HOURS_MS).toISOString();

  const { data, error } = await supabase
    .from("automation_logs")
    .select("*")
    .gte("created_at", from)
    .lte("created_at", to)
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) {throw error;}
  return (data as AutomationLog[]) ?? [];
}

// ─── Applications Page ──────────────────────────────────────────────

export async function getApplications(): Promise<ApplicationWithJob[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*, jobs(title, company, location, salary_min, salary_max, work_mode)")
    .order("created_at", { ascending: false });

  if (error) {throw error;}
  return (data as unknown as ApplicationWithJob[]) ?? [];
}

// ─── Freelance Job Leads (upwork/fiverr from jobs table) ─────────────

export async function getFreelanceJobLeads(): Promise<Job[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .in("platform", ["upwork", "fiverr"])
    .order("match_score", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {throw error;}
  return (data as Job[]) ?? [];
}

// ─── Proposals Page ─────────────────────────────────────────────────

export interface ProposalFilters {
  platform?: string;
}

export async function getProposals(
  filters: ProposalFilters = {}
): Promise<FreelanceProposal[]> {
  let query = supabase
    .from("freelance_proposals")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters.platform) {
    query = query.eq(
      "platform",
      filters.platform as ProposalPlatform
    );
  }

  const { data, error } = await query;
  if (error) {throw error;}
  return (data as FreelanceProposal[]) ?? [];
}

// ─── Communication Logs ─────────────────────────────────────────────

export async function getCommunicationLogs(
  limit = 100
): Promise<CommunicationLog[]> {
  const { data, error } = await supabase
    .from("communication_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {throw error;}
  return (data as CommunicationLog[]) ?? [];
}

export async function getCommunicationLogsForEntity(
  entityType: "application" | "client" | "contact" | "proposal",
  entityId: string
): Promise<CommunicationLog[]> {
  const { data, error } = await supabase
    .from("communication_log")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (error) {throw error;}
  return (data as CommunicationLog[]) ?? [];
}

// ─── Application Detail ─────────────────────────────────────────────

export async function getApplicationDetail(
  id: string
): Promise<ApplicationDetail | null> {
  const { data, error } = await supabase
    .from("applications")
    .select("*, jobs(*)")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {return null;}
    throw error;
  }
  return data as unknown as ApplicationDetail;
}

// Automation logs around an application's created_at
export async function getApplicationAutomationContext(
  appCreatedAt: string
): Promise<AutomationLog[]> {
  const center = new Date(appCreatedAt).getTime();
  const WINDOW_MS = 60 * 60 * 1000; // 1 hour
  const from = new Date(center - WINDOW_MS).toISOString();
  const to = new Date(center + WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from("automation_logs")
    .select("*")
    .gte("created_at", from)
    .lte("created_at", to)
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {throw error;}
  return (data as AutomationLog[]) ?? [];
}

// Form Q&A for a specific application (from automation_logs details.form_qa)
export interface FormQAEntry {
  question: string;
  answer: string;
}

export async function getApplicationFormQA(
  appCreatedAt: string,
  companyName: string
): Promise<FormQAEntry[]> {
  const center = new Date(appCreatedAt).getTime();
  const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
  const from = new Date(center - WINDOW_MS).toISOString();
  const to = new Date(center + WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from("automation_logs")
    .select("details")
    .eq("action_type", "application_submit")
    .gte("created_at", from)
    .lte("created_at", to)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {throw error;}

  const companyLower = companyName.toLowerCase();

  for (const row of data ?? []) {
    const details = parseLogDetails(row.details);
    if (!details) {continue;}

    const formQa = details.form_qa;
    if (!formQa || typeof formQa !== "object") {continue;}

    // form_qa is keyed by company name
    for (const [company, qaPairs] of Object.entries(
      formQa as Record<string, unknown>
    )) {
      if (company.toLowerCase() !== companyLower) {continue;}
      if (!Array.isArray(qaPairs)) {continue;}

      const entries: FormQAEntry[] = [];
      for (const pair of qaPairs) {
        if (
          pair &&
          typeof pair === "object" &&
          "q" in pair &&
          "a" in pair
        ) {
          const typed = pair as { q: string; a: string };
          entries.push({ question: String(typed.q), answer: String(typed.a) });
        }
      }
      if (entries.length > 0) {return entries;}
    }
  }

  return [];
}

// ─── Active Responses (Interview Tracking) ─────────────────────────

/** Application with job data including URL (for response cards) */
type ApplicationWithJobUrl = Application & {
  jobs: Pick<
    Job,
    "title" | "company" | "location" | "salary_min" | "salary_max" | "work_mode" | "url"
  > | null;
};

/** Apps in active stages (applied+) with their communication logs, sorted by urgency */
export type ResponseWithComms = ApplicationWithJobUrl & {
  comms: CommunicationLog[];
  events: CalendarEvent[];
};

export async function getActiveResponses(): Promise<ResponseWithComms[]> {
  // Fetch apps in non-terminal, post-interested stages
  const { data: rawApps, error } = await supabase
    .from("applications")
    .select("*, jobs(title, company, location, salary_min, salary_max, work_mode, url)")
    .in("status", ["applied", "phone_screen", "interview", "final", "offer", "hired"])
    .order("updated_at", { ascending: false });

  if (error) {throw error;}
  const apps = (rawApps ?? []) as unknown as ApplicationWithJobUrl[];
  if (apps.length === 0) {return [];}

  const appIds = apps.map((a) => a.id);

  // Fetch all communication logs for these apps
  const { data: rawComms } = await supabase
    .from("communication_log")
    .select("*")
    .eq("entity_type", "application")
    .in("entity_id", appIds)
    .order("created_at", { ascending: false });
  const commsData = (rawComms ?? []) as CommunicationLog[];

  // Fetch all calendar events for these apps
  const { data: rawEvents } = await supabase
    .from("calendar_events")
    .select("*")
    .in("application_id", appIds)
    .order("start_time", { ascending: true });
  const eventsData = (rawEvents ?? []) as CalendarEvent[];

  const commsMap = new Map<string, CommunicationLog[]>();
  for (const c of commsData) {
    const arr = commsMap.get(c.entity_id) ?? [];
    arr.push(c);
    commsMap.set(c.entity_id, arr);
  }

  const eventsMap = new Map<string, CalendarEvent[]>();
  for (const e of eventsData) {
    if (e.application_id) {
      const arr = eventsMap.get(e.application_id) ?? [];
      arr.push(e);
      eventsMap.set(e.application_id, arr);
    }
  }

  // Sort: interview/phone_screen/final/offer first, then by most recent update
  const STAGE_URGENCY: Record<string, number> = {
    offer: 6, final: 5, interview: 4, phone_screen: 3, hired: 2, applied: 1,
  };

  return apps
    .map((app) => ({
      ...app,
      comms: commsMap.get(app.id) ?? [],
      events: eventsMap.get(app.id) ?? [],
    }))
    .toSorted((a, b) => {
      const urgA = STAGE_URGENCY[a.status] ?? 0;
      const urgB = STAGE_URGENCY[b.status] ?? 0;
      if (urgA !== urgB) {return urgB - urgA;}
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
}

function parseLogDetails(
  details: Application["notes"] | AutomationLog["details"]
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
