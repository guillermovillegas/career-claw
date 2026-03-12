const STATUS_STYLES: Record<string, string> = {
  interested: "bg-white/[0.06] text-neutral-400",
  applied: "bg-white/[0.08] text-neutral-300",
  phone_screen: "bg-white/[0.10] text-neutral-200",
  interview: "bg-white/[0.12] text-neutral-100",
  final: "bg-white/[0.14] text-white",
  offer: "bg-white/[0.16] text-white font-semibold",
  hired: "bg-white/[0.18] text-white font-semibold",
  rejected: "bg-white/[0.04] text-neutral-400 line-through",
  withdrawn: "bg-white/[0.04] text-neutral-400",
  draft: "bg-white/[0.04] text-neutral-400",
  submitted: "bg-white/[0.08] text-neutral-300",
  viewed: "bg-white/[0.10] text-neutral-200",
  shortlisted: "bg-white/[0.12] text-neutral-100",
  active: "bg-white/[0.10] text-neutral-200",
  scheduled: "bg-white/[0.08] text-neutral-300",
  cancelled: "bg-white/[0.04] text-neutral-400 line-through",
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? "bg-white/[0.06] text-neutral-400";
  const label = status.replace(/_/g, " ");

  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ${style}`}>
      {label}
    </span>
  );
}
