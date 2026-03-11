"use client";

import { useState, useMemo } from "react";
import type { FreelanceProposal } from "@/lib/database.types";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/format";

interface ProposalsTableProps {
  proposals: FreelanceProposal[];
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

export function ProposalsTable({ proposals }: ProposalsTableProps) {
  const [filterPlatform, setFilterPlatform] = useState("");

  const filtered = useMemo(() => {
    if (!filterPlatform) {return proposals;}
    return proposals.filter((p) => p.platform === filterPlatform);
  }, [proposals, filterPlatform]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
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
        <span className="ml-auto text-xs text-neutral-500">
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
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Platform
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Project
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Client
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Bid
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Budget
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Submitted
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-700/30">
              {filtered.map((proposal) => (
                <ProposalRow key={proposal.id} proposal={proposal} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProposalRow({ proposal }: { proposal: FreelanceProposal }) {
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

  return (
    <tr className="transition-colors hover:bg-neutral-800/50">
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
            >
              View project
            </a>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-neutral-300">
        {proposal.client_name ?? "--"}
        {proposal.client_country && (
          <span className="ml-1 text-xs text-neutral-500">
            ({proposal.client_country})
          </span>
        )}
      </td>
      <td className="px-4 py-3 font-medium text-neutral-300">
        {proposal.bid_amount != null
          ? formatCurrency(Number(proposal.bid_amount))
          : "--"}
        {proposal.budget_type && (
          <span className="ml-1 text-xs text-neutral-500">
            {proposal.budget_type === "hourly" ? "/hr" : "fixed"}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-neutral-400">
        {budgetRange}
        {proposal.budget_type && (
          <span className="ml-1 text-xs text-neutral-500">
            {proposal.budget_type}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={proposal.status} />
      </td>
      <td className="px-4 py-3 text-neutral-400">
        {formatDate(proposal.submitted_at)}
      </td>
    </tr>
  );
}
