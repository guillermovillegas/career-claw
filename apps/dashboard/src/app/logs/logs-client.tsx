"use client";

import { useState, useMemo, useCallback } from "react";
import type { AutomationLog, CommunicationLog } from "@/lib/database.types";
import type { Json } from "@/lib/database.types";
import { formatRelativeTime, formatLabel, formatDateTime } from "@/lib/format";

// ─── Types ──────────────────────────────────────────────────────────

type Tab = "automation" | "communication";
type SuccessFilter = "" | "success" | "failure";

const ACTION_TYPES = [
  "job_search",
  "application_submit",
  "proposal_submit",
  "email_send",
  "follow_up",
  "profile_update",
  "calendar_sync",
] as const;

const LIMIT_OPTIONS = [50, 100, 200, 500] as const;

// ─── Date Grouping ──────────────────────────────────────────────────

function getDateGroupLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffDays = Math.round(
    (todayOnly.getTime() - dateOnly.getTime()) / 86_400_000
  );

  if (diffDays === 0) {return "Today";}
  if (diffDays === 1) {return "Yesterday";}
  if (diffDays < 7) {return `${diffDays} days ago`;}

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function getDateKey(dateStr: string): string {
  return new Date(dateStr).toISOString().split("T")[0];
}

// ─── Detail Parsing ─────────────────────────────────────────────────

interface DetailMetric {
  label: string;
  value: string;
  accent?: "emerald" | "rose" | "amber" | "blue" | "slate";
}

function parseDetailMetrics(details: Json): DetailMetric[] {
  if (details == null || typeof details !== "object" || Array.isArray(details)) {
    return [];
  }

  const d = details as Record<string, Json | undefined>;
  const metrics: DetailMetric[] = [];

  // Jobs found pattern: jobs_before, jobs_after, new_jobs
  if (d.new_jobs != null || (d.jobs_before != null && d.jobs_after != null)) {
    const newJobs = Number(d.new_jobs ?? 0);
    const before = d.jobs_before != null ? Number(d.jobs_before) : null;
    const after = d.jobs_after != null ? Number(d.jobs_after) : null;
    const rangeStr =
      before != null && after != null ? ` (${String(before)} -> ${String(after)} total)` : "";
    metrics.push({
      label: "Jobs",
      value: `${String(newJobs)} new${rangeStr}`,
      accent: newJobs > 0 ? "emerald" : "slate",
    });
  }

  // Submission pattern: submitted, failed
  if (d.submitted != null || d.failed != null) {
    const sub = Number(d.submitted ?? 0);
    const fail = Number(d.failed ?? 0);
    metrics.push({
      label: "Submitted",
      value: `${String(sub)} submitted${fail > 0 ? `, ${String(fail)} failed` : ""}`,
      accent: fail > 0 ? "rose" : "emerald",
    });
  }

  // Processed pattern
  if (d.processed != null || d.new_applications != null) {
    const proc = Number(d.processed ?? 0);
    const newApps = Number(d.new_applications ?? 0);
    metrics.push({
      label: "Processed",
      value: `${String(proc)} processed${newApps > 0 ? `, ${String(newApps)} new` : ""}`,
      accent: "blue",
    });
  }

  // QA/form audit pattern
  if (d.form_qa != null) {
    const qa = d.form_qa;
    const count =
      typeof qa === "object" && qa != null && !Array.isArray(qa)
        ? Object.keys(qa).length
        : 0;
    metrics.push({
      label: "Form QA",
      value: `${count} companies`,
      accent: "amber",
    });
  }

  // Critical audit pattern
  if (d.critical != null) {
    const mode = typeof d.mode === "string" ? d.mode : "unknown";
    const critical = Number(d.critical);
    metrics.push({
      label: "QA Audit",
      value: `${mode}: ${String(critical)} critical`,
      accent: critical > 0 ? "rose" : "emerald",
    });
  }

  // Applications created
  if (d.applications_created != null) {
    const count = Number(d.applications_created);
    metrics.push({
      label: "Applications",
      value: `${String(count)} created`,
      accent: "emerald",
    });
  }

  // Cover letters
  if (d.cover_letters_generated != null) {
    const count = Number(d.cover_letters_generated);
    metrics.push({
      label: "Cover Letters",
      value: `${String(count)} generated`,
      accent: "blue",
    });
  }

  // Proposals drafted
  if (d.proposals_drafted != null) {
    const count = Number(d.proposals_drafted);
    metrics.push({
      label: "Proposals",
      value: `${String(count)} drafted`,
      accent: "amber",
    });
  }

  // Duration
  if (d.duration_seconds != null || d.duration_ms != null) {
    const seconds = d.duration_seconds ?? (d.duration_ms ? Number(d.duration_ms) / 1000 : 0);
    metrics.push({
      label: "Duration",
      value: `${Number(seconds).toFixed(1)}s`,
      accent: "slate",
    });
  }

  return metrics;
}

function formatJsonDetails(details: Json): string {
  if (details == null) {return "";}
  if (typeof details === "string") {return details;}
  if (typeof details === "number" || typeof details === "boolean") {
    return String(details);
  }
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return "";
  }
}

// ─── Main Client Component ──────────────────────────────────────────

interface LogsClientProps {
  automationLogs: AutomationLog[];
  communicationLogs: CommunicationLog[];
}

export function LogsClient({
  automationLogs,
  communicationLogs,
}: LogsClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>("automation");

  // Automation filters
  const [actionFilter, setActionFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [successFilter, setSuccessFilter] = useState<SuccessFilter>("");
  const [limit, setLimit] = useState(100);

  // Communication filters
  const [commChannelFilter, setCommChannelFilter] = useState("");
  const [commDirectionFilter, setCommDirectionFilter] = useState("");
  const [commEntityFilter, setCommEntityFilter] = useState("");

  // Expanded row tracking
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ─── Filtered Automation Logs ───────────────────────────────────

  const filteredAutomation = useMemo(() => {
    let result = automationLogs;
    if (actionFilter) {
      result = result.filter((l) => l.action_type === actionFilter);
    }
    if (platformFilter) {
      result = result.filter(
        (l) =>
          l.platform != null &&
          l.platform.toLowerCase().includes(platformFilter.toLowerCase())
      );
    }
    if (successFilter === "success") {
      result = result.filter((l) => l.success);
    } else if (successFilter === "failure") {
      result = result.filter((l) => !l.success);
    }
    return result.slice(0, limit);
  }, [automationLogs, actionFilter, platformFilter, successFilter, limit]);

  // ─── Filtered Communication Logs ────────────────────────────────

  const filteredComm = useMemo(() => {
    let result = communicationLogs;
    if (commChannelFilter) {
      result = result.filter((l) => l.channel === commChannelFilter);
    }
    if (commDirectionFilter) {
      result = result.filter((l) => l.direction === commDirectionFilter);
    }
    if (commEntityFilter) {
      result = result.filter((l) => l.entity_type === commEntityFilter);
    }
    return result.slice(0, limit);
  }, [communicationLogs, commChannelFilter, commDirectionFilter, commEntityFilter, limit]);

  // ─── Date-grouped data ──────────────────────────────────────────

  const automationGroups = useMemo(() => {
    const groups: { label: string; key: string; logs: AutomationLog[] }[] = [];
    let currentKey = "";
    for (const log of filteredAutomation) {
      const key = getDateKey(log.created_at);
      if (key !== currentKey) {
        currentKey = key;
        groups.push({
          label: getDateGroupLabel(log.created_at),
          key,
          logs: [],
        });
      }
      groups[groups.length - 1].logs.push(log);
    }
    return groups;
  }, [filteredAutomation]);

  const commGroups = useMemo(() => {
    const groups: {
      label: string;
      key: string;
      logs: CommunicationLog[];
    }[] = [];
    let currentKey = "";
    for (const log of filteredComm) {
      const key = getDateKey(log.created_at);
      if (key !== currentKey) {
        currentKey = key;
        groups.push({
          label: getDateGroupLabel(log.created_at),
          key,
          logs: [],
        });
      }
      groups[groups.length - 1].logs.push(log);
    }
    return groups;
  }, [filteredComm]);

  // ─── Stats ──────────────────────────────────────────────────────

  const automationSuccessCount = filteredAutomation.filter(
    (l) => l.success
  ).length;
  const automationFailCount = filteredAutomation.filter(
    (l) => !l.success
  ).length;

  const hasActiveFilters =
    activeTab === "automation"
      ? Boolean(actionFilter || platformFilter || successFilter)
      : Boolean(commChannelFilter || commDirectionFilter || commEntityFilter);

  function clearFilters() {
    if (activeTab === "automation") {
      setActionFilter("");
      setPlatformFilter("");
      setSuccessFilter("");
    } else {
      setCommChannelFilter("");
      setCommDirectionFilter("");
      setCommEntityFilter("");
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-sm font-semibold text-slate-300">Logs</h1>
        <span className="text-[10px] text-slate-600">
          auto-refreshes on load
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-slate-700/50">
        <TabButton
          active={activeTab === "automation"}
          label="Automation Logs"
          count={automationLogs.length}
          onClick={() => setActiveTab("automation")}
        />
        <TabButton
          active={activeTab === "communication"}
          label="Communication Log"
          count={communicationLogs.length}
          onClick={() => setActiveTab("communication")}
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {activeTab === "automation" ? (
          <>
            <FilterSelect
              label="Action"
              value={actionFilter}
              options={ACTION_TYPES.map((a) => ({
                value: a,
                label: formatLabel(a),
              }))}
              onChange={setActionFilter}
            />
            <input
              type="text"
              placeholder="Platform..."
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="rounded border border-slate-700 bg-slate-800/80 px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-28"
            />
            <ToggleGroup
              value={successFilter}
              onChange={(v) => setSuccessFilter(v as SuccessFilter)}
              options={[
                { value: "", label: "All" },
                { value: "success", label: "OK" },
                { value: "failure", label: "Fail" },
              ]}
            />
          </>
        ) : (
          <>
            <FilterSelect
              label="Channel"
              value={commChannelFilter}
              options={[
                "email",
                "linkedin",
                "upwork",
                "fiverr",
                "phone",
                "video",
                "in_person",
              ].map((c) => ({ value: c, label: formatLabel(c) }))}
              onChange={setCommChannelFilter}
            />
            <FilterSelect
              label="Direction"
              value={commDirectionFilter}
              options={[
                { value: "outbound", label: "Outbound" },
                { value: "inbound", label: "Inbound" },
              ]}
              onChange={setCommDirectionFilter}
            />
            <FilterSelect
              label="Entity"
              value={commEntityFilter}
              options={[
                "application",
                "client",
                "contact",
                "proposal",
              ].map((e) => ({ value: e, label: formatLabel(e) }))}
              onChange={setCommEntityFilter}
            />
          </>
        )}

        <FilterSelect
          label="limit"
          value={String(limit)}
          options={LIMIT_OPTIONS.map((l) => ({
            value: String(l),
            label: String(l),
          }))}
          onChange={(v) => setLimit(Number(v))}
          hideAllOption
        />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Clear
          </button>
        )}

        <span className="ml-auto text-xs text-slate-500 tabular-nums">
          {activeTab === "automation" ? (
            <>
              {filteredAutomation.length} shown
              <span className="text-emerald-500 ml-1">
                {automationSuccessCount} ok
              </span>
              {automationFailCount > 0 && (
                <span className="text-rose-500 ml-1">
                  {automationFailCount} fail
                </span>
              )}
            </>
          ) : (
            <>{filteredComm.length} shown</>
          )}
        </span>
      </div>

      {/* Tab content */}
      {activeTab === "automation" ? (
        <AutomationTable
          groups={automationGroups}
          expandedRows={expandedRows}
          onToggle={toggleRow}
        />
      ) : (
        <CommunicationTable
          groups={commGroups}
          expandedRows={expandedRows}
          onToggle={toggleRow}
        />
      )}
    </div>
  );
}

// ─── Automation Table ───────────────────────────────────────────────

function AutomationTable({
  groups,
  expandedRows,
  onToggle,
}: {
  groups: { label: string; key: string; logs: AutomationLog[] }[];
  expandedRows: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-slate-900 px-4 py-8 text-center">
        <p className="text-sm text-slate-500">No automation runs match your filters.</p>
        <p className="mt-1 text-xs text-slate-600">
          Logs appear here after daily-search.sh or weekly-proposals.sh runs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {group.label}
            </span>
            <span className="text-[10px] text-slate-700">
              {group.logs.length} entries
            </span>
            <div className="flex-1 border-b border-slate-800" />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-700/50">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-700/50 bg-slate-800/80">
                <tr>
                  <th className="w-6 px-2 py-2" />
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
                {group.logs.map((log) => (
                  <AutomationRow
                    key={log.id}
                    log={log}
                    expanded={expandedRows.has(log.id)}
                    onToggle={() => onToggle(log.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Automation Row ─────────────────────────────────────────────────

function AutomationRow({
  log,
  expanded,
  onToggle,
}: {
  log: AutomationLog;
  expanded: boolean;
  onToggle: () => void;
}) {
  const metrics = parseDetailMetrics(log.details);
  const hasDetails =
    log.details != null ||
    log.error_message != null;

  const metricAccentMap: Record<string, string> = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
    blue: "text-blue-400",
    slate: "text-slate-500",
  };

  return (
    <>
      <tr
        className={`transition-colors cursor-pointer ${
          expanded
            ? "bg-slate-800/60"
            : "hover:bg-slate-800/40"
        }`}
        onClick={onToggle}
      >
        <td className="px-2 py-2 text-slate-600">
          {hasDetails && (
            <ChevronIcon expanded={expanded} />
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">
          {formatRelativeTime(log.created_at)}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <ActionBadge action={log.action_type} />
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-slate-500">
          {log.platform ?? <span className="text-slate-700">--</span>}
        </td>
        <td className="px-3 py-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              log.success ? "bg-emerald-400" : "bg-rose-400"
            }`}
            title={log.success ? "Success" : log.error_message ?? "Failed"}
          />
        </td>
        <td className="max-w-sm px-3 py-2">
          {log.error_message ? (
            <span className="truncate text-rose-400 block">
              {log.error_message}
            </span>
          ) : metrics.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {metrics.map((m) => (
                <span key={m.label} className="whitespace-nowrap">
                  <span className="text-slate-600">{m.label}: </span>
                  <span
                    className={
                      m.accent ? metricAccentMap[m.accent] : "text-slate-400"
                    }
                  >
                    {m.value}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <span className="text-slate-700">--</span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-slate-600">
          {log.execution_time_ms != null
            ? log.execution_time_ms.toLocaleString()
            : "--"}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr>
          <td colSpan={7} className="bg-slate-900/80 px-0 py-0">
            <ExpandedDetails log={log} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Expanded Detail View ───────────────────────────────────────────

function ExpandedDetails({ log }: { log: AutomationLog }) {
  return (
    <div className="border-t border-slate-700/30 px-6 py-3 space-y-2">
      {/* Metadata row */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <div>
          <span className="text-slate-600">ID: </span>
          <span className="font-mono text-slate-500 text-[10px]">
            {log.id}
          </span>
        </div>
        <div>
          <span className="text-slate-600">Timestamp: </span>
          <span className="text-slate-400">
            {formatDateTime(log.created_at)}
          </span>
        </div>
        {log.execution_time_ms != null && (
          <div>
            <span className="text-slate-600">Execution: </span>
            <span className="text-slate-400 tabular-nums">
              {log.execution_time_ms.toLocaleString()}ms
            </span>
          </div>
        )}
      </div>

      {/* Error message */}
      {log.error_message && (
        <div className="rounded border border-rose-700/30 bg-rose-900/10 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase text-rose-500">
            Error
          </span>
          <p className="text-xs text-rose-300 mt-0.5 break-all">
            {log.error_message}
          </p>
        </div>
      )}

      {/* JSON details */}
      {log.details != null && (
        <div>
          <span className="text-[10px] font-semibold uppercase text-slate-600 block mb-1">
            Full Details
          </span>
          <pre className="rounded bg-slate-950 border border-slate-800 px-3 py-2 text-[11px] text-slate-400 overflow-x-auto max-h-64 overflow-y-auto font-mono leading-relaxed">
            {formatJsonDetails(log.details)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Communication Table ────────────────────────────────────────────

function CommunicationTable({
  groups,
  expandedRows,
  onToggle,
}: {
  groups: { label: string; key: string; logs: CommunicationLog[] }[];
  expandedRows: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-slate-900 px-4 py-8 text-center">
        <p className="text-sm text-slate-500">
          No communication logs match your filters.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Logs appear here when emails or messages are tracked.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {group.label}
            </span>
            <span className="text-[10px] text-slate-700">
              {group.logs.length} entries
            </span>
            <div className="flex-1 border-b border-slate-800" />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-700/50">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-700/50 bg-slate-800/80">
                <tr>
                  <th className="w-6 px-2 py-2" />
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">
                    Time
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">
                    Dir
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">
                    Channel
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">
                    Entity
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">
                    Subject
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">
                    Sentiment
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {group.logs.map((log) => (
                  <CommRow
                    key={log.id}
                    log={log}
                    expanded={expandedRows.has(log.id)}
                    onToggle={() => onToggle(log.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Communication Row ──────────────────────────────────────────────

function CommRow({
  log,
  expanded,
  onToggle,
}: {
  log: CommunicationLog;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasDetails =
    log.content_summary != null || log.full_content != null;

  return (
    <>
      <tr
        className={`transition-colors cursor-pointer ${
          expanded
            ? "bg-slate-800/60"
            : "hover:bg-slate-800/40"
        }`}
        onClick={onToggle}
      >
        <td className="px-2 py-2 text-slate-600">
          {hasDetails && <ChevronIcon expanded={expanded} />}
        </td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">
          {formatRelativeTime(log.created_at)}
        </td>
        <td className="px-3 py-2">
          <DirectionBadge direction={log.direction} />
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <ChannelBadge channel={log.channel} />
        </td>
        <td className="px-3 py-2">
          <span className="text-slate-500 capitalize">
            {log.entity_type}
          </span>
          <span
            className="ml-1.5 font-mono text-[10px] text-slate-600"
            title={log.entity_id}
          >
            {log.entity_id.slice(0, 8)}
          </span>
        </td>
        <td className="max-w-xs px-3 py-2">
          {log.subject ? (
            <span className="text-slate-300 truncate block">
              {log.subject}
            </span>
          ) : (
            <span className="text-slate-700">--</span>
          )}
        </td>
        <td className="px-3 py-2">
          <SentimentBadge sentiment={log.sentiment} />
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr>
          <td colSpan={7} className="bg-slate-900/80 px-0 py-0">
            <CommExpandedDetails log={log} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Communication Expanded Details ─────────────────────────────────

function CommExpandedDetails({ log }: { log: CommunicationLog }) {
  return (
    <div className="border-t border-slate-700/30 px-6 py-3 space-y-2">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <div>
          <span className="text-slate-600">ID: </span>
          <span className="font-mono text-slate-500 text-[10px]">
            {log.id}
          </span>
        </div>
        <div>
          <span className="text-slate-600">Timestamp: </span>
          <span className="text-slate-400">
            {formatDateTime(log.created_at)}
          </span>
        </div>
        <div>
          <span className="text-slate-600">Entity: </span>
          <span className="text-slate-400 capitalize">
            {log.entity_type}
          </span>
          <span className="ml-1 font-mono text-slate-500 text-[10px]">
            {log.entity_id}
          </span>
        </div>
      </div>

      {log.content_summary && (
        <div>
          <span className="text-[10px] font-semibold uppercase text-slate-600 block mb-1">
            Summary
          </span>
          <p className="text-xs text-slate-300 leading-relaxed">
            {log.content_summary}
          </p>
        </div>
      )}

      {log.full_content && (
        <div>
          <span className="text-[10px] font-semibold uppercase text-slate-600 block mb-1">
            Full Content
          </span>
          <pre className="rounded bg-slate-950 border border-slate-800 px-3 py-2 text-[11px] text-slate-400 overflow-x-auto max-h-64 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
            {log.full_content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Shared UI Components ───────────────────────────────────────────

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative pb-2 text-xs font-medium transition-colors ${
        active
          ? "text-emerald-400"
          : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {label}
      <span
        className={`ml-1.5 tabular-nums ${
          active ? "text-emerald-400/70" : "text-slate-600"
        }`}
      >
        {count}
      </span>
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-px bg-emerald-400" />
      )}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  hideAllOption,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
  hideAllOption?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-slate-700 bg-slate-800/80 px-2 py-1 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
    >
      {!hideAllOption && <option value="">All {label}s</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function ToggleGroup({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
}) {
  return (
    <div className="flex rounded border border-slate-700 overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2 py-1 text-xs transition-colors ${
            value === opt.value
              ? "bg-slate-700 text-slate-200"
              : "bg-slate-800/80 text-slate-500 hover:text-slate-300"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    job_search: "bg-blue-500/15 text-blue-400",
    application_submit: "bg-emerald-500/15 text-emerald-400",
    proposal_submit: "bg-amber-500/15 text-amber-400",
    email_send: "bg-violet-500/15 text-violet-400",
    follow_up: "bg-orange-500/15 text-orange-400",
    profile_update: "bg-cyan-500/15 text-cyan-400",
    calendar_sync: "bg-pink-500/15 text-pink-400",
  };

  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${
        styles[action] ?? "bg-slate-700/50 text-slate-400"
      }`}
    >
      {formatLabel(action)}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: "outbound" | "inbound" }) {
  if (direction === "inbound") {
    return (
      <span className="inline-flex items-center gap-1 text-blue-400" title="Inbound">
        <ArrowDownIcon className="h-3 w-3" />
        <span className="text-[10px] font-medium">In</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-emerald-400" title="Outbound">
      <ArrowUpIcon className="h-3 w-3" />
      <span className="text-[10px] font-medium">Out</span>
    </span>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const styles: Record<string, string> = {
    email: "bg-blue-500/15 text-blue-400",
    linkedin: "bg-sky-500/15 text-sky-400",
    upwork: "bg-emerald-500/15 text-emerald-400",
    fiverr: "bg-green-500/15 text-green-400",
    phone: "bg-amber-500/15 text-amber-400",
    video: "bg-violet-500/15 text-violet-400",
    in_person: "bg-orange-500/15 text-orange-400",
  };

  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${
        styles[channel] ?? "bg-slate-700/50 text-slate-400"
      }`}
    >
      {formatLabel(channel)}
    </span>
  );
}

function SentimentBadge({
  sentiment,
}: {
  sentiment: "positive" | "neutral" | "negative" | null;
}) {
  if (!sentiment) {return <span className="text-slate-700">--</span>;}

  const map: Record<string, { style: string; label: string }> = {
    positive: {
      style: "bg-emerald-500/15 text-emerald-400",
      label: "Positive",
    },
    neutral: {
      style: "bg-slate-700/50 text-slate-400",
      label: "Neutral",
    },
    negative: {
      style: "bg-rose-500/15 text-rose-400",
      label: "Negative",
    },
  };

  const { style, label } = map[sentiment] ?? map.neutral;

  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${style}`}
    >
      {label}
    </span>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-3 w-3 transition-transform ${
        expanded ? "rotate-90" : ""
      }`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 4.5l7.5 7.5-7.5 7.5"
      />
    </svg>
  );
}

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"
      />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
      />
    </svg>
  );
}
