export default function JobsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-32 animate-pulse rounded-lg bg-slate-800" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded-lg bg-slate-800/50" />
      </div>
      <div className="flex gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-9 w-32 animate-pulse rounded-lg bg-slate-800" />
        ))}
      </div>
      <div className="animate-pulse rounded-xl border border-slate-700/50 bg-slate-800/30">
        <div className="h-12 border-b border-slate-700/50 bg-slate-800/50" />
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="h-14 border-b border-slate-700/20"
          />
        ))}
      </div>
    </div>
  );
}
