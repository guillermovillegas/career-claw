import type { PipelineStage } from "@/lib/queries";

interface PipelineProps {
  data: { stage: PipelineStage; count: number }[];
}

const STAGE_COLORS: Record<PipelineStage, string> = {
  interested: "bg-slate-500",
  applied: "bg-blue-500",
  phone_screen: "bg-cyan-500",
  interview: "bg-amber-500",
  final: "bg-purple-500",
  offer: "bg-emerald-500",
};

const STAGE_LABELS: Record<PipelineStage, string> = {
  interested: "Interested",
  applied: "Applied",
  phone_screen: "Phone Screen",
  interview: "Interview",
  final: "Final",
  offer: "Offer",
};

export function Pipeline({ data }: PipelineProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Application Pipeline
      </h2>
      <div className="flex items-end gap-3">
        {data.map(({ stage, count }) => {
          const height = Math.max((count / maxCount) * 140, 8);
          return (
            <div key={stage} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-sm font-bold text-slate-200">{count}</span>
              <div
                className={`w-full rounded-t-md ${STAGE_COLORS[stage]} transition-all`}
                style={{ height: `${height}px` }}
              />
              <span className="text-xs text-slate-400 text-center leading-tight">
                {STAGE_LABELS[stage]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
