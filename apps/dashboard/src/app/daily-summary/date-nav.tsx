"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

interface DateNavProps {
  currentDate: string;
}

export function DateNav({ currentDate }: DateNavProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigateToDate = useCallback(
    (date: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", date);
      router.push(`/daily-summary?${params.toString()}`);
    },
    [router, searchParams]
  );

  function shiftDate(days: number) {
    const d = new Date(currentDate + "T12:00:00");
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    navigateToDate(`${yyyy}-${mm}-${dd}`);
  }

  function goToToday() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    navigateToDate(`${yyyy}-${mm}-${dd}`);
  }

  const todayStr = formatLocalDate(new Date());
  const isToday = currentDate === todayStr;

  const displayDate = new Date(currentDate + "T12:00:00").toLocaleDateString(
    "en-US",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }
  );

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => shiftDate(-1)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        title="Previous day"
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2">
        <input
          type="date"
          value={currentDate}
          max={todayStr}
          onChange={(e) => {
            if (e.target.value) {navigateToDate(e.target.value);}
          }}
          className="rounded-lg border border-slate-700/50 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-emerald-500/50 [&::-webkit-calendar-picker-indicator]:invert"
        />
        <span className="text-sm text-slate-400">{displayDate}</span>
      </div>

      <button
        type="button"
        onClick={() => shiftDate(1)}
        disabled={isToday}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
        title="Next day"
      >
        <ChevronRightIcon className="h-4 w-4" />
      </button>

      {!isToday && (
        <button
          type="button"
          onClick={goToToday}
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
        >
          Today
        </button>
      )}
    </div>
  );
}

function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Icons ──────────────────────────────────────────────────────────

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 19.5 8.25 12l7.5-7.5"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m8.25 4.5 7.5 7.5-7.5 7.5"
      />
    </svg>
  );
}
