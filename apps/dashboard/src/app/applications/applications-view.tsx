"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { ApplicationWithJob } from "@/lib/database.types";
import { StatusBadge } from "@/components/status-badge";
import { ScoreBadge } from "@/components/score-badge";
import { formatDate } from "@/lib/format";

type ViewTab = "ready" | "applied" | "active" | "closed";

const TABS: { key: ViewTab; label: string; description: string }[] = [
  { key: "ready", label: "Ready to Apply", description: "Has cover letter + job link" },
  { key: "applied", label: "Applied", description: "Submitted applications" },
  { key: "active", label: "In Progress", description: "Interview stages" },
  { key: "closed", label: "Closed", description: "Rejected or withdrawn" },
];

function categorize(app: ApplicationWithJob): ViewTab {
  if (["phone_screen", "interview", "final", "offer", "hired"].includes(app.status)) {
    return "active";
  }
  if (["rejected", "withdrawn"].includes(app.status)) {return "closed";}
  if (app.status === "applied") {return "applied";}
  return "ready";
}

type SortKey = "score" | "company" | "date";

export function ApplicationsView({ applications }: { applications: ApplicationWithJob[] }) {
  const [tab, setTab] = useState<ViewTab>("ready");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const counts = useMemo(() => {
    const c = { ready: 0, applied: 0, active: 0, closed: 0 };
    for (const app of applications) {c[categorize(app)]++;}
    return c;
  }, [applications]);

  const filtered = useMemo(() => {
    return applications.filter((app) => categorize(app) === tab);
  }, [applications, tab]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "score") {
        cmp = (a.match_score ?? 0) - (b.match_score ?? 0);
      } else if (sortKey === "company") {
        cmp = (a.jobs?.company ?? "").localeCompare(b.jobs?.company ?? "");
      } else {
        cmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {setSortDir((d) => (d === "asc" ? "desc" : "asc"));}
    else { setSortKey(key); setSortDir("desc"); }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-white tracking-tight">Applications</h1>
        <span className="text-xs text-neutral-400 tabular-nums">
          {applications.length} total
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-px rounded-lg border border-neutral-800 bg-neutral-900 p-0.5 w-fit">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === key
                ? "bg-white/[0.10] text-white"
                : "text-neutral-400 hover:text-neutral-300"
            }`}
          >
            {label}
            <span className={`ml-1.5 tabular-nums ${tab === key ? "text-neutral-300" : "text-neutral-400"}`}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Sort bar */}
      <div className="flex items-center gap-3 text-xs text-neutral-400">
        <span className="uppercase tracking-widest">Sort</span>
        {(["score", "company", "date"] as SortKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => toggleSort(k)}
            className={`capitalize ${sortKey === k ? "text-neutral-300" : "text-neutral-400 hover:text-neutral-300"}`}
          >
            {k}
            {sortKey === k && (
              <span className="ml-0.5">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "ready" ? (
        <ReadyToApplyList apps={sorted} />
      ) : (
        <ApplicationList apps={sorted} showApplyLink={false} />
      )}
    </div>
  );
}

// ─── Ready to Apply (manual submission focus) ────────────────────────

function ReadyToApplyList({ apps }: { apps: ApplicationWithJob[] }) {
  const withUrl = apps.filter((a) => a.jobs?.url && a.cover_letter && a.cover_letter.length > 50);
  const noUrl = apps.filter((a) => !a.jobs?.url || !a.cover_letter || a.cover_letter.length <= 50);

  return (
    <div className="space-y-4">
      {withUrl.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-400 uppercase tracking-widest">
            Ready ({withUrl.length})
          </p>
          <div className="divide-y divide-neutral-800/50">
            {withUrl.map((app) => (
              <ReadyRow key={app.id} app={app} />
            ))}
          </div>
        </div>
      )}
      {noUrl.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-400 uppercase tracking-widest">
            Needs Attention ({noUrl.length})
          </p>
          <div className="divide-y divide-neutral-800/30">
            {noUrl.map((app) => (
              <CompactRow key={app.id} app={app} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReadyRow({ app }: { app: ApplicationWithJob }) {
  const [showLetter, setShowLetter] = useState(false);
  const wordCount = app.cover_letter ? app.cover_letter.split(/\s+/).length : 0;

  return (
    <div className="py-2.5 group">
      <div className="flex items-center gap-3">
        <ScoreBadge score={app.match_score} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <Link
              href={`/applications/${app.id}`}
              className="text-sm font-medium text-neutral-200 hover:text-white transition-colors truncate"
            >
              {app.jobs?.title ?? "Unknown"}
            </Link>
            <span className="text-xs text-neutral-400 shrink-0">{app.jobs?.company}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-neutral-400 uppercase">{app.jobs?.platform ?? app.platform}</span>
            {app.jobs?.work_mode && (
              <span className="text-xs text-neutral-400">{app.jobs.work_mode}</span>
            )}
            {wordCount > 0 && (
              <button
                type="button"
                onClick={() => setShowLetter(!showLetter)}
                className="text-xs text-neutral-400 hover:text-neutral-300 transition-colors"
              >
                {wordCount}w letter {showLetter ? "\u25B4" : "\u25BE"}
              </button>
            )}
          </div>
        </div>
        {app.jobs?.url && (
          <a
            href={app.jobs.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-3 py-1 rounded-md border border-neutral-700 text-xs font-medium text-neutral-300 hover:bg-white/[0.06] hover:text-white hover:border-neutral-600 transition-all"
          >
            Apply
          </a>
        )}
      </div>
      {showLetter && app.cover_letter && (
        <div className="mt-2 ml-7 rounded-md bg-neutral-900 border border-neutral-800 p-3">
          <p className="text-sm text-neutral-400 leading-relaxed whitespace-pre-wrap">
            {app.cover_letter}
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(app.cover_letter ?? "");
            }}
            className="mt-2 text-xs text-neutral-400 hover:text-neutral-300 transition-colors"
          >
            Copy to clipboard
          </button>
        </div>
      )}
    </div>
  );
}

function CompactRow({ app }: { app: ApplicationWithJob }) {
  return (
    <div className="py-2 flex items-center gap-3 opacity-60">
      <ScoreBadge score={app.match_score} />
      <Link
        href={`/applications/${app.id}`}
        className="text-sm text-neutral-400 hover:text-neutral-300 transition-colors truncate flex-1"
      >
        {app.jobs?.title ?? "Unknown"} <span className="text-neutral-400">@ {app.jobs?.company}</span>
      </Link>
      <span className="text-xs text-neutral-500 shrink-0">
        {!app.cover_letter || app.cover_letter.length <= 50 ? "no letter" : "no link"}
      </span>
    </div>
  );
}

// ─── Generic Application List ────────────────────────────────────────

function ApplicationList({ apps, showApplyLink }: { apps: ApplicationWithJob[]; showApplyLink: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (apps.length === 0) {
    return (
      <p className="text-sm text-neutral-400 py-8 text-center">
        No applications in this category.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-800 overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-800 bg-neutral-900/50">
          <tr>
            <th className="px-3 py-2 text-xs font-medium text-neutral-400 uppercase tracking-widest">Status</th>
            <th className="px-3 py-2 text-xs font-medium text-neutral-400 uppercase tracking-widest">Role</th>
            <th className="px-3 py-2 text-xs font-medium text-neutral-400 uppercase tracking-widest">Company</th>
            <th className="px-3 py-2 text-xs font-medium text-neutral-400 uppercase tracking-widest">Platform</th>
            <th className="px-3 py-2 text-xs font-medium text-neutral-400 uppercase tracking-widest">Score</th>
            <th className="px-3 py-2 text-xs font-medium text-neutral-400 uppercase tracking-widest">Date</th>
            <th className="px-3 py-2 w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800/50">
          {apps.map((app) => (
            <AppTableRow
              key={app.id}
              app={app}
              expanded={expandedId === app.id}
              onToggle={() => setExpandedId(expandedId === app.id ? null : app.id)}
              showApplyLink={showApplyLink}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AppTableRow({
  app,
  expanded,
  onToggle,
  showApplyLink,
}: {
  app: ApplicationWithJob;
  expanded: boolean;
  onToggle: () => void;
  showApplyLink: boolean;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer transition-colors hover:bg-white/[0.02]"
      >
        <td className="px-3 py-2.5">
          <StatusBadge status={app.status} />
        </td>
        <td className="px-3 py-2.5">
          <Link
            href={`/applications/${app.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-neutral-200 hover:text-white transition-colors font-medium"
          >
            {app.jobs?.title ?? "Unknown"}
          </Link>
        </td>
        <td className="px-3 py-2.5 text-neutral-400">{app.jobs?.company ?? "--"}</td>
        <td className="px-3 py-2.5 text-neutral-400 text-xs uppercase">{app.jobs?.platform ?? app.platform}</td>
        <td className="px-3 py-2.5"><ScoreBadge score={app.match_score} /></td>
        <td className="px-3 py-2.5 text-neutral-400 text-xs">
          {formatDate(app.application_date ?? app.created_at)}
        </td>
        <td className="px-3 py-2.5">
          {(showApplyLink || app.status === "interested") && app.jobs?.url && (
            <a
              href={app.jobs.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-neutral-400 hover:text-white transition-colors"
            >
              <ArrowUpRightIcon className="h-3.5 w-3.5" />
            </a>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-neutral-900/30">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
              <Detail label="Mode" value={app.jobs?.work_mode ?? "--"} />
              <Detail label="Source" value={app.source ?? "--"} />
              <Detail label="Follow-up" value={formatDate(app.next_followup_date)} />
              <Detail label="Last Contact" value={formatDate(app.last_contact_date)} />
            </div>
            {app.cover_letter && (
              <div className="mt-3">
                <p className="text-xs text-neutral-400 uppercase tracking-widest mb-1">Cover Letter</p>
                <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-neutral-900 border border-neutral-800 p-3 text-sm text-neutral-400 leading-relaxed">
                  {app.cover_letter}
                </p>
              </div>
            )}
            {app.notes && (
              <div className="mt-2">
                <p className="text-xs text-neutral-400 uppercase tracking-widest mb-1">Notes</p>
                <p className="text-sm text-neutral-400">{app.notes}</p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-0.5 text-neutral-400">{value}</p>
    </div>
  );
}

function ArrowUpRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}
