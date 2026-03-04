import { notFound } from "next/navigation";
import Link from "next/link";
import { getJobDetail, getJobAutomationContext } from "@/lib/queries";
import type { JobDetail, JobDetailApplication } from "@/lib/queries";
import { formatDateTime, formatLabel, formatSalaryRange } from "@/lib/format";
import { ScoreBadge } from "@/components/score-badge";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function JobDetailPage({ params }: PageProps) {
  const { id } = await params;
  const job = await getJobDetail(id);

  if (!job) {notFound();}

  // Now fetch automation context using the job's created_at
  const logs = await getJobAutomationContext(job.created_at);

  return (
    <div className="space-y-5 max-w-5xl">
      <JobHeader job={job} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: timeline (2/3) */}
        <div className="lg:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Timeline
          </h2>
          <Timeline job={job} logs={logs} />
        </div>

        {/* Right: job details (1/3) */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Details
          </h2>
          <JobDetails job={job} />
        </div>
      </div>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────

function JobHeader({ job }: { job: JobDetail }) {
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2 flex-wrap">
        <Link
          href="/jobs"
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors mt-0.5"
        >
          Jobs
        </Link>
        <span className="text-xs text-slate-700 mt-0.5">/</span>
        <h1 className="text-sm font-semibold text-slate-200">{job.title}</h1>
        <div className="flex items-center gap-1.5 flex-wrap ml-1">
          <ScoreBadge score={job.match_score} />
          <PlatformBadge platform={job.platform} />
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-600 hover:text-emerald-400 transition-colors"
              title="Open job posting"
            >
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500">{job.company}</p>
    </div>
  );
}

// ─── Job Details sidebar ──────────────────────────────────────────────

function JobDetails({ job }: { job: JobDetail }) {
  const rows: { label: string; value: string | null }[] = [
    { label: "Salary", value: formatSalaryRange(job.salary_min, job.salary_max) },
    { label: "Work Mode", value: job.work_mode ?? null },
    { label: "Type", value: job.job_type ?? null },
    { label: "Location", value: job.location ?? null },
    { label: "Platform", value: job.platform },
    { label: "Posted", value: job.posting_date ?? null },
    { label: "Deadline", value: job.deadline ?? null },
  ];

  const descriptionSnippet = job.description
    ? job.description.slice(0, 300) + (job.description.length > 300 ? "…" : "")
    : null;

  return (
    <div className="space-y-4">
      <dl className="space-y-2">
        {rows.map(({ label, value }) =>
          value ? (
            <div key={label} className="flex justify-between gap-2 text-xs">
              <dt className="text-slate-500 shrink-0">{label}</dt>
              <dd className="text-slate-300 text-right capitalize">{value}</dd>
            </div>
          ) : null
        )}
      </dl>

      {descriptionSnippet && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Description
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            {descriptionSnippet}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────

function Timeline({
  job,
  logs,
}: {
  job: JobDetail;
  logs: AutomationLog[];
}) {
  // Sort applications chronologically
  const apps = [...job.applications].toSorted(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Pick the most relevant automation log (first job_search log)
  const cronLog = logs.find((l) => l.action_type === "job_search") ?? logs[0];

  return (
    <ol className="relative space-y-0">
      {/* 1. Cron discovered */}
      {cronLog && (
        <TimelineEvent
          icon="robot"
          color="slate"
          title="Cron Discovered"
          time={formatDateTime(cronLog.created_at)}
          isLast={false}
        >
          <p className="text-xs text-slate-500">
            {formatLabel(cronLog.action_type)}
            {cronLog.platform ? ` · ${cronLog.platform}` : ""}
            {cronLog.success ? "" : " · failed"}
          </p>
        </TimelineEvent>
      )}

      {/* 2. Job Found */}
      <TimelineEvent
        icon="search"
        color="blue"
        title="Job Found"
        time={formatDateTime(job.created_at)}
        isLast={apps.length === 0}
      >
        <p className="text-xs text-slate-500 capitalize">
          {job.platform}
          {job.job_type ? ` · ${job.job_type}` : ""}
        </p>
      </TimelineEvent>

      {/* No applications yet */}
      {apps.length === 0 && (
        <TimelineEvent
          icon="pending"
          color="slate"
          title="Not applied yet"
          time=""
          isLast={true}
        >
          <p className="text-xs text-slate-600">Awaiting action</p>
        </TimelineEvent>
      )}

      {/* 3–6. Per-application events */}
      {apps.map((app, appIdx) => {
        const isLastApp = appIdx === apps.length - 1;
        return (
          <AppEvents key={app.id} app={app} isLastApp={isLastApp} />
        );
      })}
    </ol>
  );
}

function AppEvents({
  app,
  isLastApp,
}: {
  app: JobDetailApplication;
  isLastApp: boolean;
}) {
  const hasContactEvent =
    app.last_contact_date &&
    ["phone_screen", "interview", "final"].includes(app.status);

  // Determine if submitted date is meaningfully different from created date
  const submittedDiffers =
    app.application_date &&
    app.application_date !== app.created_at.split("T")[0];

  const hasNotes = Boolean(app.notes?.trim());

  // Count how many events this app contributes so we know when to mark isLast
  const appColor = ["applied", "phone_screen", "interview", "final", "offer", "hired"].includes(
    app.status
  )
    ? "emerald"
    : "amber";

  const totalEvents =
    1 + // application created
    (submittedDiffers ? 1 : 0) +
    (hasContactEvent ? 1 : 0) +
    (hasNotes ? 1 : 0);

  let eventIdx = 0;

  function isLast() {
    eventIdx++;
    return isLastApp && eventIdx === totalEvents;
  }

  return (
    <>
      {/* Application Created */}
      <TimelineEvent
        icon="doc"
        color={appColor}
        title="Application Created"
        time={formatDateTime(app.created_at)}
        isLast={isLast()}
      >
        <AppStatusBadge status={app.status} />
        {app.cover_letter && (
          <p className="mt-1 text-xs text-slate-500 line-clamp-2">
            {app.cover_letter.slice(0, 120)}
            {app.cover_letter.length > 120 ? "…" : ""}
          </p>
        )}
      </TimelineEvent>

      {/* Application Submitted (different date) */}
      {submittedDiffers && (
        <TimelineEvent
          icon="calendar"
          color="emerald"
          title="Application Submitted"
          time={app.application_date ?? ""}
          isLast={isLast()}
        >
          <p className="text-xs text-slate-500">Formal submission date</p>
        </TimelineEvent>
      )}

      {/* Interview / Screening */}
      {hasContactEvent && (
        <TimelineEvent
          icon="phone"
          color="violet"
          title={
            app.status === "phone_screen"
              ? "Phone Screen"
              : app.status === "final"
              ? "Final Interview"
              : "Interview"
          }
          time={formatDateTime(app.last_contact_date)}
          isLast={isLast()}
        >
          <AppStatusBadge status={app.status} />
        </TimelineEvent>
      )}

      {/* Notes */}
      {hasNotes && (
        <TimelineEvent
          icon="notes"
          color="slate"
          title="Notes"
          time=""
          isLast={isLast()}
        >
          <p className="text-xs text-slate-400 whitespace-pre-wrap break-words">
            {app.notes}
          </p>
        </TimelineEvent>
      )}
    </>
  );
}

// ─── TimelineEvent ────────────────────────────────────────────────────

type DotColor = "slate" | "blue" | "emerald" | "amber" | "violet";

const DOT_COLORS: Record<DotColor, string> = {
  slate: "bg-slate-600 ring-slate-700",
  blue: "bg-blue-500 ring-blue-800",
  emerald: "bg-emerald-500 ring-emerald-800",
  amber: "bg-amber-500 ring-amber-800",
  violet: "bg-violet-500 ring-violet-800",
};

function TimelineEvent({
  color,
  title,
  time,
  isLast,
  children,
}: {
  icon: string;
  color: DotColor;
  title: string;
  time: string;
  isLast: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      {/* Dot + line */}
      <div className="flex flex-col items-center">
        <span
          className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ring-2 ${DOT_COLORS[color]}`}
        />
        {!isLast && (
          <span className="w-px grow border-l border-slate-700/50 my-1" />
        )}
      </div>

      {/* Content */}
      <div className={`pb-4 min-w-0 flex-1 ${isLast ? "pb-0" : ""}`}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-300">{title}</span>
          {time && (
            <span className="tabular-nums text-xs text-slate-500">{time}</span>
          )}
        </div>
        {children && <div className="mt-0.5">{children}</div>}
      </div>
    </li>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────

function AppStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    interested: "bg-slate-700/60 text-slate-400",
    applied: "bg-blue-500/15 text-blue-400",
    phone_screen: "bg-violet-500/15 text-violet-400",
    interview: "bg-amber-500/15 text-amber-400",
    final: "bg-orange-500/15 text-orange-400",
    offer: "bg-emerald-500/15 text-emerald-400",
    hired: "bg-emerald-600/25 text-emerald-300",
    rejected: "bg-rose-500/15 text-rose-400",
    withdrawn: "bg-slate-700/50 text-slate-500",
  };
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${
        styles[status] ?? "bg-slate-700/50 text-slate-400"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium capitalize bg-slate-700/60 text-slate-400">
      {platform}
    </span>
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
