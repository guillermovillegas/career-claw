const STATUS_COLORS: Record<string, string> = {
  // Application statuses
  interested: "bg-slate-600/30 text-slate-300",
  applied: "bg-blue-500/20 text-blue-400",
  phone_screen: "bg-cyan-500/20 text-cyan-400",
  interview: "bg-amber-500/20 text-amber-400",
  final: "bg-purple-500/20 text-purple-400",
  offer: "bg-emerald-500/20 text-emerald-400",
  hired: "bg-emerald-600/30 text-emerald-300",
  rejected: "bg-rose-500/20 text-rose-400",
  withdrawn: "bg-slate-500/20 text-slate-400",
  // Proposal statuses
  draft: "bg-slate-600/30 text-slate-300",
  submitted: "bg-blue-500/20 text-blue-400",
  viewed: "bg-cyan-500/20 text-cyan-400",
  shortlisted: "bg-amber-500/20 text-amber-400",
  // Client statuses
  lead: "bg-slate-600/30 text-slate-300",
  active: "bg-emerald-500/20 text-emerald-400",
  paused: "bg-amber-500/20 text-amber-400",
  completed: "bg-blue-500/20 text-blue-400",
  churned: "bg-rose-500/20 text-rose-400",
  // Generic
  scheduled: "bg-blue-500/20 text-blue-400",
  cancelled: "bg-rose-500/20 text-rose-400",
  rescheduled: "bg-amber-500/20 text-amber-400",
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] ?? "bg-slate-600/30 text-slate-300";
  const label = status.replace(/_/g, " ");

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${color}`}
    >
      {label}
    </span>
  );
}
