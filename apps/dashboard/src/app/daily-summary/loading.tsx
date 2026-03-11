export default function DailySummaryLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-neutral-800" />
        <div className="h-10 w-80 animate-pulse rounded-lg bg-neutral-800/50" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-neutral-700/50 bg-neutral-800/30"
          />
        ))}
      </div>

      {/* Submitted applications table skeleton */}
      <div className="animate-pulse rounded-lg border border-neutral-700/50 bg-neutral-900">
        <div className="border-b border-neutral-700/50 px-4 py-3">
          <div className="h-4 w-48 rounded bg-neutral-800" />
        </div>
        <div className="border-b border-neutral-700/50 bg-neutral-800/50 px-4 py-2.5">
          <div className="h-3 w-full rounded bg-neutral-700/50" />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="h-12 border-b border-neutral-700/20"
          />
        ))}
      </div>

      {/* Form Q&A skeleton */}
      <div className="animate-pulse rounded-lg border border-neutral-700/50 bg-neutral-900">
        <div className="border-b border-neutral-700/50 px-4 py-3">
          <div className="h-4 w-36 rounded bg-neutral-800" />
        </div>
        <div className="space-y-2 p-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="h-12 rounded-lg bg-neutral-800/30"
            />
          ))}
        </div>
      </div>

      {/* Failed submissions skeleton */}
      <div className="animate-pulse rounded-lg border border-neutral-500/20 bg-neutral-500/5">
        <div className="border-b border-neutral-500/15 px-4 py-3">
          <div className="h-4 w-40 rounded bg-neutral-800" />
        </div>
        <div className="space-y-2 p-3">
          {Array.from({ length: 2 }, (_, i) => (
            <div
              key={i}
              className="h-10 rounded-lg bg-neutral-800/20"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
