"use client";

import { useState, useMemo } from "react";
import type { ApplicationWithJob } from "@/lib/database.types";
import { StatusBadge } from "@/components/status-badge";
import { ScoreBadge } from "@/components/score-badge";
import { PriorityStars } from "@/components/priority-stars";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/format";

interface ApplicationsTableProps {
  applications: ApplicationWithJob[];
}

type SortKey =
  | "status"
  | "role"
  | "company"
  | "work_mode"
  | "platform"
  | "match_score"
  | "priority"
  | "next_followup_date"
  | "application_date";

function getSortValue(app: ApplicationWithJob, key: SortKey): string | number | null {
  switch (key) {
    case "status":
      return app.status;
    case "role":
      return app.jobs?.title ?? null;
    case "company":
      return app.jobs?.company ?? null;
    case "work_mode":
      return app.jobs?.work_mode ?? null;
    case "platform":
      return app.platform;
    case "match_score":
      return app.match_score;
    case "priority":
      return app.priority;
    case "next_followup_date":
      return app.next_followup_date;
    case "application_date":
      return app.application_date ?? app.created_at;
  }
}

export function ApplicationsTable({ applications }: ApplicationsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("application_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedApps = useMemo(() => {
    const sorted = [...applications].toSorted((a, b) => {
      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);
      if (aVal == null && bVal == null) {return 0;}
      if (aVal == null) {return 1;}
      if (bVal == null) {return -1;}
      if (typeof aVal === "string" && typeof bVal === "string") {
        return aVal.localeCompare(bVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return aVal - bVal;
      }
      return 0;
    });
    if (sortDir === "desc") {sorted.reverse();}
    return sorted;
  }, [applications, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortHeader({
    label,
    column,
  }: {
    label: string;
    column: SortKey;
  }) {
    const isActive = sortKey === column;
    return (
      <button
        type="button"
        onClick={() => handleSort(column)}
        className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${
          isActive ? "text-emerald-400" : "text-slate-400 hover:text-slate-300"
        }`}
      >
        {label}
        {isActive && (
          <span className="text-[10px]">
            {sortDir === "asc" ? "\u25B2" : "\u25BC"}
          </span>
        )}
      </button>
    );
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        title="No applications yet"
        description="Applications will appear here once you start tracking them"
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700/50">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-700/50 bg-slate-800/80">
          <tr>
            <th className="px-4 py-3">
              <SortHeader label="Status" column="status" />
            </th>
            <th className="px-4 py-3">
              <SortHeader label="Role" column="role" />
            </th>
            <th className="px-4 py-3">
              <SortHeader label="Company" column="company" />
            </th>
            <th className="px-4 py-3">
              <SortHeader label="Mode" column="work_mode" />
            </th>
            <th className="px-4 py-3">
              <SortHeader label="Platform" column="platform" />
            </th>
            <th className="px-4 py-3">
              <SortHeader label="Score" column="match_score" />
            </th>
            <th className="px-4 py-3">
              <SortHeader label="Priority" column="priority" />
            </th>
            <th className="px-4 py-3">
              <SortHeader label="Follow-up" column="next_followup_date" />
            </th>
            <th className="px-4 py-3">
              <SortHeader label="Applied" column="application_date" />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/30">
          {sortedApps.map((app) => (
            <ApplicationRow
              key={app.id}
              app={app}
              expanded={expandedId === app.id}
              onToggle={() =>
                setExpandedId(expandedId === app.id ? null : app.id)
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApplicationRow({
  app,
  expanded,
  onToggle,
}: {
  app: ApplicationWithJob;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isOverdue =
    app.next_followup_date &&
    !["rejected", "withdrawn", "hired"].includes(app.status) &&
    new Date(app.next_followup_date) < new Date();

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer transition-colors hover:bg-slate-800/50"
      >
        <td className="px-4 py-3">
          <StatusBadge status={app.status} />
        </td>
        <td className="px-4 py-3 font-medium text-slate-200">
          {app.jobs?.title ?? "Unknown Role"}
        </td>
        <td className="px-4 py-3 text-slate-300">
          {app.jobs?.company ?? "--"}
        </td>
        <td className="px-4 py-3">
          <WorkModeBadge mode={app.jobs?.work_mode ?? null} />
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={app.platform} />
        </td>
        <td className="px-4 py-3">
          <ScoreBadge score={app.match_score} />
        </td>
        <td className="px-4 py-3">
          <PriorityStars priority={app.priority} />
        </td>
        <td className="px-4 py-3">
          {app.next_followup_date ? (
            <span
              className={`text-sm ${
                isOverdue
                  ? "font-semibold text-rose-400"
                  : "text-slate-400"
              }`}
            >
              {formatDate(app.next_followup_date)}
              {isOverdue && (
                <span className="ml-1 text-xs text-rose-500">overdue</span>
              )}
            </span>
          ) : (
            <span className="text-slate-500">--</span>
          )}
        </td>
        <td className="px-4 py-3 text-slate-400">
          {formatDate(app.application_date ?? app.created_at)}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-900/60">
          <td colSpan={9} className="px-6 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
              <Detail
                label="Salary Expectation"
                value={
                  app.salary_expectation != null
                    ? `$${app.salary_expectation.toLocaleString()}`
                    : "--"
                }
              />
              <Detail label="Source" value={app.source ?? "--"} />
              <Detail
                label="Referral Contact"
                value={app.referral_contact ?? "--"}
              />
              <Detail
                label="Last Contact"
                value={formatDate(app.last_contact_date)}
              />
            </div>
            {app.notes && (
              <div className="mt-3">
                <p className="text-xs text-slate-500">Notes</p>
                <p className="mt-1 text-sm text-slate-400">{app.notes}</p>
              </div>
            )}
            {app.cover_letter && (
              <div className="mt-3">
                <p className="text-xs text-slate-500">Cover Letter</p>
                <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-800/50 p-3 text-sm text-slate-400">
                  {app.cover_letter}
                </p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function WorkModeBadge({ mode }: { mode: string | null }) {
  if (!mode) {return <span className="text-slate-500">--</span>;}
  const styles: Record<string, string> = {
    remote: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    hybrid: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    "on-site": "bg-rose-500/20 text-rose-300 border-rose-500/30",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${styles[mode] ?? "bg-slate-700 text-slate-300 border-slate-600"}`}
    >
      {mode}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-slate-300">{value}</p>
    </div>
  );
}
