import { ScoreBadge } from "@/components/score-badge";
import {
  getDashboardMetrics,
  getTopMatches,
  getRecentActivity,
  getOverdueFollowups,
} from "@/lib/queries";
import {
  formatRelativeTime,
  formatSalaryRange,
  formatLabel,
  formatDate,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [metrics, topMatches, recentActivity, overdueFollowups] =
    await Promise.all([
      getDashboardMetrics(),
      getTopMatches(15),
      getRecentActivity(15),
      getOverdueFollowups(),
    ]);

  const activeApps =
    (metrics.applicationsByStatus["applied"] ?? 0) +
    (metrics.applicationsByStatus["phone_screen"] ?? 0) +
    (metrics.applicationsByStatus["interview"] ?? 0) +
    (metrics.applicationsByStatus["final"] ?? 0);

  return (
    <div className="space-y-4">
      {/* Stat chips strip */}
      <div className="flex flex-wrap gap-2">
        <StatChip label="Jobs tracked" value={metrics.totalJobs} />
        <StatChip label="Applications" value={metrics.totalApplications} />
        <StatChip label="Active" value={activeApps} accent="emerald" />
        <StatChip label="Proposals" value={metrics.totalProposals} accent="amber" />
        <StatChip label="Clients" value={metrics.activeClients} accent="rose" />
      </div>

      {/* Main two-column grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Left 3/5: Top job matches */}
        <div className="lg:col-span-3 rounded-lg border border-slate-700/50 bg-slate-900">
          <div className="border-b border-slate-700/50 px-3 py-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Top Matches
            </span>
          </div>
          {topMatches.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500">No scored matches yet.</p>
          ) : (
            <div className="divide-y divide-slate-800">
              {topMatches.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800/40 transition-colors"
                >
                  <ScoreBadge score={job.match_score} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium text-slate-200">
                        {job.title}
                      </span>
                      {job.work_mode && (
                        <WorkModePill mode={job.work_mode} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400 truncate">{job.company}</span>
                      {(job.salary_min != null || job.salary_max != null) && (
                        <span className="text-xs text-slate-500 shrink-0">
                          {formatSalaryRange(job.salary_min, job.salary_max)}
                        </span>
                      )}
                    </div>
                  </div>
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-slate-600 hover:text-emerald-400 transition-colors"
                      title="Open job posting"
                    >
                      <ExternalLinkIcon className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right 2/5: Activity feed */}
        <div className="lg:col-span-2 rounded-lg border border-slate-700/50 bg-slate-900">
          <div className="border-b border-slate-700/50 px-3 py-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Activity
            </span>
          </div>
          {recentActivity.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500">No automation runs yet.</p>
          ) : (
            <div className="divide-y divide-slate-800">
              {recentActivity.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-2 px-3 py-2"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      log.success ? "bg-emerald-400" : "bg-rose-400"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-300">
                    {formatLabel(log.action_type)}
                    {log.platform ? (
                      <span className="text-slate-500"> · {log.platform}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-slate-600">
                    {formatRelativeTime(log.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overdue follow-ups strip (only shown if any) */}
      {overdueFollowups.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5">
          <div className="border-b border-amber-500/20 px-3 py-2">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              Overdue Follow-ups ({overdueFollowups.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 px-3 py-2">
            {overdueFollowups.map((app) => (
              <div key={app.id} className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-slate-300">
                  {app.jobs?.title ?? "Unknown"}
                </span>
                <span className="text-xs text-slate-500">{app.jobs?.company}</span>
                <span className="text-[10px] text-amber-500">
                  due {formatDate(app.next_followup_date)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "amber" | "rose";
}) {
  const valueColor =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "amber"
        ? "text-amber-400"
        : accent === "rose"
          ? "text-rose-400"
          : "text-slate-200";

  return (
    <div className="flex items-baseline gap-1.5 rounded-md border border-slate-700/60 bg-slate-900 px-3 py-1.5">
      <span className={`text-base font-bold tabular-nums ${valueColor}`}>{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

function WorkModePill({ mode }: { mode: string }) {
  const styles: Record<string, string> = {
    remote: "bg-emerald-500/15 text-emerald-400",
    hybrid: "bg-amber-500/15 text-amber-400",
    "on-site": "bg-rose-500/15 text-rose-400",
  };
  return (
    <span
      className={`shrink-0 rounded px-1 py-px text-[10px] font-medium capitalize ${
        styles[mode] ?? "bg-slate-700/50 text-slate-400"
      }`}
    >
      {mode}
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
