"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { JobWithAppStatus } from "@/lib/queries";
import { ScoreBadge } from "@/components/score-badge";
import { EmptyState } from "@/components/empty-state";
import { formatDate, formatSalaryRange } from "@/lib/format";

interface JobsTableProps {
  jobs: JobWithAppStatus[];
}

// Exclude upwork/fiverr — they live in Proposals
const PLATFORMS = [
  "linkedin",
  "indeed",
  "direct",
  "referral",
  "other",
] as const;

const JOB_TYPES = ["full-time", "part-time", "contract"] as const;
const WORK_MODES = ["remote", "hybrid", "on-site"] as const;

type SortKey =
  | "match_score"
  | "title"
  | "company"
  | "work_mode"
  | "salary_min"
  | "platform"
  | "application_status"
  | "created_at";

export function JobsTable({ jobs }: JobsTableProps) {
  const searchParams = useSearchParams();

  const [sortKey, setSortKey] = useState<SortKey>(
    (searchParams.get("sort_by") as SortKey) ?? "created_at"
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    (searchParams.get("sort_dir") as "asc" | "desc") ?? "desc"
  );
  const [filterPlatform, setFilterPlatform] = useState(
    searchParams.get("platform") ?? ""
  );
  const [filterJobType, setFilterJobType] = useState(
    searchParams.get("job_type") ?? ""
  );
  const [filterWorkMode, setFilterWorkMode] = useState(
    searchParams.get("work_mode") ?? ""
  );
  const [filterApplied, setFilterApplied] = useState("");
  const [hideClosed, setHideClosed] = useState(true);

  const filteredJobs = useMemo(() => {
    let result = jobs;
    if (filterPlatform) {
      result = result.filter((j) => j.platform === filterPlatform);
    }
    if (filterJobType) {
      result = result.filter((j) => j.job_type === filterJobType);
    }
    if (filterWorkMode) {
      result = result.filter((j) => j.work_mode === filterWorkMode);
    }
    if (filterApplied === "applied") {
      result = result.filter(
        (j) => j.application_status && j.application_status !== "interested"
      );
    } else if (filterApplied === "not_applied") {
      result = result.filter(
        (j) => !j.application_status || j.application_status === "interested"
      );
    }
    if (hideClosed) {
      result = result.filter((j) => !j.is_closed);
    }
    return result;
  }, [jobs, filterPlatform, filterJobType, filterWorkMode, filterApplied]);

  const sortedJobs = useMemo(() => {
    const sorted = [...filteredJobs].toSorted((a, b) => {
      const aVal = a[sortKey as keyof JobWithAppStatus];
      const bVal = b[sortKey as keyof JobWithAppStatus];
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
  }, [filteredJobs, sortKey, sortDir]);

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
          isActive ? "text-white" : "text-neutral-400 hover:text-neutral-300"
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

  const appliedCount = jobs.filter(
    (j) => j.application_status && j.application_status !== "interested"
  ).length;

  const newCount = jobs.filter(
    (j) => !j.application_status && !j.is_closed
  ).length;

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Status"
          value={filterApplied}
          options={[
            { value: "not_applied", label: `New (${newCount})` },
            { value: "applied", label: "Applied" },
          ]}
          onChange={setFilterApplied}
        />
        <FilterSelect
          label="Platform"
          value={filterPlatform}
          options={PLATFORMS.map((p) => ({ value: p, label: p }))}
          onChange={setFilterPlatform}
        />
        <FilterSelect
          label="Mode"
          value={filterWorkMode}
          options={WORK_MODES.map((m) => ({ value: m, label: m }))}
          onChange={setFilterWorkMode}
        />
        <FilterSelect
          label="Type"
          value={filterJobType}
          options={JOB_TYPES.map((t) => ({ value: t, label: t }))}
          onChange={setFilterJobType}
        />
        <button
          type="button"
          onClick={() => setHideClosed((v) => !v)}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            hideClosed
              ? "border-neutral-700 bg-neutral-800/80 text-neutral-400 hover:text-neutral-200"
              : "border-neutral-600/50 bg-neutral-700/20 text-neutral-500"
          }`}
        >
          {hideClosed ? "Hide closed" : "Show closed"}
        </button>
        {(filterPlatform || filterJobType || filterWorkMode || filterApplied) && (
          <button
            type="button"
            onClick={() => {
              setFilterPlatform("");
              setFilterJobType("");
              setFilterWorkMode("");
              setFilterApplied("");
            }}
            className="text-xs text-neutral-400 hover:text-neutral-200"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-neutral-500">
          {sortedJobs.length} shown · <span className="text-neutral-300">{newCount} new</span> · {appliedCount} applied
        </span>
      </div>

      {sortedJobs.length === 0 ? (
        <EmptyState
          title="No jobs found"
          description="Try adjusting your filters or check back later"
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-700/50">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-700/50 bg-neutral-800/80">
              <tr>
                <th className="px-3 py-2">
                  <SortHeader label="Score" column="match_score" />
                </th>
                <th className="px-3 py-2">
                  <SortHeader label="Title / Company" column="title" />
                </th>
                <th className="px-3 py-2">
                  <SortHeader label="Applied" column="application_status" />
                </th>
                <th className="px-3 py-2">
                  <SortHeader label="Mode" column="work_mode" />
                </th>
                <th className="px-3 py-2">
                  <SortHeader label="Salary" column="salary_min" />
                </th>
                <th className="px-3 py-2">
                  <SortHeader label="Source" column="platform" />
                </th>
                <th className="px-3 py-2">
                  <SortHeader label="Date" column="created_at" />
                </th>
                <th className="px-3 py-2 w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {sortedJobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Job Row ─────────────────────────────────────────────────────────

function JobRow({ job }: { job: JobWithAppStatus }) {
  return (
    <tr className="transition-colors hover:bg-white/[0.04]">
      <td className="px-3 py-2">
        <ScoreBadge score={job.match_score} />
      </td>
      <td className="px-3 py-2 max-w-xs">
        <Link
          href={`/jobs/${job.id}`}
          className="font-medium text-neutral-200 truncate hover:text-white transition-colors block"
        >
          {job.title}
        </Link>
        <p className="text-neutral-500 truncate">{job.company}</p>
      </td>
      <td className="px-3 py-2">
        {job.is_closed ? (
          <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-neutral-700/50 text-neutral-500 line-through">
            Closed
          </span>
        ) : (
          <AppStatusBadge status={job.application_status} />
        )}
      </td>
      <td className="px-3 py-2">
        <WorkModeBadge mode={job.work_mode} />
      </td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-neutral-400">
        {formatSalaryRange(job.salary_min, job.salary_max)}
      </td>
      <td className="px-3 py-2 text-neutral-500 capitalize">{job.platform}</td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-neutral-500">
        {formatDate(job.created_at)}
      </td>
      <td className="px-3 py-2">
        {job.url ? (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-600 hover:text-white transition-colors"
            title="Open job posting"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
        ) : (
          <span className="w-3.5 inline-block" />
        )}
      </td>
    </tr>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function AppStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-white/[0.08] text-neutral-300 ring-1 ring-inset ring-neutral-500/20">
        New
      </span>
    );
  }
  const styles: Record<string, string> = {
    interested: "bg-neutral-700/60 text-neutral-400",
    applied: "bg-white/[0.08] text-neutral-300",
    phone_screen: "bg-white/[0.08] text-neutral-300",
    interview: "bg-white/[0.08] text-neutral-300",
    final: "bg-white/[0.08] text-neutral-200",
    offer: "bg-white/[0.08] text-white",
    hired: "bg-white/[0.08] text-white",
    rejected: "bg-neutral-700/50 text-neutral-500",
    withdrawn: "bg-neutral-700/50 text-neutral-500",
  };
  const label = status.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${
        styles[status] ?? "bg-neutral-700/50 text-neutral-400"
      }`}
    >
      {label}
    </span>
  );
}

function WorkModeBadge({ mode }: { mode: string | null }) {
  if (!mode) {return <span className="text-neutral-600">—</span>;}
  const styles: Record<string, string> = {
    remote: "bg-white/[0.08] text-neutral-300",
    hybrid: "bg-neutral-700/50 text-neutral-400",
    "on-site": "bg-neutral-700/50 text-neutral-500",
  };
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${
        styles[mode] ?? "bg-neutral-700/50 text-neutral-400"
      }`}
    >
      {mode}
    </span>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-neutral-700 bg-neutral-800/80 px-2 py-1 text-xs text-neutral-300 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
    >
      <option value="">All {label}s</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
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
