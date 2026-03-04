import { Suspense } from "react";
import { ScoreBadge } from "@/components/score-badge";
import { StatusBadge } from "@/components/status-badge";
import {
  getDailySummaryStats,
  getSubmittedApplications,
  getFormQALogs,
  getFailedSubmissions,
} from "@/lib/daily-summary-queries";
import { DateNav } from "./date-nav";
import { FormQAAccordion } from "./form-qa-accordion";

export const dynamic = "force-dynamic";

function getDateParam(searchParams: Record<string, string | string[] | undefined>): string {
  const raw = searchParams.date;
  const val = typeof raw === "string" ? raw : undefined;
  if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {return val;}
  return formatLocalDate(new Date());
}

function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DailySummaryPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const date = getDateParam(resolvedParams);

  const [stats, submitted, formQA, failures] = await Promise.all([
    getDailySummaryStats(date),
    getSubmittedApplications(date),
    getFormQALogs(date),
    getFailedSubmissions(date),
  ]);

  return (
    <div className="space-y-6">
      {/* Header + Date Nav */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-slate-100">Daily Summary</h1>
        <Suspense
          fallback={
            <div className="h-10 w-80 animate-pulse rounded-lg bg-slate-800/50" />
          }
        >
          <DateNav currentDate={date} />
        </Suspense>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Jobs Added"
          value={stats.jobsAdded}
          icon={<BriefcaseIcon className="h-5 w-5" />}
          accent="blue"
        />
        <StatCard
          label="Applications Created"
          value={stats.applicationsCreated}
          icon={<DocumentIcon className="h-5 w-5" />}
          accent="slate"
        />
        <StatCard
          label="Submitted"
          value={stats.applicationsSubmitted}
          icon={<CheckCircleIcon className="h-5 w-5" />}
          accent="emerald"
        />
        <StatCard
          label="Failed"
          value={stats.failedSubmissions}
          icon={<XCircleIcon className="h-5 w-5" />}
          accent="rose"
        />
      </div>

      {/* Submitted Applications Table */}
      <section className="rounded-lg border border-slate-700/50 bg-slate-900">
        <div className="border-b border-slate-700/50 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Submitted Applications ({submitted.length})
          </span>
        </div>
        {submitted.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            No applications submitted on this date.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-700/50 bg-slate-800/50">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Company
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Title
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Platform
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Score
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Time
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Link
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {submitted.map((app) => (
                  <tr
                    key={app.id}
                    className="transition-colors hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-200">
                      {app.company}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{app.title}</td>
                    <td className="px-4 py-2.5">
                      <PlatformPill platform={app.platform} />
                    </td>
                    <td className="px-4 py-2.5">
                      <ScoreBadge score={app.matchScore} />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-slate-400">
                      {formatTime(app.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      {app.url ? (
                        <a
                          href={app.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-500 transition-colors hover:text-emerald-400"
                          title="Open job posting"
                        >
                          <ExternalLinkIcon className="h-4 w-4" />
                        </a>
                      ) : (
                        <span className="text-slate-600">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Form Q&A Audit */}
      <section className="rounded-lg border border-slate-700/50 bg-slate-900">
        <div className="border-b border-slate-700/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Form Q&A Audit
            </span>
            {formQA.length > 0 && (
              <span className="text-xs text-slate-500">
                {formQA.length} compan{formQA.length !== 1 ? "ies" : "y"}
              </span>
            )}
          </div>
        </div>
        <div className="p-2">
          <FormQAAccordion data={formQA} />
        </div>
      </section>

      {/* Failed Submissions */}
      <section className="rounded-lg border border-rose-500/20 bg-rose-500/5">
        <div className="border-b border-rose-500/15 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">
            Failed Submissions ({failures.length})
          </span>
        </div>
        {failures.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            No failed submissions on this date.
          </p>
        ) : (
          <div className="divide-y divide-rose-500/10">
            {failures.map((fail) => (
              <div
                key={fail.id}
                className="flex items-start gap-3 px-4 py-3"
              >
                <XCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-slate-200">
                      {fail.company}
                    </span>
                    <span className="text-xs text-slate-400">{fail.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-rose-300/80">
                    {fail.failureReason}
                  </p>
                </div>
                {fail.url ? (
                  <a
                    href={fail.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg border border-slate-700/50 bg-slate-800/50 px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100"
                  >
                    Apply manually
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: "emerald" | "rose" | "blue" | "slate";
}) {
  const accentStyles = {
    emerald: {
      border: "border-emerald-500/20",
      bg: "bg-emerald-500/5",
      icon: "text-emerald-400",
      value: "text-emerald-400",
    },
    rose: {
      border: "border-rose-500/20",
      bg: "bg-rose-500/5",
      icon: "text-rose-400",
      value: "text-rose-400",
    },
    blue: {
      border: "border-blue-500/20",
      bg: "bg-blue-500/5",
      icon: "text-blue-400",
      value: "text-blue-400",
    },
    slate: {
      border: "border-slate-700/50",
      bg: "bg-slate-900",
      icon: "text-slate-400",
      value: "text-slate-200",
    },
  };

  const s = accentStyles[accent];

  return (
    <div
      className={`rounded-lg border ${s.border} ${s.bg} p-4`}
    >
      <div className="flex items-center justify-between">
        <span className={s.icon}>{icon}</span>
        <span
          className={`text-2xl font-bold tabular-nums ${s.value}`}
        >
          {value}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

// ─── Platform Pill ──────────────────────────────────────────────────

function PlatformPill({ platform }: { platform: string }) {
  const styles: Record<string, string> = {
    linkedin: "bg-blue-500/15 text-blue-400",
    indeed: "bg-purple-500/15 text-purple-400",
    greenhouse: "bg-emerald-500/15 text-emerald-400",
    lever: "bg-cyan-500/15 text-cyan-400",
    direct: "bg-amber-500/15 text-amber-400",
    referral: "bg-rose-500/15 text-rose-400",
  };

  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${
        styles[platform] ?? "bg-slate-700/50 text-slate-400"
      }`}
    >
      {platform}
    </span>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────

function BriefcaseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
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
