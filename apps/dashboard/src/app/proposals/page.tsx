import { getProposals, getFreelanceJobLeads } from "@/lib/queries";
import { ProposalsTable } from "./proposals-table";
import { LeadsTable } from "./leads-table";

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

  const highScoreLeads = jobLeads.filter(
    (l) => (l.match_score ?? 0) >= 80
  ).length;
  const recentLeads = jobLeads.filter((l) => {
    const d = new Date(l.posting_date ?? l.created_at);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  }).length;

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold text-neutral-300">
            Freelance Proposals
          </h1>
          <span className="text-xs text-neutral-400">
            {proposals.length} proposals · {jobLeads.length} leads
          </span>
        </div>
        {/* Quick stats */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded bg-neutral-800/60 px-2.5 py-1 border border-neutral-700/40">
            <span className="text-xs text-neutral-500">This week</span>
            <span className="text-xs font-semibold text-neutral-200 tabular-nums">
              {recentLeads}
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded bg-neutral-800/60 px-2.5 py-1 border border-neutral-700/40">
            <span className="text-xs text-neutral-500">80+ score</span>
            <span className="text-xs font-semibold text-neutral-200 tabular-nums">
              {highScoreLeads}
            </span>
          </div>
        </div>
      </div>

      {/* Freelance job leads discovered by daily search */}
      <LeadsTable leads={jobLeads} />

      {/* Drafted / submitted proposals */}
      {proposals.length > 0 && <ProposalsTable proposals={proposals} />}
    </div>
  );
}
