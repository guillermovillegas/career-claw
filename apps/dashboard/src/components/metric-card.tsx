interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  accent?: "emerald" | "blue" | "amber" | "rose";
}

const accentMap = {
  emerald: "border-emerald-500/30 text-emerald-400",
  blue: "border-blue-500/30 text-blue-400",
  amber: "border-amber-500/30 text-amber-400",
  rose: "border-rose-500/30 text-rose-400",
} as const;

export function MetricCard({
  title,
  value,
  subtitle,
  accent = "emerald",
}: MetricCardProps) {
  return (
    <div
      className={`rounded-xl border bg-slate-800/50 p-5 ${accentMap[accent].split(" ")[0]}`}
    >
      <p className="text-sm font-medium text-slate-400">{title}</p>
      <p
        className={`mt-2 text-3xl font-bold ${accentMap[accent].split(" ")[1]}`}
      >
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      )}
    </div>
  );
}
