import { getAutomationLogs } from "@/lib/queries";
import { formatRelativeTime, formatLabel } from "@/lib/format";
import type { AutomationLog } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  let logs: AutomationLog[] = [];
  let fetchError: string | null = null;
  try {
    logs = await getAutomationLogs(100);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-sm font-semibold text-slate-300">
          Automation Logs
          <span className="ml-2 text-xs font-normal text-slate-500">
            last {logs.length} runs
          </span>
        </h1>
        <span className="text-[10px] text-slate-600">auto-refreshes on load</span>
      </div>

      {fetchError ? (
        <div className="rounded-lg border border-rose-700/50 bg-rose-900/10 px-4 py-6">
          <p className="text-xs font-semibold text-rose-400 mb-1">Query error</p>
          <p className="text-xs text-rose-300 font-mono break-all">{fetchError}</p>
          <p className="mt-2 text-xs text-slate-500">Check Supabase RLS policies on automation_logs table.</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-slate-700/50 bg-slate-900 px-4 py-8 text-center">
          <p className="text-sm text-slate-500">No automation runs recorded yet.</p>
          <p className="mt-1 text-xs text-slate-600">Logs appear here after daily-search.sh or weekly-proposals.sh runs.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700/50">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-700/50 bg-slate-800/80">
              <tr>
                <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">
                  Time
                </th>
                <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">
                  Action
                </th>
                <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">
                  Platform
                </th>
                <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">
                  OK
                </th>
                <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">
                  Details
                </th>
                <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400 text-right">
                  ms
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {logs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Log Row ─────────────────────────────────────────────────────────

function LogRow({ log }: { log: AutomationLog }) {
  const detailsStr = formatDetails(log.details);

  return (
    <tr className="hover:bg-slate-800/40 transition-colors">
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">
        {formatRelativeTime(log.created_at)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-300">
        {formatLabel(log.action_type)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-500">
        {log.platform ?? <span className="text-slate-700">—</span>}
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            log.success ? "bg-emerald-400" : "bg-rose-400"
          }`}
          title={log.success ? "Success" : log.error_message ?? "Failed"}
        />
      </td>
      <td className="max-w-xs px-3 py-2 text-slate-500">
        {log.error_message ? (
          <span className="truncate text-rose-400">{log.error_message}</span>
        ) : detailsStr ? (
          <span className="truncate text-slate-600" title={detailsStr}>
            {detailsStr.slice(0, 80)}{detailsStr.length > 80 ? "…" : ""}
          </span>
        ) : (
          <span className="text-slate-700">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-slate-600">
        {log.execution_time_ms != null ? log.execution_time_ms : "—"}
      </td>
    </tr>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDetails(details: AutomationLog["details"]): string {
  if (details == null) {return "";}
  if (typeof details === "string") {return details;}
  if (typeof details === "number" || typeof details === "boolean") {
    return String(details);
  }
  try {
    return JSON.stringify(details);
  } catch {
    return "";
  }
}
