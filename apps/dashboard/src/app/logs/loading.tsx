export default function LogsLoading() {
  return (
    <div className="space-y-3">
      <div className="h-7 w-32 animate-pulse rounded bg-slate-800" />
      <div className="overflow-x-auto rounded-lg border border-slate-700/50">
        <div className="divide-y divide-slate-800">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-2">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-800" />
              <div className="h-3 w-32 animate-pulse rounded bg-slate-800" />
              <div className="h-3 w-16 animate-pulse rounded bg-slate-800" />
              <div className="h-2 w-2 animate-pulse rounded-full bg-slate-800" />
              <div className="h-3 flex-1 animate-pulse rounded bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
