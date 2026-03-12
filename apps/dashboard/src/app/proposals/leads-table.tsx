"use client";

import { useState, useMemo, useCallback } from "react";
import type { Job } from "@/lib/database.types";
import { ScoreBadge } from "@/components/score-badge";
import { formatDate, formatCurrency } from "@/lib/format";

interface LeadsTableProps {
  leads: Job[];
}

type SortField = "match_score" | "platform" | "posting_date" | "title" | "salary_max";
type SortDir = "asc" | "desc";

const PLATFORMS = ["upwork", "fiverr"] as const;
const SCORE_FILTERS = [
  { label: "All", min: 0 },
  { label: "60+", min: 60 },
  { label: "80+", min: 80 },
  { label: "90+", min: 90 },
] as const;

export function LeadsTable({ leads }: LeadsTableProps) {
  const [sortField, setSortField] = useState<SortField>("match_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterPlatform, setFilterPlatform] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("desc");
      return field;
    });
  }, []);

  const filtered = useMemo(() => {
    let result = leads;
    if (filterPlatform) {
      result = result.filter((j) => j.platform === filterPlatform);
    }
    if (minScore > 0) {
      result = result.filter((j) => (j.match_score ?? 0) >= minScore);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          (j.company?.toLowerCase().includes(q) ?? false) ||
          (j.description?.toLowerCase().includes(q) ?? false) ||
          (Array.isArray(j.skills_required) &&
            j.skills_required.some(
              (s) => typeof s === "string" && s.toLowerCase().includes(q)
            ))
      );
    }
    const mult = sortDir === "asc" ? 1 : -1;
    return [...result].toSorted((a, b) => {
      switch (sortField) {
        case "match_score":
          return mult * ((a.match_score ?? 0) - (b.match_score ?? 0));
        case "platform":
          return mult * a.platform.localeCompare(b.platform);
        case "title":
          return mult * a.title.localeCompare(b.title);
        case "salary_max":
          return mult * ((a.salary_max ?? 0) - (b.salary_max ?? 0));
        case "posting_date":
        default:
          return (
            mult *
            (new Date(a.posting_date ?? a.created_at).getTime() -
              new Date(b.posting_date ?? b.created_at).getTime())
          );
      }
    });
  }, [leads, filterPlatform, minScore, search, sortField, sortDir]);

  return (
    <div className="rounded-lg border border-neutral-700/50">
      {/* Header */}
      <div className="border-b border-neutral-700/50 bg-neutral-800/80 px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Discovered Leads
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Platform filter */}
          <div className="flex rounded border border-neutral-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setFilterPlatform("")}
              className={`px-2 py-1 text-xs transition-colors ${
                filterPlatform === ""
                  ? "bg-neutral-700 text-neutral-200"
                  : "bg-neutral-800/80 text-neutral-400 hover:text-neutral-300"
              }`}
            >
              All
            </button>
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFilterPlatform(p)}
                className={`px-2 py-1 text-xs capitalize transition-colors ${
                  filterPlatform === p
                    ? "bg-neutral-700 text-neutral-200"
                    : "bg-neutral-800/80 text-neutral-400 hover:text-neutral-300"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {/* Score filter */}
          <div className="flex rounded border border-neutral-700 overflow-hidden">
            {SCORE_FILTERS.map((sf) => (
              <button
                key={sf.label}
                type="button"
                onClick={() => setMinScore(sf.min)}
                className={`px-2 py-1 text-xs transition-colors ${
                  minScore === sf.min
                    ? "bg-neutral-700 text-neutral-200"
                    : "bg-neutral-800/80 text-neutral-400 hover:text-neutral-300"
                }`}
              >
                {sf.label}
              </button>
            ))}
          </div>
          {/* Search */}
          <input
            type="text"
            placeholder="Search title, skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-800/80 px-2 py-1 text-xs text-neutral-300 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none w-40"
          />
          <span className="text-xs text-neutral-500 tabular-nums">{filtered.length}</span>
        </div>
      </div>
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-700/50 bg-neutral-900/60">
            <tr>
              <SortHeader label="Score" field="match_score" current={sortField} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Project" field="title" current={sortField} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Platform" field="platform" current={sortField} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Budget" field="salary_max" current={sortField} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Posted" field="posting_date" current={sortField} dir={sortDir} onSort={toggleSort} />
              <th className="px-3 py-2 w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-neutral-500">
                  No leads match your filters
                </td>
              </tr>
            ) : (
              filtered.map((job) => (
                <JobLeadRow
                  key={job.id}
                  job={job}
                  expanded={expandedId === job.id}
                  onToggle={() =>
                    setExpandedId(expandedId === job.id ? null : job.id)
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  field,
  current,
  dir,
  onSort,
}: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const isActive = current === field;
  return (
    <th
      className="px-3 py-2 font-semibold uppercase tracking-wider text-neutral-400 cursor-pointer select-none hover:text-neutral-300 transition-colors"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <span className="text-white">{dir === "asc" ? "\u2191" : "\u2193"}</span>
        )}
      </span>
    </th>
  );
}

function JobLeadRow({
  job,
  expanded,
  onToggle,
}: {
  job: Job;
  expanded: boolean;
  onToggle: () => void;
}) {
  const skills = Array.isArray(job.skills_required)
    ? (job.skills_required as string[])
    : [];

  const budgetStr =
    job.salary_min != null || job.salary_max != null
      ? [
          job.salary_min != null ? formatCurrency(Number(job.salary_min)) : "",
          job.salary_max != null ? formatCurrency(Number(job.salary_max)) : "",
        ]
          .filter(Boolean)
          .join(" - ")
      : null;

  return (
    <>
      <tr
        className={`transition-colors cursor-pointer ${
          expanded ? "bg-neutral-800/60" : "hover:bg-neutral-800/40"
        }`}
        onClick={onToggle}
      >
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <ScoreBadge score={job.match_score} />
            {job.match_score != null && (
              <span className="text-xs text-neutral-400 tabular-nums">%</span>
            )}
          </div>
        </td>
        <td className="px-3 py-2 max-w-sm">
          <p className="font-medium text-neutral-200 truncate">{job.title}</p>
          {job.company && job.company !== "Upwork Client" && job.company !== "Fiverr Buyer Request" && (
            <p className="text-neutral-400 truncate text-[11px]">{job.company}</p>
          )}
          {!expanded && skills.length > 0 && (
            <div className="flex gap-1 mt-0.5 flex-wrap">
              {skills.slice(0, 4).map((s) => (
                <span
                  key={s}
                  className="inline-block rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400"
                >
                  {s}
                </span>
              ))}
              {skills.length > 4 && (
                <span className="text-[10px] text-neutral-500">+{skills.length - 4}</span>
              )}
            </div>
          )}
        </td>
        <td className="px-3 py-2 capitalize text-neutral-400">{job.platform}</td>
        <td className="px-3 py-2 tabular-nums text-neutral-400">
          {budgetStr ?? <span className="text-neutral-600">--</span>}
        </td>
        <td className="px-3 py-2 tabular-nums text-neutral-400">
          {formatDate(job.posting_date ?? job.created_at)}
        </td>
        <td className="px-3 py-2">
          {job.url ? (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-white transition-colors"
              title="Open project"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span className="text-neutral-600 text-xs" title="No link available">
              <NoLinkIcon className="h-3.5 w-3.5" />
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-neutral-900/80 px-0 py-0">
            <div className="border-t border-neutral-700/30 px-4 py-3 space-y-2">
              {job.description && (
                <p className="text-xs text-neutral-400 leading-relaxed">
                  {job.description}
                </p>
              )}
              {skills.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {skills.map((s) => (
                    <span
                      key={s}
                      className="inline-block rounded bg-neutral-800 border border-neutral-700/50 px-2 py-0.5 text-[11px] text-neutral-300"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-4 text-[11px] text-neutral-500 pt-1">
                {budgetStr && <span>Budget: {budgetStr}</span>}
                {job.work_mode && <span className="capitalize">{job.work_mode}</span>}
                {job.job_type && <span className="capitalize">{job.job_type}</span>}
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-400 hover:text-white transition-colors underline underline-offset-2"
                  >
                    Apply on {job.platform}
                  </a>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
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

function NoLinkIcon({ className }: { className?: string }) {
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
        d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.13a4.5 4.5 0 0 0-1.242-7.244l4.5-4.5a4.5 4.5 0 0 1 6.364 6.364l-1.757 1.757"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
    </svg>
  );
}
