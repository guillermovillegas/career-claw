export default function ProposalsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-800" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded-lg bg-slate-800/50" />
      </div>
      <div className="flex gap-0.5 rounded-lg border border-slate-700 bg-slate-800">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-9 w-20 animate-pulse bg-slate-800/50" />
        ))}
      </div>
      <div className="animate-pulse rounded-xl border border-slate-700/50 bg-slate-800/30">
        <div className="h-12 border-b border-slate-700/50 bg-slate-800/50" />
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-14 border-b border-slate-700/20"
          />
        ))}
      </div>
    </div>
  );
}
