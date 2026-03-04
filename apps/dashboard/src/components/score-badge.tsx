interface ScoreBadgeProps {
  score: number | null;
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  if (score == null) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-400">
        --
      </span>
    );
  }

  let colorClass: string;
  if (score >= 80) {
    colorClass = "bg-emerald-500/20 text-emerald-400";
  } else if (score >= 60) {
    colorClass = "bg-amber-500/20 text-amber-400";
  } else {
    colorClass = "bg-rose-500/20 text-rose-400";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${colorClass}`}
    >
      {score}
    </span>
  );
}
