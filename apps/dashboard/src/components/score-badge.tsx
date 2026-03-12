interface ScoreBadgeProps {
  score: number | null;
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  if (score == null) {
    return (
      <span className="text-xs tabular-nums text-neutral-400">--</span>
    );
  }

  const opacity = score >= 85 ? "text-white" : score >= 70 ? "text-neutral-300" : "text-neutral-400";

  return (
    <span className={`text-xs font-semibold tabular-nums ${opacity}`}>
      {score}
    </span>
  );
}
