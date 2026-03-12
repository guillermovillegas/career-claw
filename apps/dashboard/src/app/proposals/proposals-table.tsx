"use client";

import { useState, useMemo, useCallback } from "react";
import type { ProposalWithScore } from "@/lib/queries";
import { StatusBadge } from "@/components/status-badge";
import { ScoreBadge } from "@/components/score-badge";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/format";

interface ProposalsTableProps {
  proposals: ProposalWithScore[];
}

const PLATFORMS = ["upwork", "fiverr", "direct"] as const;

const PLATFORM_ICONS: Record<string, string> = {
  upwork: "U",
  fiverr: "F",
  direct: "D",
};

const PLATFORM_COLORS: Record<string, string> = {
  upwork: "bg-white/[0.10] text-neutral-300",
  fiverr: "bg-white/[0.10] text-neutral-300",
  direct: "bg-white/[0.10] text-neutral-300",
};

type SortField = "platform" | "project_title" | "bid_amount" | "budget_max" | "status" | "created_at" | "match_score";
type SortDir = "asc" | "desc";

export function ProposalsTable({ proposals }: ProposalsTableProps) {
  const [filterPlatform, setFilterPlatform] = useState("");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
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
    let result = proposals;
    if (filterPlatform) {
      result = result.filter((p) => p.platform === filterPlatform);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.project_title.toLowerCase().includes(q) ||
          (p.client_name?.toLowerCase().includes(q) ?? false)
      );
    }
    // Sort
    const mult = sortDir === "asc" ? 1 : -1;
    return [...result].toSorted((a, b) => {
      switch (sortField) {
        case "platform":
          return mult * a.platform.localeCompare(b.platform);
        case "project_title":
          return mult * a.project_title.localeCompare(b.project_title);
        case "bid_amount":
          return mult * ((a.bid_amount ?? 0) - (b.bid_amount ?? 0));
        case "budget_max":
          return mult * ((a.budget_max ?? 0) - (b.budget_max ?? 0));
        case "status":
          return mult * a.status.localeCompare(b.status);
        case "match_score":
          return mult * ((a.match_score ?? 0) - (b.match_score ?? 0));
        case "created_at":
        default:
          return mult * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
    });
  }, [proposals, filterPlatform, search, sortField, sortDir]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border border-neutral-700 bg-neutral-800">
          <button
            type="button"
            onClick={() => setFilterPlatform("")}
            className={`px-3 py-1.5 text-sm transition-colors ${
              filterPlatform === ""
                ? "bg-white/[0.10] text-white"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            All
          </button>
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setFilterPlatform(p)}
              className={`border-l border-neutral-700 px-3 py-1.5 text-sm capitalize transition-colors ${
                filterPlatform === p
                  ? "bg-white/[0.10] text-white"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search projects or clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-800/80 px-2.5 py-1.5 text-sm text-neutral-300 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 w-56"
        />
        <span className="ml-auto text-xs text-neutral-400">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No proposals found"
          description="Freelance proposals will appear here once submitted"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-700/50">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-700/50 bg-neutral-800/80">
              <tr>
                <SortHeader label="Platform" field="platform" current={sortField} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Project" field="project_title" current={sortField} dir={sortDir} onSort={toggleSort} />
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Client
                </th>
                <SortHeader label="Bid" field="bid_amount" current={sortField} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Budget" field="budget_max" current={sortField} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Score" field="match_score" current={sortField} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Status" field="status" current={sortField} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Date" field="created_at" current={sortField} dir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-700/30">
              {filtered.map((proposal) => (
                <ProposalRow
                  key={proposal.id}
                  proposal={proposal}
                  expanded={expandedId === proposal.id}
                  onToggle={() => setExpandedId(expandedId === proposal.id ? null : proposal.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
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
      className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-400 cursor-pointer select-none hover:text-neutral-300 transition-colors"
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

function ProposalRow({
  proposal,
  expanded,
  onToggle,
}: {
  proposal: ProposalWithScore;
  expanded: boolean;
  onToggle: () => void;
}) {
  const platformColor =
    PLATFORM_COLORS[proposal.platform] ?? "bg-neutral-600/30 text-neutral-300";
  const platformIcon =
    PLATFORM_ICONS[proposal.platform] ?? proposal.platform[0].toUpperCase();

  const budgetRange =
    proposal.budget_min != null || proposal.budget_max != null
      ? [
          proposal.budget_min != null ? formatCurrency(Number(proposal.budget_min)) : "",
          proposal.budget_max != null ? formatCurrency(Number(proposal.budget_max)) : "",
        ]
          .filter(Boolean)
          .join(" - ")
      : "--";

  const preview = proposal.proposal_text
    ? proposal.proposal_text.slice(0, 100) + (proposal.proposal_text.length > 100 ? "..." : "")
    : null;

  return (
    <>
      <tr
        className={`transition-colors cursor-pointer ${
          expanded ? "bg-neutral-800/60" : "hover:bg-neutral-800/50"
        }`}
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${platformColor}`}
          >
            {platformIcon}
          </span>
        </td>
        <td className="px-4 py-3">
          <div>
            <p className="font-medium text-neutral-200">{proposal.project_title}</p>
            {proposal.project_url && (
              <a
                href={proposal.project_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-neutral-400 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                View project
              </a>
            )}
            {preview && !expanded && (
              <p className="text-xs text-neutral-500 mt-0.5 truncate max-w-xs">{preview}</p>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-neutral-300">
          {proposal.client_name ?? "--"}
          {proposal.client_country && (
            <span className="ml-1 text-xs text-neutral-400">
              ({proposal.client_country})
            </span>
          )}
        </td>
        <td className="px-4 py-3 font-medium text-neutral-300">
          {proposal.bid_amount != null
            ? formatCurrency(Number(proposal.bid_amount))
            : "--"}
          {proposal.budget_type && (
            <span className="ml-1 text-xs text-neutral-400">
              {proposal.budget_type === "hourly" ? "/hr" : "fixed"}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-neutral-400">
          {budgetRange}
        </td>
        <td className="px-4 py-3">
          {proposal.match_score != null ? (
            <div className="flex items-center gap-1.5">
              <ScoreBadge score={proposal.match_score} />
              <span className="text-xs text-neutral-400">{proposal.match_score}%</span>
            </div>
          ) : (
            <span className="text-neutral-500">--</span>
          )}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={proposal.status} />
        </td>
        <td className="px-4 py-3 text-neutral-400">
          {formatDate(proposal.submitted_at ?? proposal.created_at)}
        </td>
      </tr>
      {expanded && proposal.proposal_text && (
        <tr>
          <td colSpan={8} className="bg-neutral-900/80 px-0 py-0">
            <div className="border-t border-neutral-700/30 px-6 py-3 space-y-2">
              <span className="text-xs font-semibold uppercase text-neutral-400 block">
                Proposal Text
              </span>
              {proposal.estimated_duration && (
                <p className="text-xs text-neutral-400">
                  Duration: {proposal.estimated_duration}
                </p>
              )}
              <pre className="rounded bg-neutral-950 border border-neutral-800 px-3 py-2 text-xs text-neutral-400 overflow-x-auto max-h-64 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
                {proposal.proposal_text}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
