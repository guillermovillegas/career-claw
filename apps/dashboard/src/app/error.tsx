"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
        <h2 className="text-xl font-bold text-rose-400">Something went wrong</h2>
        <p className="mt-2 text-sm text-slate-400">
          {error.message || "An unexpected error occurred"}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-rose-500/20 px-4 py-2 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/30"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
