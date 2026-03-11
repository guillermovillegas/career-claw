import Link from "next/link";
import { getActiveResponses } from "@/lib/queries";
import type { ResponseWithComms } from "@/lib/queries";
import type { CommunicationLog, CalendarEvent } from "@/lib/database.types";
import { formatRelativeTime, formatDate, formatDateTime } from "@/lib/format";
import { ScoreBadge } from "@/components/score-badge";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

const STAGE_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  offer: { bg: "bg-emerald-500/15", text: "text-emerald-400", ring: "ring-emerald-500/30" },
  final: { bg: "bg-purple-500/15", text: "text-purple-400", ring: "ring-purple-500/30" },
  interview: { bg: "bg-amber-500/15", text: "text-amber-400", ring: "ring-amber-500/30" },
  phone_screen: { bg: "bg-cyan-500/15", text: "text-cyan-400", ring: "ring-cyan-500/30" },
  hired: { bg: "bg-emerald-500/15", text: "text-emerald-300", ring: "ring-emerald-500/30" },
  applied: { bg: "bg-blue-500/10", text: "text-blue-400", ring: "ring-blue-500/20" },
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "text-emerald-400",
  neutral: "text-slate-400",
  negative: "text-rose-400",
};

export default async function ResponsesPage() {
  const responses = await getActiveResponses();

  // Split into urgent (interview+) and tracking (applied)
  const urgent = responses.filter(
    (r) => ["phone_screen", "interview", "final", "offer", "hired"].includes(r.status)
  );
  const tracking = responses.filter((r) => r.status === "applied");
  const withComms = tracking.filter((r) => r.comms.length > 0);
  const noResponse = tracking.filter((r) => r.comms.length === 0);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Responses & Interviews</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {urgent.length} active interview{urgent.length !== 1 ? "s" : ""} &middot;{" "}
          {withComms.length} with responses &middot;{" "}
          {noResponse.length} awaiting response
        </p>
      </div>

      {/* Urgent: Active Interview Stages */}
      {urgent.length > 0 && (
        <section>
          <SectionHeader
            title="Active Interviews"
            count={urgent.length}
            color="amber"
          />
          <div className="space-y-3 mt-3">
            {urgent.map((r) => (
              <ResponseCard key={r.id} response={r} expanded />
            ))}
          </div>
        </section>
      )}

      {/* With email responses */}
      {withComms.length > 0 && (
        <section>
          <SectionHeader
            title="Responded (Applied)"
            count={withComms.length}
            color="blue"
          />
          <div className="space-y-3 mt-3">
            {withComms.map((r) => (
              <ResponseCard key={r.id} response={r} expanded={false} />
            ))}
          </div>
        </section>
      )}

      {/* Awaiting response */}
      {noResponse.length > 0 && (
        <section>
          <SectionHeader
            title="Awaiting Response"
            count={noResponse.length}
            color="slate"
          />
          <p className="text-xs text-slate-600 mt-2 mb-3">
            Applied, no email responses tracked yet. Run the email tracker to scan for updates.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {noResponse.slice(0, 30).map((r) => (
              <CompactCard key={r.id} response={r} />
            ))}
          </div>
          {noResponse.length > 30 && (
            <p className="text-xs text-slate-600 mt-2">
              + {noResponse.length - 30} more
            </p>
          )}
        </section>
      )}

      {responses.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-slate-500">No active applications found.</p>
          <p className="text-xs text-slate-600 mt-1">
            Applications in interview stages will appear here automatically.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  color,
}: {
  title: string;
  count: number;
  color: string;
}) {
  const dotColors: Record<string, string> = {
    amber: "bg-amber-400",
    blue: "bg-blue-400",
    slate: "bg-slate-600",
    emerald: "bg-emerald-400",
  };
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dotColors[color] ?? "bg-slate-600"}`} />
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h2>
      <span className="text-xs tabular-nums text-slate-600">({count})</span>
    </div>
  );
}

// ─── Full Response Card ──────────────────────────────────────────────

function ResponseCard({
  response,
  expanded,
}: {
  response: ResponseWithComms;
  expanded: boolean;
}) {
  const job = response.jobs;
  const sc = STAGE_COLORS[response.status] ?? STAGE_COLORS.applied;

  // Parse notes for email-related entries
  const noteEntries = response.notes
    ? response.notes.split("|").map((n) => n.trim()).filter(Boolean)
    : [];
  const emailNotes = noteEntries.filter(
    (n) => /email|interview|screen|assessment|offer|reject/i.test(n)
  );

  return (
    <div className={`rounded-xl border ${sc.ring} ${sc.bg} overflow-hidden`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={response.status} />
            <ScoreBadge score={response.match_score} />
            {response.platform && (
              <span className="text-[10px] text-slate-600 uppercase">
                {response.platform}
              </span>
            )}
          </div>
          <Link
            href={`/applications/${response.id}`}
            className="block mt-1 text-sm font-medium text-slate-200 hover:text-emerald-400 transition-colors truncate"
          >
            {job?.title ?? "Unknown Role"}
          </Link>
          <p className="text-xs text-slate-500 mt-0.5">
            {job?.company ?? "Unknown"}{" "}
            {job?.location ? `-- ${job.location}` : ""}
            {response.application_date && (
              <span className="ml-2 text-slate-600">
                Applied {formatDate(response.application_date)}
              </span>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-slate-600">
            Updated {formatRelativeTime(response.updated_at)}
          </p>
          {job?.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-slate-600 hover:text-emerald-400 transition-colors"
            >
              View posting
            </a>
          )}
        </div>
      </div>

      {/* Email notes from tracker */}
      {emailNotes.length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {emailNotes.map((note, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-md bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-400"
              >
                {note}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Calendar events */}
      {response.events.length > 0 && (
        <div className="px-4 pb-3">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
            Scheduled Events
          </h4>
          {response.events.map((ev) => (
            <EventRow key={ev.id} event={ev} />
          ))}
        </div>
      )}

      {/* Communication timeline */}
      {expanded && response.comms.length > 0 && (
        <div className="border-t border-slate-700/30 px-4 py-3">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
            Email Chain ({response.comms.length})
          </h4>
          <div className="space-y-2">
            {response.comms.slice(0, 10).map((c) => (
              <CommEntry key={c.id} comm={c} />
            ))}
            {response.comms.length > 10 && (
              <p className="text-[10px] text-slate-600">
                + {response.comms.length - 10} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Collapsed comms summary */}
      {!expanded && response.comms.length > 0 && (
        <div className="border-t border-slate-700/30 px-4 py-2 flex items-center justify-between">
          <span className="text-[10px] text-slate-500">
            {response.comms.length} email{response.comms.length !== 1 ? "s" : ""} tracked
          </span>
          <Link
            href={`/applications/${response.id}`}
            className="text-[10px] text-emerald-500 hover:text-emerald-400 transition-colors"
          >
            View details
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Calendar Event Row ──────────────────────────────────────────────

function EventRow({ event }: { event: CalendarEvent }) {
  const isPast = new Date(event.start_time) < new Date();
  const statusColors: Record<string, string> = {
    scheduled: "text-amber-400",
    completed: "text-emerald-400",
    cancelled: "text-slate-600 line-through",
    rescheduled: "text-cyan-400",
  };

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
      <span className={`text-xs ${statusColors[event.status] ?? "text-slate-400"}`}>
        {event.title}
      </span>
      <span className="text-[10px] text-slate-600 ml-auto shrink-0">
        {formatDateTime(event.start_time)}
      </span>
      {event.meeting_url && (
        <a
          href={event.meeting_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-emerald-500 hover:text-emerald-400 shrink-0"
        >
          Join
        </a>
      )}
      {isPast && event.status === "scheduled" && (
        <span className="text-[10px] text-rose-400 shrink-0">overdue</span>
      )}
    </div>
  );
}

// ─── Communication Entry ─────────────────────────────────────────────

function CommEntry({ comm }: { comm: CommunicationLog }) {
  const dirIcon = comm.direction === "inbound" ? "←" : "→";
  const dirColor = comm.direction === "inbound" ? "text-cyan-400" : "text-slate-500";
  const sentimentColor = SENTIMENT_COLORS[comm.sentiment ?? "neutral"] ?? "text-slate-400";

  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={`shrink-0 font-mono ${dirColor}`}>{dirIcon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 truncate">
            {comm.subject ?? "(no subject)"}
          </span>
          {comm.sentiment && (
            <span className={`text-[10px] ${sentimentColor}`}>
              {comm.sentiment}
            </span>
          )}
        </div>
        {comm.content_summary && (
          <p className="text-[10px] text-slate-600 mt-0.5 line-clamp-2">
            {comm.content_summary}
          </p>
        )}
      </div>
      <span className="text-[10px] text-slate-600 shrink-0">
        {formatRelativeTime(comm.created_at)}
      </span>
    </div>
  );
}

// ─── Compact Card (for awaiting response grid) ───────────────────────

function CompactCard({ response }: { response: ResponseWithComms }) {
  const job = response.jobs;
  return (
    <Link
      href={`/applications/${response.id}`}
      className="block rounded-lg border border-slate-700/30 bg-slate-800/30 px-3 py-2 hover:border-slate-600/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-300 truncate font-medium">
          {job?.company ?? "Unknown"}
        </span>
        <ScoreBadge score={response.match_score} />
      </div>
      <p className="text-[10px] text-slate-500 truncate mt-0.5">
        {job?.title ?? "Unknown Role"}
      </p>
      {response.application_date && (
        <p className="text-[10px] text-slate-600 mt-0.5">
          Applied {formatDate(response.application_date)}
        </p>
      )}
    </Link>
  );
}
