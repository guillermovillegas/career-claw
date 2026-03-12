import Link from "next/link";
import { ScoreBadge } from "@/components/score-badge";
import { Pipeline } from "@/components/pipeline";
import {
  getDashboardMetrics,
  getTopMatches,
  getRecentActivity,
  getOverdueFollowups,
  getPipelineData,
  getPlatformAnalytics,
  getCoverLetterStats,
} from "@/lib/queries";
import { formatRelativeTime, formatLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [metrics, topMatches, recentActivity, overdueFollowups, pipelineData, platformStats, clStats] =
    await Promise.all([
      getDashboardMetrics(),
      getTopMatches(12),
      getRecentActivity(10),
      getOverdueFollowups(),
      getPipelineData(),
      getPlatformAnalytics(),
      getCoverLetterStats(),
    ]);

  const activeApps =
    (metrics.applicationsByStatus["applied"] ?? 0) +
    (metrics.applicationsByStatus["phone_screen"] ?? 0) +
    (metrics.applicationsByStatus["interview"] ?? 0) +
    (metrics.applicationsByStatus["final"] ?? 0);

  const appliedRate = metrics.totalApplications > 0
    ? Math.round(((metrics.applicationsByStatus["applied"] ?? 0) / metrics.totalApplications) * 100)
    : 0;

  return (
    <div className="space-y-4 max-w-[1400px]">
      {/* Metric strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <MetricCard label="Jobs" value={metrics.totalJobs} />
        <MetricCard label="Applications" value={metrics.totalApplications} />
        <MetricCard label="Applied" value={metrics.applicationsByStatus["applied"] ?? 0} sub={`${appliedRate}%`} />
        <MetricCard label="Active" value={activeApps} />
        <MetricCard label="Ready" value={clStats.readyToSubmit} sub="to submit" />
        <MetricCard label="Avg Words" value={clStats.avgWordCount} sub="cover letter" />
      </div>

      {/* Pipeline + Platform analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Pipeline data={pipelineData} />
        <PlatformBreakdown stats={platformStats} />
      </div>

      {/* Status breakdown compact */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(metrics.applicationsByStatus)
          .toSorted(([, a], [, b]) => b - a)
          .map(([status, count]) => (
            <div key={status} className="flex items-center gap-2 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-1.5">
              <span className="text-xs text-neutral-400 capitalize">{status.replace(/_/g, " ")}</span>
              <span className="text-sm font-semibold tabular-nums text-neutral-300">{count}</span>
            </div>
          ))}
      </div>

      {/* Main grid: Top matches + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* Top matches - 3/5 */}
        <div className="lg:col-span-3 rounded-lg border border-neutral-800 bg-neutral-950">
          <div className="border-b border-neutral-800 px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-widest">
              Top Matches
            </span>
            <Link href="/applications" className="text-xs text-neutral-400 hover:text-neutral-300 transition-colors">
              View all
            </Link>
          </div>
          {topMatches.length === 0 ? (
            <p className="px-3 py-6 text-sm text-neutral-400 text-center">No scored matches yet.</p>
          ) : (
            <div className="divide-y divide-neutral-800/50">
              {topMatches.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.02] transition-colors"
                >
                  <ScoreBadge score={job.match_score} />
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-neutral-200 truncate">
                      {job.title}
                    </span>
                    <span className="text-xs text-neutral-400">{job.company}</span>
                  </div>
                  {job.work_mode && (
                    <span className="text-xs text-neutral-400">{job.work_mode}</span>
                  )}
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 px-2 py-0.5 rounded border border-neutral-800 text-xs text-neutral-400 hover:text-white hover:border-neutral-600 transition-all"
                    >
                      Apply
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity - 2/5 */}
        <div className="lg:col-span-2 rounded-lg border border-neutral-800 bg-neutral-950">
          <div className="border-b border-neutral-800 px-3 py-2">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-widest">
              Activity
            </span>
          </div>
          {recentActivity.length === 0 ? (
            <p className="px-3 py-6 text-sm text-neutral-400 text-center">No automation runs yet.</p>
          ) : (
            <div className="divide-y divide-neutral-800/30">
              {recentActivity.map((log) => (
                <div key={log.id} className="flex items-center gap-2 px-3 py-2">
                  <span className={`h-1 w-1 shrink-0 rounded-full ${log.success ? "bg-neutral-400" : "bg-neutral-600"}`} />
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-400">
                    {formatLabel(log.action_type)}
                    {log.platform ? (
                      <span className="text-neutral-400"> / {log.platform}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                    {formatRelativeTime(log.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overdue follow-ups */}
      {overdueFollowups.length > 0 && (
        <div className="rounded-lg border border-neutral-700 bg-neutral-900">
          <div className="border-b border-neutral-700/50 px-3 py-2">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-widest">
              Overdue Follow-ups ({overdueFollowups.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 px-3 py-2">
            {overdueFollowups.map((app) => (
              <div key={app.id} className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-neutral-300">
                  {app.jobs?.title ?? "Unknown"}
                </span>
                <span className="text-xs text-neutral-400">{app.jobs?.company}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5">
      <p className="text-xs text-neutral-400 uppercase tracking-widest">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="text-xl font-semibold tabular-nums text-white">{value}</span>
        {sub && <span className="text-xs text-neutral-400">{sub}</span>}
      </div>
    </div>
  );
}

// ─── Platform Breakdown ──────────────────────────────────────────────

function PlatformBreakdown({
  stats,
}: {
  stats: { platform: string; total: number; applied: number; interested: number; interviewing: number; rejected: number }[];
}) {
  const maxTotal = Math.max(...stats.map((s) => s.total), 1);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <h2 className="text-xs font-medium text-neutral-400 uppercase tracking-widest mb-3">
        By Platform
      </h2>
      <div className="space-y-2">
        {stats.slice(0, 6).map((s) => {
          const appliedPct = s.total > 0 ? Math.round((s.applied / s.total) * 100) : 0;
          return (
            <div key={s.platform} className="flex items-center gap-3">
              <span className="w-20 text-xs text-neutral-400 capitalize truncate">{s.platform}</span>
              <div className="flex-1 h-3 bg-neutral-900 rounded-sm overflow-hidden flex">
                <div
                  className="h-full bg-white/[0.20] transition-all"
                  style={{ width: `${(s.applied / maxTotal) * 100}%` }}
                />
                <div
                  className="h-full bg-white/[0.06] transition-all"
                  style={{ width: `${((s.total - s.applied) / maxTotal) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs tabular-nums text-neutral-400">{s.total}</span>
              <span className="w-10 text-right text-xs tabular-nums text-neutral-400">{appliedPct}%</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-neutral-500 mt-2">
        Bar: applied (bright) vs total. % = applied rate.
      </p>
    </div>
  );
}
