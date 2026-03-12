import { getAutomationLogs, getCommunicationLogs } from "@/lib/queries";
import type { AutomationLog, CommunicationLog } from "@/lib/database.types";
import { LogsClient } from "./logs-client";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  let automationLogs: AutomationLog[] = [];
  let communicationLogs: CommunicationLog[] = [];
  let fetchError: string | null = null;

  try {
    [automationLogs, communicationLogs] = await Promise.all([
      getAutomationLogs(500),
      getCommunicationLogs(500),
    ]);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  if (fetchError) {
    return (
      <div className="space-y-3">
        <h1 className="text-sm font-semibold text-neutral-300">Logs</h1>
        <div className="rounded-lg border border-neutral-700/50 bg-neutral-900/10 px-4 py-6">
          <p className="text-xs font-semibold text-neutral-400 mb-1">
            Query error
          </p>
          <p className="text-xs text-neutral-300 font-mono break-all">
            {fetchError}
          </p>
          <p className="mt-2 text-xs text-neutral-400">
            Check Supabase RLS policies on automation_logs and
            communication_log tables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <LogsClient
      automationLogs={automationLogs}
      communicationLogs={communicationLogs}
    />
  );
}
