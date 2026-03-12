import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getApplicationDetail,
  getApplicationAutomationContext,
  getCommunicationLogsForEntity,
  getApplicationFormQA,
} from "@/lib/queries";
import type { FormQAEntry } from "@/lib/queries";
import type { ApplicationDetail, CommunicationLog, AutomationLog } from "@/lib/database.types";
import {
  formatDateTime,
  formatDate,
  formatSalaryRange,
  formatLabel,
  formatRelativeTime,
} from "@/lib/format";
import { ScoreBadge } from "@/components/score-badge";
import { StatusBadge } from "@/components/status-badge";
import { PriorityStars } from "@/components/priority-stars";
import { CopyButton } from "./copy-button";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ApplicationDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [app, commsLogs] = await Promise.all([
    getApplicationDetail(id),
    getCommunicationLogsForEntity("application", id),
  ]);

  if (!app) {
    notFound();
  }

  const job = app.jobs;

  const [automationLogs, formQA] = await Promise.all([
    getApplicationAutomationContext(app.created_at),
    getApplicationFormQA(app.created_at, job?.company ?? ""),
  ]);

  return (
    <div className="space-y-6 max-w-7xl">
      <ApplicationHeader app={app} job={job} />

      {/* Status Pipeline */}
      <StatusPipeline currentStatus={app.status} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Timeline + Application Fields + Cover Letter (8/12) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Timeline */}
          <SectionCard title="Timeline">
            <ApplicationTimeline
              app={app}
              commsLogs={commsLogs}
              automationLogs={automationLogs}
            />
          </SectionCard>

          {/* Application Form Fields */}
          <ApplicationFormFields app={app} formQA={formQA} />

          {/* Cover Letter */}
          {app.cover_letter && (
            <CoverLetterCard coverLetter={app.cover_letter} />
          )}

          {/* Notes & Learnings */}
          <NotesAndLearningsCard app={app} automationLogs={automationLogs} />
        </div>

        {/* Right column: Details + Communication Log (4/12) */}
        <div className="lg:col-span-4 space-y-6">
          <SectionCard title="Details">
            <CompanyInfoSidebar app={app} job={job} />
          </SectionCard>

          {commsLogs.length > 0 && (
            <SectionCard title="Communication Log">
              <CommunicationLogTable logs={commsLogs} />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Section Card wrapper ---------------------------------------------------

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-neutral-800 bg-neutral-900/50">
        <h2 className="text-xs font-medium uppercase tracking-widest text-neutral-400">
          {title}
        </h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ---- Header ----------------------------------------------------------------

function ApplicationHeader({
  app,
  job,
}: {
  app: ApplicationDetail;
  job: ApplicationDetail["jobs"];
}) {
  return (
    <div className="space-y-1">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs">
        <Link
          href="/jobs"
          className="text-neutral-400 hover:text-neutral-300 transition-colors"
        >
          Jobs
        </Link>
        <span className="text-neutral-500">/</span>
        <Link
          href="/applications"
          className="text-neutral-400 hover:text-neutral-300 transition-colors"
        >
          Applications
        </Link>
        <span className="text-neutral-500">/</span>
        <span className="text-neutral-400">{job?.company ?? "Unknown"}</span>
      </div>

      {/* Title row */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-white leading-tight">
            {job?.title ?? "Unknown Role"}
          </h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            {job?.company ?? "Unknown Company"}
            {job?.location ? ` -- ${job.location}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <ScoreBadge score={app.match_score} />
          <PlatformBadge platform={app.platform} />
          {job?.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-emerald-400 transition-colors"
              title="Open job posting"
            >
              <ExternalLinkIcon className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Status Pipeline --------------------------------------------------------

const STATUS_PIPELINE = [
  { key: "interested", label: "Interested", color: "slate" },
  { key: "applied", label: "Applied", color: "blue" },
  { key: "phone_screen", label: "Screen", color: "cyan" },
  { key: "interview", label: "Interview", color: "amber" },
  { key: "final", label: "Final", color: "purple" },
  { key: "offer", label: "Offer", color: "emerald" },
  { key: "hired", label: "Hired", color: "emerald" },
] as const;

const TERMINAL_STATUSES: Record<string, { label: string; color: string }> = {
  rejected: { label: "Rejected", color: "rose" },
  withdrawn: { label: "Withdrawn", color: "slate" },
};

function StatusPipeline({ currentStatus }: { currentStatus: string }) {
  const terminalStatus = TERMINAL_STATUSES[currentStatus];
  const currentIdx = STATUS_PIPELINE.findIndex((s) => s.key === currentStatus);

  const activeColors: Record<string, string> = {
    slate: "bg-neutral-500 text-white",
    blue: "bg-blue-500 text-white",
    cyan: "bg-cyan-500 text-white",
    amber: "bg-amber-500 text-white",
    purple: "bg-purple-500 text-white",
    emerald: "bg-emerald-500 text-white",
  };

  const passedColors: Record<string, string> = {
    slate: "bg-neutral-500/30 text-neutral-400",
    blue: "bg-blue-500/20 text-blue-400",
    cyan: "bg-cyan-500/20 text-cyan-400",
    amber: "bg-amber-500/20 text-amber-400",
    purple: "bg-purple-500/20 text-purple-400",
    emerald: "bg-emerald-500/20 text-emerald-400",
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STATUS_PIPELINE.map((stage, idx) => {
        const isActive = stage.key === currentStatus;
        const isPassed = currentIdx >= 0 && idx < currentIdx;

        let className =
          "px-3 py-1.5 rounded-full text-xs font-medium transition-all ";
        if (isActive) {
          className += activeColors[stage.color] + " ring-2 ring-offset-1 ring-offset-slate-900 ring-" + stage.color + "-500/50";
        } else if (isPassed) {
          className += passedColors[stage.color];
        } else {
          className += "bg-neutral-800/60 text-neutral-400";
        }

        return (
          <div key={stage.key} className="flex items-center gap-1">
            <span className={className}>{stage.label}</span>
            {idx < STATUS_PIPELINE.length - 1 && (
              <span
                className={`w-4 h-px ${
                  isPassed || isActive ? "bg-neutral-500" : "bg-neutral-800"
                }`}
              />
            )}
          </div>
        );
      })}

      {terminalStatus && (
        <>
          <span className="w-6 h-px bg-neutral-700 mx-1" />
          <span
            className={`px-3 py-1.5 rounded-full text-xs font-medium ring-2 ring-offset-1 ring-offset-slate-900 ${
              terminalStatus.color === "rose"
                ? "bg-rose-500 text-white ring-rose-500/50"
                : "bg-neutral-500 text-white ring-neutral-500/50"
            }`}
          >
            {terminalStatus.label}
          </span>
        </>
      )}
    </div>
  );
}

// ---- Application Form Fields ------------------------------------------------

function ApplicationFormFields({
  app,
  formQA,
}: {
  app: ApplicationDetail;
  formQA: FormQAEntry[];
}) {
  // Collect all fields that were filled in the application
  const fields: { label: string; value: string; category: string }[] = [];

  // Contact / identity fields — loaded from config/profile.json at build time
  // (These are placeholders; the actual values come from the user's profile config)
  if (app.status !== "interested") {
    fields.push(
      { label: "Full Name", value: "From profile.json", category: "Contact" },
      { label: "Email", value: "From profile.json", category: "Contact" },
      { label: "Phone", value: "From profile.json", category: "Contact" },
      { label: "Location", value: "From profile.json", category: "Contact" },
    );
  }

  // Online profiles
  if (app.status !== "interested") {
    fields.push(
      { label: "LinkedIn", value: "From profile.json", category: "Profiles" },
      { label: "GitHub", value: "From profile.json", category: "Profiles" },
      { label: "Website", value: "From profile.json", category: "Profiles" },
    );
  }

  // Resume
  if (app.resume_version) {
    fields.push({
      label: "Resume Version",
      value: app.resume_version,
      category: "Documents",
    });
  } else if (app.status !== "interested") {
    fields.push({
      label: "Resume",
      value: "resume.pdf",
      category: "Documents",
    });
  }

  // Cover letter (just note it exists)
  if (app.cover_letter) {
    const wordCount = app.cover_letter
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    fields.push({
      label: "Cover Letter",
      value: `${wordCount} words`,
      category: "Documents",
    });
  }

  // Work authorization — from config/profile.json
  if (app.status !== "interested") {
    fields.push(
      {
        label: "Work Authorization",
        value: "From profile.json",
        category: "Eligibility",
      },
      {
        label: "Sponsorship Required",
        value: "From profile.json",
        category: "Eligibility",
      },
    );
  }

  // Job-specific
  if (app.salary_expectation) {
    fields.push({
      label: "Salary Expectation",
      value: `$${app.salary_expectation.toLocaleString()}`,
      category: "Compensation",
    });
  }

  if (app.source) {
    fields.push({
      label: "Source",
      value: app.source,
      category: "Meta",
    });
  }

  if (fields.length === 0 && formQA.length === 0) {return null;}

  // Group by category
  const categories = new Map<string, typeof fields>();
  for (const field of fields) {
    const existing = categories.get(field.category) ?? [];
    existing.push(field);
    categories.set(field.category, existing);
  }

  return (
    <SectionCard title="Application Form">
      <div className="space-y-4">
        {/* Standard fields by category */}
        {Array.from(categories.entries()).map(([category, categoryFields]) => (
          <div key={category}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              {category}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {categoryFields.map((f) => (
                <div key={f.label} className="flex justify-between gap-2 text-sm py-0.5">
                  <span className="text-neutral-400 shrink-0">{f.label}</span>
                  <span className="text-neutral-300 text-right truncate">{f.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Form Q&A from automation logs */}
        {formQA.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Custom Questions
            </h3>
            <div className="space-y-2">
              {formQA.map((qa, idx) => (
                <div
                  key={idx}
                  className="rounded-lg bg-neutral-900/60 p-2.5"
                >
                  <p className="text-sm text-neutral-400">
                    Q: {qa.question}
                  </p>
                  <p className="text-sm text-neutral-300 mt-0.5">
                    A: {qa.answer || "(empty)"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ---- Notes & Learnings Card -------------------------------------------------

function NotesAndLearningsCard({
  app,
  automationLogs,
}: {
  app: ApplicationDetail;
  automationLogs: AutomationLog[];
}) {
  const noteEntries = app.notes
    ? app.notes
        .split("|")
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
    : [];

  // Extract submission method and failures from automation logs
  const submitLogs = automationLogs.filter(
    (l) => l.action_type === "application_submit"
  );
  const failedLogs = submitLogs.filter((l) => !l.success);
  const successLogs = submitLogs.filter((l) => l.success);

  // Derive submission method from notes or logs
  let submissionMethod = "Manual";
  for (const note of noteEntries) {
    if (note.toLowerCase().includes("playwright")) {
      submissionMethod = "Playwright (headless Chromium)";
      break;
    }
    if (note.toLowerCase().includes("auto-submit")) {
      submissionMethod = "Auto-submit via Playwright";
      break;
    }
  }
  if (
    submissionMethod === "Manual" &&
    successLogs.some((l) => l.platform === "greenhouse" || l.platform === "lever")
  ) {
    submissionMethod = "Playwright (headless Chromium)";
  }

  // Derive ATS platform
  let ats = app.platform === "direct" ? "Direct" : formatLabel(app.platform);
  for (const note of noteEntries) {
    const match = note.match(
      /\b(greenhouse|lever|ashby|icims|workday|bamboohr|jazz)\b/i
    );
    if (match) {
      ats = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      break;
    }
  }

  if (noteEntries.length === 0 && submitLogs.length === 0) {return null;}

  return (
    <SectionCard title="Notes & Learnings">
      <div className="space-y-4">
        {/* Submission Method */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
            Submission
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-neutral-400">Method</span>
              <span className="text-neutral-300">{submissionMethod}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-neutral-400">ATS</span>
              <span className="text-neutral-300">{ats}</span>
            </div>
            {failedLogs.length > 0 && (
              <div className="flex justify-between gap-2 col-span-2">
                <span className="text-neutral-400">Failed Attempts</span>
                <span className="text-rose-400">{failedLogs.length}</span>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {noteEntries.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Notes
            </h3>
            <ul className="space-y-1.5">
              {noteEntries.map((note, i) => (
                <li
                  key={i}
                  className="text-sm text-neutral-400 pl-3 relative before:content-[''] before:absolute before:left-0 before:top-1.5 before:h-1 before:w-1 before:rounded-full before:bg-neutral-600"
                >
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Failure details */}
        {failedLogs.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Failure Logs
            </h3>
            <div className="space-y-1.5">
              {failedLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg bg-rose-500/5 border border-rose-500/20 p-2.5"
                >
                  <p className="text-sm text-rose-400">
                    {log.error_message ?? "Unknown error"}
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {formatDateTime(log.created_at)}
                    {log.execution_time_ms != null && ` -- ${log.execution_time_ms}ms`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bot Improvement Ideas */}
        <div className="border-t border-neutral-700/50 pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
            Automation Methods & Improvements
          </h3>
          <div className="space-y-2 text-sm text-neutral-400">
            <div className="flex items-start gap-2">
              <MethodBadge label="Current" color="emerald" />
              <span>
                Playwright headless Chromium -- handles Greenhouse, Lever (manual),
                Ashby forms with IMAP email verification
              </span>
            </div>
            <div className="flex items-start gap-2">
              <MethodBadge label="Explored" color="amber" />
              <span>
                Agentic browsers (Stagehand, Browser-Use, LaVague) -- AI-driven
                form detection, but higher latency and less reliable for bulk
              </span>
            </div>
            <div className="flex items-start gap-2">
              <MethodBadge label="Explored" color="amber" />
              <span>
                Direct API submission (ATS REST APIs) -- works for Greenhouse
                Harvest API but most require employer API keys
              </span>
            </div>
            <div className="flex items-start gap-2">
              <MethodBadge label="Blocked" color="rose" />
              <span>
                Lever hCaptcha -- all headless submissions blocked; Ashby
                postings expire silently (200 OK, empty body)
              </span>
            </div>
            <div className="flex items-start gap-2">
              <MethodBadge label="Future" color="blue" />
              <span>
                Chrome extension-based submit (real browser context, bypasses bot
                detection) -- Claude-in-Chrome MCP for form fill + human-in-loop
              </span>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function MethodBadge({ label, color }: { label: string; color: string }) {
  const styles: Record<string, string> = {
    emerald: "bg-emerald-500/15 text-emerald-400",
    amber: "bg-amber-500/15 text-amber-400",
    rose: "bg-rose-500/15 text-rose-400",
    blue: "bg-blue-500/15 text-blue-400",
  };
  return (
    <span
      className={`shrink-0 inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
        styles[color] ?? "bg-neutral-700/60 text-neutral-400"
      }`}
    >
      {label}
    </span>
  );
}

// ---- Timeline ---------------------------------------------------------------

interface TimelineProps {
  app: ApplicationDetail;
  commsLogs: CommunicationLog[];
  automationLogs: AutomationLog[];
}

interface TimelineEntry {
  key: string;
  color: DotColor;
  title: string;
  time: string;
  sortTime: number;
  children: React.ReactNode;
}

function ApplicationTimeline({ app, commsLogs, automationLogs }: TimelineProps) {
  const entries: TimelineEntry[] = [];

  // 1. Application Created
  entries.push({
    key: "created",
    color: "amber",
    title: "Application Created",
    time: formatDateTime(app.created_at),
    sortTime: new Date(app.created_at).getTime(),
    children: (
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={app.status} />
        {app.match_score != null && <ScoreBadge score={app.match_score} />}
      </div>
    ),
  });

  // 2. Cover Letter Generated (if present)
  if (app.cover_letter) {
    const lines = app.cover_letter.split("\n").filter((l) => l.trim().length > 0);
    const preview = lines.slice(0, 2).join(" ").slice(0, 160);
    entries.push({
      key: "cover-letter",
      color: "blue",
      title: "Cover Letter Generated",
      time: formatDateTime(app.created_at),
      sortTime: new Date(app.created_at).getTime() + 1,
      children: (
        <div>
          <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-blue-500/15 text-blue-400">
            {app.cover_letter.length.toLocaleString()} chars
          </span>
          <p className="mt-1 text-sm text-neutral-400 line-clamp-2">
            {preview}{preview.length < app.cover_letter.length ? "..." : ""}
          </p>
        </div>
      ),
    });
  }

  // 3. Application Submitted (if application_date differs from created_at)
  const submittedDiffers =
    app.application_date &&
    app.application_date !== app.created_at.split("T")[0];

  if (submittedDiffers && app.application_date) {
    entries.push({
      key: "submitted",
      color: "emerald",
      title: "Application Submitted",
      time: formatDate(app.application_date),
      sortTime: new Date(app.application_date).getTime(),
      children: (
        <p className="text-sm text-neutral-400">Formal submission date</p>
      ),
    });
  }

  // 4. Status-based events
  const statusEvents: Record<string, { color: DotColor; title: string }> = {
    phone_screen: { color: "violet", title: "Phone Screen" },
    interview: { color: "amber", title: "Interview" },
    final: { color: "orange", title: "Final Interview" },
    offer: { color: "emerald", title: "Offer Received" },
    rejected: { color: "rose", title: "Rejected" },
    hired: { color: "emerald", title: "Hired" },
    withdrawn: { color: "slate", title: "Withdrawn" },
  };

  const statusEvent = statusEvents[app.status];
  if (statusEvent && app.status !== "interested" && app.status !== "applied") {
    const eventTime = app.last_contact_date ?? app.updated_at;
    entries.push({
      key: `status-${app.status}`,
      color: statusEvent.color,
      title: statusEvent.title,
      time: formatDateTime(eventTime),
      sortTime: new Date(eventTime).getTime(),
      children: <StatusBadge status={app.status} />,
    });
  }

  // 5. Email Communications
  for (const log of commsLogs) {
    entries.push({
      key: `comm-${log.id}`,
      color: "blue",
      title: `${formatLabel(log.direction)} ${formatLabel(log.channel)}`,
      time: formatDateTime(log.created_at),
      sortTime: new Date(log.created_at).getTime(),
      children: (
        <div>
          {log.subject && (
            <p className="text-sm font-medium text-neutral-300">{log.subject}</p>
          )}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {log.sentiment && <SentimentBadge sentiment={log.sentiment} />}
            {log.content_summary && (
              <p className="text-sm text-neutral-400 line-clamp-1">
                {log.content_summary}
              </p>
            )}
          </div>
        </div>
      ),
    });
  }

  // 6. Automation context logs
  for (const log of automationLogs) {
    entries.push({
      key: `auto-${log.id}`,
      color: log.success ? "slate" : "rose",
      title: `Automation: ${formatLabel(log.action_type)}`,
      time: formatDateTime(log.created_at),
      sortTime: new Date(log.created_at).getTime(),
      children: (
        <p className="text-sm text-neutral-400">
          {log.platform ? `${log.platform} -- ` : ""}
          {log.success ? "Success" : "Failed"}
          {log.error_message ? ` -- ${log.error_message}` : ""}
          {log.execution_time_ms != null
            ? ` -- ${log.execution_time_ms}ms`
            : ""}
        </p>
      ),
    });
  }

  // Sort chronologically
  entries.sort((a, b) => a.sortTime - b.sortTime);

  return (
    <ol className="relative space-y-0">
      {entries.map((entry, idx) => (
        <TimelineEvent
          key={entry.key}
          color={entry.color}
          title={entry.title}
          time={entry.time}
          isLast={idx === entries.length - 1}
        >
          {entry.children}
        </TimelineEvent>
      ))}
      {entries.length === 0 && (
        <p className="text-sm text-neutral-400">No timeline events yet.</p>
      )}
    </ol>
  );
}

// ---- Cover Letter Card ------------------------------------------------------

function CoverLetterCard({ coverLetter }: { coverLetter: string }) {
  const wordCount = coverLetter
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  const paragraphCount = coverLetter
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0).length;
  const charCount = coverLetter.length;

  return (
    <div className="rounded-xl border border-neutral-700/50 bg-neutral-800/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-neutral-700/50 bg-neutral-800/60 flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
          Cover Letter
        </h2>
        <div className="flex items-center gap-2">
          <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-neutral-700/60 text-neutral-400">
            {charCount.toLocaleString()} chars
          </span>
          <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-neutral-700/60 text-neutral-400">
            {wordCount.toLocaleString()} words
          </span>
          <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-neutral-700/60 text-neutral-400">
            {paragraphCount} para{paragraphCount !== 1 ? "s" : ""}
          </span>
          <CopyButton text={coverLetter} />
        </div>
      </div>
      <div className="p-4">
        <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap break-words">
          {coverLetter}
        </p>
      </div>
    </div>
  );
}

// ---- Company Info Sidebar ---------------------------------------------------

function CompanyInfoSidebar({
  app,
  job,
}: {
  app: ApplicationDetail;
  job: ApplicationDetail["jobs"];
}) {
  const today = new Date().toISOString().split("T")[0];
  const isDeadlinePast = job?.deadline ? job.deadline < today : false;

  return (
    <div className="space-y-3">
      <dl className="space-y-2">
        <DetailRow
          label="Salary"
          value={formatSalaryRange(job?.salary_min, job?.salary_max)}
          hide={formatSalaryRange(job?.salary_min, job?.salary_max) === "--"}
        />
        <DetailRow label="Work Mode" hide={!job?.work_mode}>
          {job?.work_mode && <WorkModeBadge mode={job.work_mode} />}
        </DetailRow>
        <DetailRow label="Job Type" hide={!job?.job_type}>
          {job?.job_type && (
            <span className="inline-flex rounded-full bg-neutral-700/60 px-2.5 py-0.5 text-sm font-medium capitalize text-neutral-300">
              {job.job_type}
            </span>
          )}
        </DetailRow>
        <DetailRow label="Platform">
          <div className="flex items-center gap-1.5">
            <PlatformBadge platform={app.platform} />
            {job?.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-400 hover:text-emerald-400 transition-colors"
                title="Open posting"
              >
                <ExternalLinkIcon className="h-3 w-3" />
              </a>
            )}
          </div>
        </DetailRow>
        <DetailRow label="Location" value={job?.location ?? null} hide={!job?.location} />
        <DetailRow label="Posted" value={formatDate(job?.posting_date)} hide={!job?.posting_date} />
        <DetailRow label="Deadline" hide={!job?.deadline}>
          <span className={`text-sm ${isDeadlinePast ? "text-rose-400" : "text-neutral-300"}`}>
            {formatDate(job?.deadline)}
            {isDeadlinePast && (
              <span className="ml-1.5 inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-rose-500/15 text-rose-400">
                expired
              </span>
            )}
          </span>
        </DetailRow>
        <DetailRow label="Match Score">
          <ScoreBadge score={app.match_score} />
        </DetailRow>
        <DetailRow label="Priority">
          <PriorityStars priority={app.priority} />
        </DetailRow>
        <DetailRow
          label="Source"
          value={app.source ?? null}
          hide={!app.source}
        />
        <DetailRow
          label="Referral"
          value={app.referral_contact ?? null}
          hide={!app.referral_contact}
        />
        <DetailRow
          label="Salary Expectation"
          value={
            app.salary_expectation != null
              ? `$${app.salary_expectation.toLocaleString()}`
              : null
          }
          hide={app.salary_expectation == null}
        />
        <DetailRow
          label="Follow-up"
          hide={!app.next_followup_date}
        >
          {app.next_followup_date && (
            <FollowupDate date={app.next_followup_date} status={app.status} />
          )}
        </DetailRow>
        <DetailRow
          label="Last Contact"
          value={formatDate(app.last_contact_date)}
          hide={!app.last_contact_date}
        />
        <DetailRow
          label="Created"
          value={formatRelativeTime(app.created_at)}
        />
        <DetailRow
          label="Updated"
          value={formatRelativeTime(app.updated_at)}
        />
      </dl>

      {/* Description snippet */}
      {job?.description && <DescriptionSnippet text={job.description} />}
    </div>
  );
}

function DescriptionSnippet({ text }: { text: string }) {
  const snippet = text.slice(0, 500);
  const isTruncated = text.length > 500;

  return (
    <div className="space-y-1 border-t border-neutral-700/50 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Description
      </p>
      <p className="text-sm text-neutral-400 leading-relaxed whitespace-pre-wrap break-words">
        {snippet}
        {isTruncated ? "..." : ""}
      </p>
    </div>
  );
}

// ---- Communication Log Table ------------------------------------------------

function CommunicationLogTable({ logs }: { logs: CommunicationLog[] }) {
  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className="rounded-lg bg-neutral-900/60 p-2.5 space-y-1"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <DirectionBadge direction={log.direction} />
              <span className="text-xs text-neutral-400 capitalize">
                {log.channel.replace(/_/g, " ")}
              </span>
            </div>
            <span className="text-xs text-neutral-400 tabular-nums">
              {formatDate(log.created_at)}
            </span>
          </div>
          {log.subject && (
            <p className="text-sm text-neutral-300 truncate">{log.subject}</p>
          )}
          {log.content_summary && (
            <p className="text-sm text-neutral-400 line-clamp-2">
              {log.content_summary}
            </p>
          )}
          {log.sentiment && (
            <SentimentBadge sentiment={log.sentiment} />
          )}
        </div>
      ))}
    </div>
  );
}

// ---- TimelineEvent ----------------------------------------------------------

type DotColor = "slate" | "blue" | "emerald" | "amber" | "violet" | "orange" | "rose";

const DOT_COLORS: Record<DotColor, string> = {
  slate: "bg-neutral-600 ring-neutral-700",
  blue: "bg-blue-500 ring-blue-800",
  emerald: "bg-emerald-500 ring-emerald-800",
  amber: "bg-amber-500 ring-amber-800",
  violet: "bg-violet-500 ring-violet-800",
  orange: "bg-orange-500 ring-orange-800",
  rose: "bg-rose-500 ring-rose-800",
};

function TimelineEvent({
  color,
  title,
  time,
  isLast,
  children,
}: {
  color: DotColor;
  title: string;
  time: string;
  isLast: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      {/* Dot + connecting line */}
      <div className="flex flex-col items-center">
        <span
          className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ring-2 ${DOT_COLORS[color]}`}
        />
        {!isLast && (
          <span className="w-px grow border-l border-neutral-700/50 my-1" />
        )}
      </div>

      {/* Content */}
      <div className={`pb-4 min-w-0 flex-1 ${isLast ? "pb-0" : ""}`}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-neutral-300">{title}</span>
          {time && (
            <span className="tabular-nums text-xs text-neutral-400">{time}</span>
          )}
        </div>
        {children && <div className="mt-0.5">{children}</div>}
      </div>
    </li>
  );
}

// ---- Small helpers ----------------------------------------------------------

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium capitalize bg-neutral-700/60 text-neutral-400">
      {platform}
    </span>
  );
}

function WorkModeBadge({ mode }: { mode: string }) {
  const styles: Record<string, string> = {
    remote: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    hybrid: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    "on-site": "bg-rose-500/20 text-rose-300 border-rose-500/30",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-sm font-medium capitalize ${
        styles[mode] ?? "bg-neutral-700 text-neutral-300 border-neutral-600"
      }`}
    >
      {mode}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const styles: Record<string, string> = {
    positive: "bg-emerald-500/15 text-emerald-400",
    neutral: "bg-neutral-700/60 text-neutral-400",
    negative: "bg-rose-500/15 text-rose-400",
  };
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium capitalize ${
        styles[sentiment] ?? "bg-neutral-700/60 text-neutral-400"
      }`}
    >
      {sentiment}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const isOutbound = direction === "outbound";
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
        isOutbound
          ? "bg-blue-500/15 text-blue-400"
          : "bg-amber-500/15 text-amber-400"
      }`}
    >
      {isOutbound ? "Out" : "In"}
    </span>
  );
}

function FollowupDate({ date, status }: { date: string; status: string }) {
  const isOverdue =
    !["rejected", "withdrawn", "hired"].includes(status) &&
    new Date(date) < new Date();

  return (
    <span
      className={`text-sm ${
        isOverdue ? "font-semibold text-rose-400" : "text-neutral-300"
      }`}
    >
      {formatDate(date)}
      {isOverdue && (
        <span className="ml-1.5 inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-rose-500/15 text-rose-400">
          overdue
        </span>
      )}
    </span>
  );
}

function DetailRow({
  label,
  value,
  hide,
  children,
}: {
  label: string;
  value?: string | null;
  hide?: boolean;
  children?: React.ReactNode;
}) {
  if (hide) {
    return null;
  }
  return (
    <div className="flex justify-between gap-2 text-sm">
      <dt className="text-neutral-400 shrink-0">{label}</dt>
      <dd className="text-neutral-300 text-right">
        {children ?? value ?? "--"}
      </dd>
    </div>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
      />
    </svg>
  );
}
