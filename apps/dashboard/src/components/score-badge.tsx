interface ScoreBadgeProps {
  score: number | null;
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  if (score == null) {
    return (
      <span className="text-[11px] tabular-nums text-neutral-600">--</span>
    );
  }

  const opacity = score >= 85 ? "text-white" : score >= 70 ? "text-neutral-300" : "text-neutral-500";

  return (
    <span className={`text-[11px] font-semibold tabular-nums ${opacity}`}>
      {score}
    </span>
  );
}
