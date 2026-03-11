import type { PipelineStage } from "@/lib/queries";

interface PipelineProps {
  data: { stage: PipelineStage; count: number }[];
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  interested: "Interested",
  applied: "Applied",
  phone_screen: "Screen",
  interview: "Interview",
  final: "Final",
  offer: "Offer",
};

export function Pipeline({ data }: PipelineProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <h2 className="text-[11px] font-medium text-neutral-500 uppercase tracking-widest mb-4">
        Pipeline
      </h2>
      <div className="flex items-end gap-2">
        {data.map(({ stage, count }) => {
          const height = Math.max((count / maxCount) * 100, 4);
          const intensity = count > 0 ? Math.min(0.3 + (count / maxCount) * 0.5, 0.8) : 0.06;
          return (
            <div key={stage} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-xs font-semibold tabular-nums text-neutral-300">
                {count}
              </span>
              <div
                className="w-full rounded-sm transition-all"
                style={{
                  height: `${height}px`,
                  backgroundColor: `rgba(255, 255, 255, ${intensity})`,
                }}
              />
              <span className="text-[10px] text-neutral-500 text-center leading-tight">
                {STAGE_LABELS[stage]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
