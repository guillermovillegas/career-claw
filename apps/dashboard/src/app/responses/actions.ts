"use server";

import { supabase } from "@/lib/supabase";
import type { CommunicationLog, Application, Job } from "@/lib/database.types";

interface DraftResult {
  draft: string | null;
  error: string | null;
}

export async function generateReplyDraft(
  appId: string,
  commLogId: string
): Promise<DraftResult> {
  // Fetch application + job + comm log
  const [appRes, commRes] = await Promise.all([
    supabase
      .from("applications")
      .select("*, jobs(*)")
      .eq("id", appId)
      .single(),
    supabase
      .from("communication_log")
      .select("*")
      .eq("id", commLogId)
      .single(),
  ]);

  if (appRes.error || !appRes.data) {
    return { draft: null, error: "Application not found" };
  }
  if (commRes.error || !commRes.data) {
    return { draft: null, error: "Communication log not found" };
  }

  const app = appRes.data as Application & { jobs: Job | null };
  const comm = commRes.data as CommunicationLog;
  const job = app.jobs;

  const prompt = `Draft a professional reply to an email about a job application.

Company: ${job?.company ?? "Unknown"}
Role: ${job?.title ?? "Unknown"}
Application Status: ${app.status}
Email Subject: ${comm.subject ?? "(no subject)"}
Email Summary: ${comm.content_summary ?? ""}
${comm.full_content ? `Email Body: ${comm.full_content.slice(0, 2000)}` : ""}

Write a concise, professional reply (2-3 sentences). Be warm but brief. If it's a rejection, thank them graciously. If it's an interview invite, express enthusiasm and confirm availability. If it's a generic update, acknowledge receipt.

Reply only with the email text, no subject line or signature.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen3:8b",
        prompt: `/nothink\n${prompt}`,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return { draft: null, error: `Ollama returned ${res.status}` };
    }

    const data = (await res.json()) as { response?: string };
    let draft = data.response?.trim() ?? "";

    // Strip any <think> tags that qwen3 might emit
    draft = draft.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    if (!draft) {
      return { draft: null, error: "Empty response from model" };
    }

    return { draft, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("abort")) {
      return { draft: null, error: "Ollama request timed out (is Ollama running?)" };
    }
    return { draft: null, error: `Ollama unavailable: ${msg}` };
  }
}
