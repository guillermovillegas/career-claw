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
  accent?: "white" | "dark" | "mid" | "light" | "muted";
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
      accent: newJobs > 0 ? "white" : "muted",
    });
  }

  // Submission pattern: submitted, failed
  if (d.submitted != null || d.failed != null) {
    const sub = Number(d.submitted ?? 0);
    const fail = Number(d.failed ?? 0);
    metrics.push({
      label: "Submitted",
      value: `${String(sub)} submitted${fail > 0 ? `, ${String(fail)} failed` : ""}`,
      accent: fail > 0 ? "dark" : "white",
    });
  }

  // Processed pattern
  if (d.processed != null || d.new_applications != null) {
    const proc = Number(d.processed ?? 0);
    const newApps = Number(d.new_applications ?? 0);
    metrics.push({
      label: "Processed",
      value: `${String(proc)} processed${newApps > 0 ? `, ${String(newApps)} new` : ""}`,
      accent: "light",
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
      accent: "mid",
    });
  }

  // Critical audit pattern
  if (d.critical != null) {
    const mode = typeof d.mode === "string" ? d.mode : "unknown";
    const critical = Number(d.critical);
    metrics.push({
      label: "QA Audit",
      value: `${mode}: ${String(critical)} critical`,
      accent: critical > 0 ? "dark" : "white",
    });
  }

  // Applications created
  if (d.applications_created != null) {
    const count = Number(d.applications_created);
    metrics.push({
      label: "Applications",
      value: `${String(count)} created`,
      accent: "white",
    });
  }

  // Cover letters
  if (d.cover_letters_generated != null) {
    const count = Number(d.cover_letters_generated);
    metrics.push({
      label: "Cover Letters",
      value: `${String(count)} generated`,
      accent: "light",
    });
  }

  // Proposals drafted
  if (d.proposals_drafted != null) {
    const count = Number(d.proposals_drafted);
    metrics.push({
      label: "Proposals",
      value: `${String(count)} drafted`,
      accent: "mid",
    });
  }

  // Duration
  if (d.duration_seconds != null || d.duration_ms != null) {
    const seconds = d.duration_seconds ?? (d.duration_ms ? Number(d.duration_ms) / 1000 : 0);
    metrics.push({
      label: "Duration",
      value: `${Number(seconds).toFixed(1)}s`,
      accent: "muted",
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
        <h1 className="text-sm font-semibold text-neutral-300">Logs</h1>
        <span className="text-xs text-neutral-400">
          auto-refreshes on load
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-neutral-700/50">
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
              className="rounded border border-neutral-700 bg-neutral-800/80 px-2 py-1 text-xs text-neutral-300 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 w-28"
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
            className="text-xs text-neutral-400 hover:text-neutral-200"
          >
            Clear
          </button>
        )}

        <span className="ml-auto text-xs text-neutral-400 tabular-nums">
          {activeTab === "automation" ? (
            <>
              {filteredAutomation.length} shown
              <span className="text-white ml-1">
                {automationSuccessCount} ok
              </span>
              {automationFailCount > 0 && (
                <span className="text-neutral-400 ml-1">
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
      <div className="rounded-lg border border-neutral-700/50 bg-neutral-900 px-4 py-8 text-center">
        <p className="text-sm text-neutral-400">No automation runs match your filters.</p>
        <p className="mt-1 text-xs text-neutral-400">
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
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {group.label}
            </span>
            <span className="text-xs text-neutral-500">
              {group.logs.length} entries
            </span>
            <div className="flex-1 border-b border-neutral-800" />
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-700/50">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-700/50 bg-neutral-800/80">
                <tr>
                  <th className="w-6 px-2 py-2" />
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-neutral-400">
                    Time
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-neutral-400">
                    Action
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-neutral-400">
                    Platform
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-neutral-400">
                    OK
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-neutral-400">
                    Details
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-neutral-400 text-right">
                    ms
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
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
    white: "text-white",
    dark: "text-neutral-400",
    mid: "text-neutral-400",
    light: "text-neutral-300",
    muted: "text-neutral-400",
  };

  return (
    <>
      <tr
        className={`transition-colors cursor-pointer ${
          expanded
            ? "bg-neutral-800/60"
            : "hover:bg-neutral-800/40"
        }`}
        onClick={onToggle}
      >
        <td className="px-2 py-2 text-neutral-400">
          {hasDetails && (
            <ChevronIcon expanded={expanded} />
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-neutral-400">
          {formatRelativeTime(log.created_at)}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <ActionBadge action={log.action_type} />
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-neutral-400">
          {log.platform ?? <span className="text-neutral-500">--</span>}
        </td>
        <td className="px-3 py-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              log.success ? "bg-neutral-300" : "bg-neutral-500"
            }`}
            title={log.success ? "Success" : log.error_message ?? "Failed"}
          />
        </td>
        <td className="max-w-sm px-3 py-2">
          {log.error_message ? (
            <span className="truncate text-neutral-400 block">
              {log.error_message}
            </span>
          ) : metrics.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {metrics.map((m) => (
                <span key={m.label} className="whitespace-nowrap">
                  <span className="text-neutral-400">{m.label}: </span>
                  <span
                    className={
                      m.accent ? metricAccentMap[m.accent] : "text-neutral-400"
                    }
                  >
                    {m.value}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <span className="text-neutral-500">--</span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-neutral-400">
          {log.execution_time_ms != null
            ? log.execution_time_ms.toLocaleString()
            : "--"}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr>
          <td colSpan={7} className="bg-neutral-900/80 px-0 py-0">
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
    <div className="border-t border-neutral-700/30 px-6 py-3 space-y-2">
      {/* Metadata row */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <div>
          <span className="text-neutral-400">ID: </span>
          <span className="font-mono text-neutral-400 text-xs">
            {log.id}
          </span>
        </div>
        <div>
          <span className="text-neutral-400">Timestamp: </span>
          <span className="text-neutral-400">
            {formatDateTime(log.created_at)}
          </span>
        </div>
        {log.execution_time_ms != null && (
          <div>
            <span className="text-neutral-400">Execution: </span>
            <span className="text-neutral-400 tabular-nums">
              {log.execution_time_ms.toLocaleString()}ms
            </span>
          </div>
        )}
      </div>

      {/* Error message */}
      {log.error_message && (
        <div className="rounded border border-neutral-700/30 bg-neutral-900/10 px-3 py-2">
          <span className="text-xs font-semibold uppercase text-neutral-400">
            Error
          </span>
          <p className="text-xs text-neutral-400 mt-0.5 break-all">
            {log.error_message}
          </p>
        </div>
      )}

      {/* JSON details */}
      {log.details != null && (
        <div>
          <span className="text-xs font-semibold uppercase text-neutral-400 block mb-1">
            Full Details
          </span>
          <pre className="rounded bg-neutral-950 border border-neutral-800 px-3 py-2 text-xs text-neutral-400 overflow-x-auto max-h-64 overflow-y-auto font-mono leading-relaxed">
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
      <div className="rounded-lg border border-neutral-700/50 bg-neutral-900 px-4 py-8 text-center">
        <p className="text-sm text-neutral-400">
          No communication logs match your filters.
        </p>
        <p className="mt-1 text-xs text-neutral-400">
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
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {group.label}
            </span>
            <span className="text-xs text-neutral-500">
              {group.logs.length} entries
            </span>
            <div className="flex-1 border-b border-neutral-800" />
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-700/50">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-700/50 bg-neutral-800/80">
                <tr>
                  <th className="w-6 px-2 py-2" />
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-neutral-400">
                    Time
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-neutral-400">
                    Dir
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-neutral-400">
                    Channel
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-neutral-400">
                    Entity
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-neutral-400">
                    Subject
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-neutral-400">
                    Sentiment
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
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
            ? "bg-neutral-800/60"
            : "hover:bg-neutral-800/40"
        }`}
        onClick={onToggle}
      >
        <td className="px-2 py-2 text-neutral-400">
          {hasDetails && <ChevronIcon expanded={expanded} />}
        </td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-neutral-400">
          {formatRelativeTime(log.created_at)}
        </td>
        <td className="px-3 py-2">
          <DirectionBadge direction={log.direction} />
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <ChannelBadge channel={log.channel} />
        </td>
        <td className="px-3 py-2">
          <span className="text-neutral-400 capitalize">
            {log.entity_type}
          </span>
          <span
            className="ml-1.5 font-mono text-xs text-neutral-400"
            title={log.entity_id}
          >
            {log.entity_id.slice(0, 8)}
          </span>
        </td>
        <td className="max-w-xs px-3 py-2">
          {log.subject ? (
            <span className="text-neutral-300 truncate block">
              {log.subject}
            </span>
          ) : (
            <span className="text-neutral-500">--</span>
          )}
        </td>
        <td className="px-3 py-2">
          <SentimentBadge sentiment={log.sentiment} />
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr>
          <td colSpan={7} className="bg-neutral-900/80 px-0 py-0">
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
    <div className="border-t border-neutral-700/30 px-6 py-3 space-y-2">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <div>
          <span className="text-neutral-400">ID: </span>
          <span className="font-mono text-neutral-400 text-xs">
            {log.id}
          </span>
        </div>
        <div>
          <span className="text-neutral-400">Timestamp: </span>
          <span className="text-neutral-400">
            {formatDateTime(log.created_at)}
          </span>
        </div>
        <div>
          <span className="text-neutral-400">Entity: </span>
          <span className="text-neutral-400 capitalize">
            {log.entity_type}
          </span>
          <span className="ml-1 font-mono text-neutral-400 text-xs">
            {log.entity_id}
          </span>
        </div>
      </div>

      {log.content_summary && (
        <div>
          <span className="text-xs font-semibold uppercase text-neutral-400 block mb-1">
            Summary
          </span>
          <p className="text-xs text-neutral-300 leading-relaxed">
            {log.content_summary}
          </p>
        </div>
      )}

      {log.full_content && (
        <div>
          <span className="text-xs font-semibold uppercase text-neutral-400 block mb-1">
            Full Content
          </span>
          <pre className="rounded bg-neutral-950 border border-neutral-800 px-3 py-2 text-xs text-neutral-400 overflow-x-auto max-h-64 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
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
          ? "text-white"
          : "text-neutral-400 hover:text-neutral-300"
      }`}
    >
      {label}
      <span
        className={`ml-1.5 tabular-nums ${
          active ? "text-white/70" : "text-neutral-400"
        }`}
      >
        {count}
      </span>
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-px bg-neutral-300" />
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
      className="rounded border border-neutral-700 bg-neutral-800/80 px-2 py-1 text-xs text-neutral-300 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
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
    <div className="flex rounded border border-neutral-700 overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2 py-1 text-xs transition-colors ${
            value === opt.value
              ? "bg-neutral-700 text-neutral-200"
              : "bg-neutral-800/80 text-neutral-400 hover:text-neutral-300"
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
    job_search: "bg-neutral-300/15 text-neutral-300",
    application_submit: "bg-neutral-300/15 text-white",
    proposal_submit: "bg-neutral-400/15 text-neutral-400",
    email_send: "bg-neutral-500/15 text-neutral-400",
    follow_up: "bg-neutral-500/15 text-neutral-400",
    profile_update: "bg-neutral-400/15 text-neutral-400",
    calendar_sync: "bg-neutral-500/15 text-neutral-400",
  };

  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
        styles[action] ?? "bg-neutral-700/50 text-neutral-400"
      }`}
    >
      {formatLabel(action)}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: "outbound" | "inbound" }) {
  if (direction === "inbound") {
    return (
      <span className="inline-flex items-center gap-1 text-neutral-300" title="Inbound">
        <ArrowDownIcon className="h-3 w-3" />
        <span className="text-xs font-medium">In</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-white" title="Outbound">
      <ArrowUpIcon className="h-3 w-3" />
      <span className="text-xs font-medium">Out</span>
    </span>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const styles: Record<string, string> = {
    email: "bg-neutral-300/15 text-neutral-300",
    linkedin: "bg-neutral-400/15 text-neutral-400",
    upwork: "bg-neutral-300/15 text-white",
    fiverr: "bg-neutral-300/15 text-neutral-300",
    phone: "bg-neutral-400/15 text-neutral-400",
    video: "bg-neutral-500/15 text-neutral-400",
    in_person: "bg-neutral-500/15 text-neutral-400",
  };

  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
        styles[channel] ?? "bg-neutral-700/50 text-neutral-400"
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
  if (!sentiment) {return <span className="text-neutral-500">--</span>;}

  const map: Record<string, { style: string; label: string }> = {
    positive: {
      style: "bg-neutral-300/15 text-white",
      label: "Positive",
    },
    neutral: {
      style: "bg-neutral-700/50 text-neutral-400",
      label: "Neutral",
    },
    negative: {
      style: "bg-neutral-500/15 text-neutral-400",
      label: "Negative",
    },
  };

  const { style, label } = map[sentiment] ?? map.neutral;

  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${style}`}
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
