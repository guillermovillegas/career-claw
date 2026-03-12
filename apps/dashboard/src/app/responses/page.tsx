import Link from "next/link";
import { getActiveResponses } from "@/lib/queries";
import type { ResponseWithComms } from "@/lib/queries";
import type { CommunicationLog, CalendarEvent } from "@/lib/database.types";
import { formatRelativeTime, formatDate, formatDateTime } from "@/lib/format";
import { ScoreBadge } from "@/components/score-badge";
import { StatusBadge } from "@/components/status-badge";
import { DraftReply } from "./draft-reply";

export const dynamic = "force-dynamic";

export default async function ResponsesPage() {
  const responses = await getActiveResponses();

  const urgent = responses.filter(
    (r) => ["phone_screen", "interview", "final", "offer", "hired"].includes(r.status)
  );
  const tracking = responses.filter((r) => r.status === "applied");
  const withComms = tracking.filter((r) => r.comms.length > 0);
  const noResponse = tracking.filter((r) => r.comms.length === 0);

  return (
    <div className="space-y-5 max-w-[1200px]">
      <div>
        <h1 className="text-lg font-semibold text-white tracking-tight">Responses</h1>
        <p className="text-xs text-neutral-400 mt-0.5">
          {urgent.length} active / {withComms.length} responded / {noResponse.length} awaiting
        </p>
      </div>

      {urgent.length > 0 && (
        <section>
          <SectionHeader title="Active Interviews" count={urgent.length} />
          <div className="space-y-2 mt-2">
            {urgent.map((r) => (
              <ResponseCard key={r.id} response={r} expanded />
            ))}
          </div>
        </section>
      )}

      {withComms.length > 0 && (
        <section>
          <SectionHeader title="Responded" count={withComms.length} />
          <div className="space-y-2 mt-2">
            {withComms.map((r) => (
              <ResponseCard key={r.id} response={r} expanded={false} />
            ))}
          </div>
        </section>
      )}

      {noResponse.length > 0 && (
        <section>
          <SectionHeader title="Awaiting Response" count={noResponse.length} />
          <p className="text-xs text-neutral-500 mt-1 mb-2">
            Applied, no responses tracked yet.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {noResponse.slice(0, 30).map((r) => (
              <CompactCard key={r.id} response={r} />
            ))}
          </div>
          {noResponse.length > 30 && (
            <p className="text-xs text-neutral-500 mt-2">+ {noResponse.length - 30} more</p>
          )}
        </section>
      )}

      {responses.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-neutral-400">No active applications found.</p>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-neutral-500" />
      <h2 className="text-xs font-medium uppercase tracking-widest text-neutral-400">
        {title}
      </h2>
      <span className="text-xs tabular-nums text-neutral-500">({count})</span>
    </div>
  );
}

function ResponseCard({ response, expanded }: { response: ResponseWithComms; expanded: boolean }) {
  const job = response.jobs;
  const noteEntries = response.notes
    ? response.notes.split("|").map((n) => n.trim()).filter(Boolean)
    : [];
  const emailNotes = noteEntries.filter(
    (n) => /email|interview|screen|assessment|offer|reject/i.test(n)
  );

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 overflow-hidden">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={response.status} />
            <ScoreBadge score={response.match_score} />
            {response.platform && (
              <span className="text-xs text-neutral-500 uppercase">{response.platform}</span>
            )}
          </div>
          <Link
            href={`/applications/${response.id}`}
            className="block mt-1 text-sm font-medium text-neutral-200 hover:text-white transition-colors truncate"
          >
            {job?.title ?? "Unknown Role"}
          </Link>
          <p className="text-xs text-neutral-400 mt-0.5">
            {job?.company ?? "Unknown"}
            {job?.location ? ` / ${job.location}` : ""}
            {response.application_date && (
              <span className="ml-2 text-neutral-500">
                Applied {formatDate(response.application_date)}
              </span>
            )}
          </p>
        </div>
        <div className="text-right shrink-0 flex flex-col gap-1">
          <p className="text-xs text-neutral-500">{formatRelativeTime(response.updated_at)}</p>
          {job?.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-neutral-400 hover:text-neutral-400 transition-colors"
            >
              View posting
            </a>
          )}
        </div>
      </div>

      {emailNotes.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1">
          {emailNotes.map((note, i) => (
            <span key={i} className="inline-flex rounded bg-white/[0.04] px-2 py-0.5 text-xs text-neutral-400">
              {note}
            </span>
          ))}
        </div>
      )}

      {response.events.length > 0 && (
        <div className="px-4 pb-3">
          <h4 className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">Events</h4>
          {response.events.map((ev) => (
            <EventRow key={ev.id} event={ev} />
          ))}
        </div>
      )}

      {expanded && response.comms.length > 0 && (
        <div className="border-t border-neutral-800/50 px-4 py-3">
          <h4 className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-2">
            Emails ({response.comms.length})
          </h4>
          <div className="space-y-1.5">
            {response.comms.slice(0, 10).map((c) => (
              <CommEntry key={c.id} comm={c} appId={response.id} />
            ))}
            {response.comms.length > 10 && (
              <p className="text-xs text-neutral-500">+ {response.comms.length - 10} more</p>
            )}
          </div>
        </div>
      )}

      {!expanded && response.comms.length > 0 && (
        <div className="border-t border-neutral-800/50 px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-neutral-400">
            {response.comms.length} email{response.comms.length !== 1 ? "s" : ""}
          </span>
          <Link
            href={`/applications/${response.id}`}
            className="text-xs text-neutral-400 hover:text-neutral-300 transition-colors"
          >
            Details
          </Link>
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: CalendarEvent }) {
  const isPast = new Date(event.start_time) < new Date();
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="h-1 w-1 rounded-full bg-neutral-500 shrink-0" />
      <span className={`text-xs ${event.status === "cancelled" ? "text-neutral-500 line-through" : "text-neutral-400"}`}>
        {event.title}
      </span>
      <span className="text-xs text-neutral-500 ml-auto shrink-0">
        {formatDateTime(event.start_time)}
      </span>
      {event.meeting_url && (
        <a
          href={event.meeting_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-neutral-400 hover:text-neutral-300 shrink-0"
        >
          Join
        </a>
      )}
      {isPast && event.status === "scheduled" && (
        <span className="text-xs text-neutral-400 shrink-0">overdue</span>
      )}
    </div>
  );
}

function CommEntry({ comm, appId }: { comm: CommunicationLog; appId: string }) {
  const dirIcon = comm.direction === "inbound" ? "\u2190" : "\u2192";
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="shrink-0 font-mono text-neutral-400">{dirIcon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-neutral-400 truncate block">{comm.subject ?? "(no subject)"}</span>
        {comm.content_summary && (
          <p className="text-xs text-neutral-500 mt-0.5">{comm.content_summary}</p>
        )}
        {comm.direction === "inbound" && (
          <DraftReply appId={appId} commLogId={comm.id} />
        )}
      </div>
      <span className="text-xs text-neutral-500 shrink-0">{formatRelativeTime(comm.created_at)}</span>
    </div>
  );
}

function CompactCard({ response }: { response: ResponseWithComms }) {
  const job = response.jobs;
  return (
    <Link
      href={`/applications/${response.id}`}
      className="block rounded-md border border-neutral-800/50 bg-neutral-900/30 px-3 py-2 hover:border-neutral-700 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-neutral-300 truncate font-medium">{job?.company ?? "Unknown"}</span>
        <ScoreBadge score={response.match_score} />
      </div>
      <p className="text-xs text-neutral-400 truncate mt-0.5">{job?.title ?? "Unknown Role"}</p>
    </Link>
  );
}
