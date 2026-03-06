import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getApplicationDetail,
  getApplicationAutomationContext,
  getCommunicationLogsForEntity,
} from "@/lib/queries";
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

  const automationLogs = await getApplicationAutomationContext(app.created_at);

  const job = app.jobs;

  return (
    <div className="space-y-5 max-w-6xl">
      <ApplicationHeader app={app} job={job} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Timeline + Cover Letter (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Timeline
            </h2>
            <ApplicationTimeline
              app={app}
              commsLogs={commsLogs}
              automationLogs={automationLogs}
            />
          </div>

          {app.cover_letter && (
            <CoverLetterCard coverLetter={app.cover_letter} />
          )}
        </div>

        {/* Right column: Company Info + Communication Log (1/3) */}
        <div className="space-y-6">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Company Info
            </h2>
            <CompanyInfoSidebar app={app} job={job} />
          </div>

          {commsLogs.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Communication Log
              </h2>
              <CommunicationLogTable logs={commsLogs} />
            </div>
          )}
        </div>
      </div>
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
      <div className="flex items-start gap-2 flex-wrap">
        <Link
          href="/applications"
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors mt-0.5"
        >
          Applications
        </Link>
        <span className="text-xs text-slate-700 mt-0.5">/</span>
        <h1 className="text-sm font-semibold text-slate-200">
          {job?.title ?? "Unknown Role"}
        </h1>
        <div className="flex items-center gap-1.5 flex-wrap ml-1">
          <StatusBadge status={app.status} />
          <ScoreBadge score={app.match_score} />
          <PlatformBadge platform={app.platform} />
          {job?.url && (
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
      <p className="text-xs text-slate-500">
        {job?.company ?? "Unknown Company"}
        {job?.location ? ` -- ${job.location}` : ""}
      </p>
    </div>
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
      sortTime: new Date(app.created_at).getTime() + 1, // just after created
      children: (
        <div>
          <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/15 text-blue-400">
            {app.cover_letter.length.toLocaleString()} chars
          </span>
          <p className="mt-1 text-xs text-slate-500 line-clamp-2">
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
        <p className="text-xs text-slate-500">Formal submission date</p>
      ),
    });
  }

  // 4. Status-based events (phone_screen, interview, final, offer, rejected)
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

  // 5. Email Communications from communication_log
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
            <p className="text-xs font-medium text-slate-300">{log.subject}</p>
          )}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {log.sentiment && <SentimentBadge sentiment={log.sentiment} />}
            {log.content_summary && (
              <p className="text-xs text-slate-500 line-clamp-1">
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
        <p className="text-xs text-slate-500">
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

  // 7. Notes (parse pipe-separated entries)
  if (app.notes?.trim()) {
    const noteEntries = app.notes
      .split("|")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    entries.push({
      key: "notes",
      color: "slate",
      title: "Notes",
      time: "",
      sortTime: Number.MAX_SAFE_INTEGER, // always last
      children: (
        <ul className="space-y-1">
          {noteEntries.map((note, i) => (
            <li key={i} className="text-xs text-slate-400">
              {note}
            </li>
          ))}
        </ul>
      ),
    });
  }

  // Sort by time (chronological)
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
        <p className="text-xs text-slate-600">No timeline events yet.</p>
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
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Cover Letter
        </h2>
        <div className="flex items-center gap-2">
          <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-700/60 text-slate-400">
            {charCount.toLocaleString()} chars
          </span>
          <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-700/60 text-slate-400">
            {wordCount.toLocaleString()} words
          </span>
          <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-700/60 text-slate-400">
            {paragraphCount} para{paragraphCount !== 1 ? "s" : ""}
          </span>
          <CopyButton text={coverLetter} />
        </div>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
        {coverLetter}
      </p>
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
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 space-y-4">
      {/* Company + Title */}
      <div className="space-y-1">
        <p className="text-base font-semibold text-slate-200">
          {job?.company ?? "Unknown Company"}
        </p>
        <p className="text-sm text-slate-400">
          {job?.title ?? "Unknown Role"}
        </p>
      </div>

      {/* Metadata rows */}
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
            <span className="inline-flex rounded-full bg-slate-700/60 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-300">
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
                className="text-slate-500 hover:text-emerald-400 transition-colors"
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
          <span className={`text-xs ${isDeadlinePast ? "text-rose-400" : "text-slate-300"}`}>
            {formatDate(job?.deadline)}
            {isDeadlinePast && (
              <span className="ml-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-rose-500/15 text-rose-400">
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
    <div className="space-y-1 border-t border-slate-700/50 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Description
      </p>
      <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap break-words">
        {snippet}
        {isTruncated ? "..." : ""}
      </p>
    </div>
  );
}

// ---- Communication Log Table ------------------------------------------------

function CommunicationLogTable({ logs }: { logs: CommunicationLog[] }) {
  return (
    <div className="rounded-xl border border-slate-700/50 overflow-hidden">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-700/50 bg-slate-800/80">
          <tr>
            <th className="px-3 py-2 text-slate-500 font-semibold uppercase tracking-wider">
              Date
            </th>
            <th className="px-3 py-2 text-slate-500 font-semibold uppercase tracking-wider">
              Channel
            </th>
            <th className="px-3 py-2 text-slate-500 font-semibold uppercase tracking-wider">
              Dir
            </th>
            <th className="px-3 py-2 text-slate-500 font-semibold uppercase tracking-wider">
              Subject
            </th>
            <th className="px-3 py-2 text-slate-500 font-semibold uppercase tracking-wider">
              Sentiment
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/30">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
              <td className="px-3 py-2 text-slate-400 tabular-nums whitespace-nowrap">
                {formatDate(log.created_at)}
              </td>
              <td className="px-3 py-2">
                <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium capitalize bg-slate-700/60 text-slate-300">
                  {log.channel.replace(/_/g, " ")}
                </span>
              </td>
              <td className="px-3 py-2">
                <DirectionBadge direction={log.direction} />
              </td>
              <td className="px-3 py-2 text-slate-300 max-w-[200px] truncate">
                {log.subject ?? log.content_summary ?? "--"}
              </td>
              <td className="px-3 py-2">
                {log.sentiment ? (
                  <SentimentBadge sentiment={log.sentiment} />
                ) : (
                  <span className="text-slate-600">--</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- TimelineEvent ----------------------------------------------------------

type DotColor = "slate" | "blue" | "emerald" | "amber" | "violet" | "orange" | "rose";

const DOT_COLORS: Record<DotColor, string> = {
  slate: "bg-slate-600 ring-slate-700",
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

// ---- Small helpers ----------------------------------------------------------

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium capitalize bg-slate-700/60 text-slate-400">
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
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${
        styles[mode] ?? "bg-slate-700 text-slate-300 border-slate-600"
      }`}
    >
      {mode}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const styles: Record<string, string> = {
    positive: "bg-emerald-500/15 text-emerald-400",
    neutral: "bg-slate-700/60 text-slate-400",
    negative: "bg-rose-500/15 text-rose-400",
  };
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${
        styles[sentiment] ?? "bg-slate-700/60 text-slate-400"
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
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${
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
      className={`text-xs ${
        isOverdue ? "font-semibold text-rose-400" : "text-slate-300"
      }`}
    >
      {formatDate(date)}
      {isOverdue && (
        <span className="ml-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-rose-500/15 text-rose-400">
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
    <div className="flex justify-between gap-2 text-xs">
      <dt className="text-slate-500 shrink-0">{label}</dt>
      <dd className="text-slate-300 text-right">
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
