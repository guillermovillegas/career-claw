import { getProposals, getFreelanceJobLeads } from "@/lib/queries";
import { ProposalsTable } from "./proposals-table";
import { ScoreBadge } from "@/components/score-badge";
import { formatDate } from "@/lib/format";
import type { Job } from "@/lib/database.types";

export const dynamic = "force-dynamic";

interface ProposalsPageProps {
  searchParams: Promise<{
    platform?: string;
  }>;
}

export default async function ProposalsPage({
  searchParams,
}: ProposalsPageProps) {
  const params = await searchParams;
  const [proposals, jobLeads] = await Promise.all([
    getProposals({ platform: params.platform }),
    getFreelanceJobLeads(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-sm font-semibold text-slate-300">
          Freelance Proposals
        </h1>
        <span className="text-xs text-slate-500">
          {proposals.length} proposals · {jobLeads.length} leads
        </span>
      </div>

      {/* Freelance job leads discovered by daily search */}
      {jobLeads.length > 0 && (
        <div className="rounded-lg border border-slate-700/50">
          <div className="border-b border-slate-700/50 bg-slate-800/80 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Discovered Leads — Upwork / Fiverr
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-700/50 bg-slate-900/60">
                <tr>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-500">Score</th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-500">Project</th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-500">Platform</th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-500">Found</th>
                  <th className="px-3 py-2 w-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {jobLeads.map((job) => (
                  <JobLeadRow key={job.id} job={job} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drafted / submitted proposals */}
      <ProposalsTable proposals={proposals} />
    </div>
  );
}

function JobLeadRow({ job }: { job: Job }) {
  return (
    <tr className="transition-colors hover:bg-slate-800/40">
      <td className="px-3 py-2">
        <ScoreBadge score={job.match_score} />
      </td>
      <td className="px-3 py-2 max-w-xs">
        <p className="font-medium text-slate-200 truncate">{job.title}</p>
        {job.company && (
          <p className="text-slate-500 truncate">{job.company}</p>
        )}
      </td>
      <td className="px-3 py-2 capitalize text-slate-500">{job.platform}</td>
      <td className="px-3 py-2 tabular-nums text-slate-500">{formatDate(job.created_at)}</td>
      <td className="px-3 py-2">
        {job.url ? (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-600 hover:text-emerald-400 transition-colors"
            title="Open project"
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
