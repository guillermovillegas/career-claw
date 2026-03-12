"use client";

import { useState, useCallback } from "react";
import { generateReplyDraft } from "./actions";

interface DraftReplyProps {
  appId: string;
  commLogId: string;
}

export function DraftReply({ appId, commLogId }: DraftReplyProps) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    setState("loading");
    setError("");
    const result = await generateReplyDraft(appId, commLogId);
    if (result.error) {
      setError(result.error);
      setState("error");
    } else {
      setDraft(result.draft ?? "");
      setState("done");
    }
  }, [appId, commLogId]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = draft;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [draft]);

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={handleGenerate}
        className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        Draft reply
      </button>
    );
  }

  if (state === "loading") {
    return (
      <span className="text-xs text-neutral-500 animate-pulse">
        Generating...
      </span>
    );
  }

  if (state === "error") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-500">{error}</span>
        <button
          type="button"
          onClick={handleGenerate}
          className="text-xs text-neutral-400 hover:text-neutral-300 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-1">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 focus:border-neutral-500 focus:outline-none resize-y"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className={`text-xs px-2 py-0.5 rounded transition-colors ${
            copied
              ? "bg-white/10 text-white"
              : "bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-neutral-300"
          }`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          Regenerate
        </button>
      </div>
    </div>
  );
}
