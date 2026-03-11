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
      <p className="px-3 py-4 text-sm text-neutral-500">
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
          className="text-xs text-neutral-500 transition-colors hover:text-neutral-300"
        >
          Expand all
        </button>
        <span className="text-neutral-700">|</span>
        <button
          type="button"
          onClick={collapseAll}
          className="text-xs text-neutral-500 transition-colors hover:text-neutral-300"
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
            className="rounded-lg border border-neutral-700/30 bg-neutral-900/50"
          >
            <button
              type="button"
              onClick={() => toggleCompany(entry.company)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-neutral-800/40"
            >
              <div className="flex items-center gap-2">
                <ChevronIcon
                  className={`h-4 w-4 text-neutral-500 transition-transform ${
                    isOpen ? "rotate-90" : ""
                  }`}
                />
                <span className="text-sm font-medium text-neutral-200">
                  {entry.company}
                </span>
                <span className="text-xs text-neutral-500">
                  {entry.questions.length} question
                  {entry.questions.length !== 1 ? "s" : ""}
                </span>
              </div>
              {flaggedCount > 0 && (
                <span className="rounded-full bg-neutral-400/15 px-2 py-0.5 text-xs font-medium text-neutral-400">
                  {flaggedCount} flagged
                </span>
              )}
            </button>
            {isOpen && (
              <div className="border-t border-neutral-700/30 px-3 py-2">
                <div className="space-y-3">
                  {entry.questions.map((qa, idx) => {
                    const flagged = isFlaggedAnswer(qa.question, qa.answer);
                    return (
                      <div
                        key={`${entry.company}-${idx}`}
                        className={`rounded-lg p-2.5 ${
                          flagged
                            ? "border border-neutral-400/30 bg-neutral-400/5"
                            : "bg-neutral-800/30"
                        }`}
                      >
                        <p className="text-xs font-medium text-neutral-400">
                          Q: {qa.question}
                        </p>
                        <p
                          className={`mt-1 text-sm ${
                            flagged ? "text-neutral-300" : "text-neutral-200"
                          }`}
                        >
                          A: {qa.answer || "(empty)"}
                          {flagged && (
                            <span className="ml-2 text-xs text-neutral-400">
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
