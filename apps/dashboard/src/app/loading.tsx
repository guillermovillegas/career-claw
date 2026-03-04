export default function Loading() {
  return (
    <div className="space-y-8">
      <div>
        <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-800" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded-lg bg-slate-800/50" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-slate-700/50 bg-slate-800/30"
          />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-xl border border-slate-700/50 bg-slate-800/30" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-xl border border-slate-700/50 bg-slate-800/30" />
        <div className="h-80 animate-pulse rounded-xl border border-slate-700/50 bg-slate-800/30" />
      </div>
    </div>
  );
}
