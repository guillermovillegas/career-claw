"use client";

import { useState } from "react";
import type { FormQAByCompany } from "@/lib/daily-summary-queries";

interface FormQAAccordionProps {
  data: FormQAByCompany[];
}

export function FormQAAccordion({ data }: FormQAAccordionProps) {
  const [openCompanies, setOpenCompanies] = useState<Set<string>>(new Set());

  function toggleCompany(company: string) {
    setOpenCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(company)) {
        next.delete(company);
      } else {
        next.add(company);
      }
      return next;
    });
  }

  function expandAll() {
    setOpenCompanies(new Set(data.map((d) => d.company)));
  }

  function collapseAll() {
    setOpenCompanies(new Set());
  }

  if (data.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-slate-500">
        No form Q&A data for this date.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-3 pb-2">
        <button
          type="button"
          onClick={expandAll}
          className="text-xs text-slate-500 transition-colors hover:text-slate-300"
        >
          Expand all
        </button>
        <span className="text-slate-700">|</span>
        <button
          type="button"
          onClick={collapseAll}
          className="text-xs text-slate-500 transition-colors hover:text-slate-300"
        >
          Collapse all
        </button>
      </div>
      {data.map((entry) => {
        const isOpen = openCompanies.has(entry.company);
        const flaggedCount = entry.questions.filter((qa) =>
          isFlaggedAnswer(qa.question, qa.answer)
        ).length;

        return (
          <div
            key={entry.company}
            className="rounded-lg border border-slate-700/30 bg-slate-900/50"
          >
            <button
              type="button"
              onClick={() => toggleCompany(entry.company)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-slate-800/40"
            >
              <div className="flex items-center gap-2">
                <ChevronIcon
                  className={`h-4 w-4 text-slate-500 transition-transform ${
                    isOpen ? "rotate-90" : ""
                  }`}
                />
                <span className="text-sm font-medium text-slate-200">
                  {entry.company}
                </span>
                <span className="text-xs text-slate-500">
                  {entry.questions.length} question
                  {entry.questions.length !== 1 ? "s" : ""}
                </span>
              </div>
              {flaggedCount > 0 && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
                  {flaggedCount} flagged
                </span>
              )}
            </button>
            {isOpen && (
              <div className="border-t border-slate-700/30 px-3 py-2">
                <div className="space-y-3">
                  {entry.questions.map((qa, idx) => {
                    const flagged = isFlaggedAnswer(qa.question, qa.answer);
                    return (
                      <div
                        key={`${entry.company}-${idx}`}
                        className={`rounded-lg p-2.5 ${
                          flagged
                            ? "border border-amber-500/30 bg-amber-500/5"
                            : "bg-slate-800/30"
                        }`}
                      >
                        <p className="text-xs font-medium text-slate-400">
                          Q: {qa.question}
                        </p>
                        <p
                          className={`mt-1 text-sm ${
                            flagged ? "text-amber-300" : "text-slate-200"
                          }`}
                        >
                          A: {qa.answer || "(empty)"}
                          {flagged && (
                            <span className="ml-2 text-xs text-amber-500">
                              {getFlagReason(qa.question, qa.answer)}
                            </span>
                          )}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Flag detection ─────────────────────────────────────────────────

function isFlaggedAnswer(question: string, answer: string): boolean {
  // Empty answer
  if (!answer || answer.trim().length === 0) {return true;}

  // Very short answer for a substantial question (more than 30 chars)
  if (question.length > 30 && answer.trim().length < 5) {return true;}

  // Placeholder-looking answers
  const placeholders = ["n/a", "na", "none", ".", "-", "--", "..."];
  if (placeholders.includes(answer.trim().toLowerCase())) {return true;}

  return false;
}

function getFlagReason(question: string, answer: string): string {
  if (!answer || answer.trim().length === 0) {return "-- empty answer";}
  if (question.length > 30 && answer.trim().length < 5)
    {return "-- suspiciously short";}
  const placeholders = ["n/a", "na", "none", ".", "-", "--", "..."];
  if (placeholders.includes(answer.trim().toLowerCase()))
    {return "-- placeholder answer";}
  return "-- flagged";
}

// ─── Icons ──────────────────────────────────────────────────────────

function ChevronIcon({ className }: { className?: string }) {
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
