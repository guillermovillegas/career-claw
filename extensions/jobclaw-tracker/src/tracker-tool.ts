import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../../../src/plugins/types.js";
import { getSupabaseClient, type SupabaseRestClient, type SupabaseRow } from "./db-client.js";

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function stringEnum<T extends string>(values: T[], opts?: { description?: string }) {
  return Type.Unsafe<T>({ type: "string", enum: values, ...opts });
}

/** Queue an insert and return the queued row data. */
async function queuedInsert(
  db: SupabaseRestClient,
  table: string,
  data: Record<string, unknown>,
): Promise<
  | { ok: true; row: SupabaseRow; queued: boolean }
  | { ok: false; error: string; debug?: Record<string, unknown> }
> {
  const result = await db.insert(table, data);
  if (result.error) return { ok: false, error: result.error.message, debug: result._debug };
  if (!result.data || result.data.length === 0) {
    return { ok: false, error: `Insert to ${table} failed to queue.`, debug: result._debug };
  }
  return { ok: true, row: result.data[0], queued: Boolean(result.data[0]._queued) };
}

/** Build PostgREST query string from filter params. */
function buildQuery(
  filters: Record<string, unknown>,
  opts?: { orderBy?: string; ascending?: boolean; limit?: number; selectFields?: string },
): string {
  const parts: string[] = [];
  if (opts?.selectFields) parts.push(`select=${opts.selectFields}`);
  for (const [key, val] of Object.entries(filters)) {
    if (val !== undefined && val !== null && key !== "limit") {
      parts.push(`${key}=eq.${encodeURIComponent(String(val))}`);
    }
  }
  if (opts?.orderBy) {
    parts.push(`order=${opts.orderBy}.${opts?.ascending ? "asc" : "desc"}`);
  }
  const limit = (filters.limit as number) || opts?.limit || 50;
  parts.push(`limit=${limit}`);
  return parts.join("&");
}

export function createTrackerTool(api: OpenClawPluginApi) {
  const cfg = (api.pluginConfig ?? {}) as { supabaseUrl?: string; supabaseKey?: string };

  return {
    name: "jobclaw",
    label: "CareerClaw Tracker",
    description:
      "Track job applications, freelance proposals, clients, outreach, and follow-ups. " +
      "Use this tool to create, read, update, and query career-related records in the database.",
    parameters: Type.Object({
      action: stringEnum(
        [
          "create_job",
          "create_application",
          "update_application",
          "list_applications",
          "get_stats",
          "create_proposal",
          "update_proposal",
          "list_proposals",
          "create_client",
          "update_client",
          "list_clients",
          "create_contact",
          "list_contacts",
          "log_communication",
          "create_outreach_sequence",
          "list_followups",
          "log_automation",
        ],
        { description: "The tracker action to perform." },
      ),
      data: Type.Optional(
        Type.Unknown({
          description:
            "Action-specific payload. For create actions: field values. For update: { id, ...fields }. For list: optional filters.",
        }),
      ),
    }),

    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const action = params.action as string;
      // data may arrive as a JSON string (OC tool framework serializes Unknown as string)
      const rawData = params.data ?? {};
      const data = (typeof rawData === "string" ? JSON.parse(rawData) : rawData) as Record<
        string,
        unknown
      >;

      let db: SupabaseRestClient;
      try {
        db = getSupabaseClient(cfg.supabaseUrl, cfg.supabaseKey);
      } catch (e) {
        return jsonResult({
          error: `DB connection failed: ${e instanceof Error ? e.message : String(e)}`,
          hint: "Check JOBCLAW_SUPABASE_URL and JOBCLAW_SUPABASE_KEY in .env or plugin config",
        });
      }

      // Rate limiting for submissions
      if (action === "create_application" || action === "create_proposal") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        const table = action === "create_application" ? "applications" : "freelance_proposals";
        const limit = action === "create_application" ? 100 : 50;
        const label = action === "create_application" ? "applications" : "proposals";

        const { count, error: countErr } = await db.selectCount(
          table,
          `created_at=gte.${todayISO}`,
        );
        if (countErr) return jsonResult({ error: countErr.message });
        if (count >= limit) {
          return jsonResult({
            error: `Daily ${label} limit reached (${limit}/day). Try again tomorrow.`,
            today_count: count,
            limit,
          });
        }
      }

      switch (action) {
        // ---- Jobs ----
        case "create_job": {
          // Normalize field names and enum values to match DB schema
          const jobData: Record<string, unknown> = { ...data };
          // Field rename: agents often use source_url instead of url
          if ("source_url" in jobData && !("url" in jobData)) {
            jobData.url = jobData.source_url;
            delete jobData.source_url;
          }
          // Normalize enum values: underscores → hyphens
          const jobTypeMap: Record<string, string> = {
            full_time: "full-time",
            part_time: "part-time",
            full_time_contract: "contract",
          };
          if (typeof jobData.job_type === "string" && jobData.job_type in jobTypeMap) {
            jobData.job_type = jobTypeMap[jobData.job_type];
          }
          const workModeMap: Record<string, string> = { on_site: "on-site", onsite: "on-site" };
          if (typeof jobData.work_mode === "string" && jobData.work_mode in workModeMap) {
            jobData.work_mode = workModeMap[jobData.work_mode];
          }
          // Only keep known columns (strip internal/unknown fields)
          const knownJobCols = new Set([
            "title",
            "company",
            "location",
            "salary_min",
            "salary_max",
            "job_type",
            "work_mode",
            "description",
            "requirements",
            "url",
            "platform",
            "posting_date",
            "deadline",
            "skills_required",
            "experience_required",
            "match_score",
          ]);
          for (const k of Object.keys(jobData)) {
            if (!knownJobCols.has(k)) delete jobData[k];
          }
          // Validate required fields
          if (!jobData.title || !jobData.company || !jobData.platform) {
            return jsonResult({
              error: "create_job requires title, company, and platform",
              received_keys: Object.keys(data),
            });
          }
          const result = await queuedInsert(db, "jobs", jobData);
          if (!result.ok)
            return jsonResult({ error: result.error, table: "jobs", _debug: result.debug });
          return jsonResult({
            queued: true,
            table: "jobs",
            title: jobData.title,
            note: "Job queued. Will persist after process-queue.sh runs.",
          });
        }

        // ---- Applications ----
        case "create_application": {
          const result = await queuedInsert(db, "applications", data);
          if (!result.ok) return jsonResult({ error: result.error, table: "applications" });
          return jsonResult({ queued: true, table: "applications", note: "Application queued." });
        }

        case "update_application": {
          const { id, ...fields } = data;
          if (!id) return jsonResult({ error: "id is required for update" });
          const { error } = await db.update("applications", fields, `id=eq.${id}`);
          if (error) return jsonResult({ error: error.message });
          return jsonResult({ updated: true, id, fields });
        }

        case "list_applications": {
          const query = buildQuery(
            { status: data.status, platform: data.platform },
            {
              selectFields: "*,jobs(title,company,location)",
              orderBy: "created_at",
              ascending: false,
              limit: data.limit as number,
            },
          );
          const { data: rows, error } = await db.select("applications", query);
          if (error) return jsonResult({ error: error.message });
          return jsonResult({ applications: rows, count: rows?.length ?? 0 });
        }

        case "get_stats": {
          const [apps, proposals, clients, jobs] = await Promise.all([
            db.select("applications", "select=status"),
            db.selectCount("freelance_proposals"),
            db.selectCount("clients", "status=eq.active"),
            db.selectCount("jobs"),
          ]);

          const appRows = apps.data ?? [];
          const statusCounts: Record<string, number> = {};
          for (const row of appRows) {
            const s = row.status as string;
            statusCounts[s] = (statusCounts[s] ?? 0) + 1;
          }

          return jsonResult({
            jobs: { total: jobs.count },
            applications: { total: appRows.length, by_status: statusCounts },
            proposals: { total: proposals.count },
            clients: { total: clients.count },
          });
        }

        // ---- Freelance Proposals ----
        case "create_proposal": {
          const proposalData: Record<string, unknown> = { ...data };
          // Field rename: agents often use url instead of project_url
          if ("url" in proposalData && !("project_url" in proposalData)) {
            proposalData.project_url = proposalData.url;
            delete proposalData.url;
          }
          // Field rename: agents sometimes use title instead of project_title
          if ("title" in proposalData && !("project_title" in proposalData)) {
            proposalData.project_title = proposalData.title;
            delete proposalData.title;
          }
          // Only keep known columns
          const knownProposalCols = new Set([
            "application_id",
            "platform",
            "project_title",
            "project_url",
            "client_name",
            "client_country",
            "budget_min",
            "budget_max",
            "budget_type",
            "proposal_text",
            "bid_amount",
            "estimated_duration",
            "status",
            "submitted_at",
          ]);
          for (const k of Object.keys(proposalData)) {
            if (!knownProposalCols.has(k)) delete proposalData[k];
          }
          const result = await queuedInsert(db, "freelance_proposals", proposalData);
          if (!result.ok) return jsonResult({ error: result.error, table: "freelance_proposals" });
          return jsonResult({
            queued: true,
            table: "freelance_proposals",
            note: "Proposal queued.",
          });
        }

        case "update_proposal": {
          const { id, ...fields } = data;
          if (!id) return jsonResult({ error: "id is required for update" });
          const { error } = await db.update("freelance_proposals", fields, `id=eq.${id}`);
          if (error) return jsonResult({ error: error.message });
          return jsonResult({ updated: true, id, fields });
        }

        case "list_proposals": {
          const query = buildQuery(
            { status: data.status, platform: data.platform },
            {
              selectFields: "*",
              orderBy: "created_at",
              ascending: false,
              limit: data.limit as number,
            },
          );
          const { data: rows, error } = await db.select("freelance_proposals", query);
          if (error) return jsonResult({ error: error.message });
          return jsonResult({ proposals: rows, count: rows?.length ?? 0 });
        }

        // ---- Clients ----
        case "create_client": {
          const result = await queuedInsert(db, "clients", data);
          if (!result.ok) return jsonResult({ error: result.error, table: "clients" });
          return jsonResult({ queued: true, table: "clients", note: "Client queued." });
        }

        case "update_client": {
          const { id, ...fields } = data;
          if (!id) return jsonResult({ error: "id is required for update" });
          const { error } = await db.update("clients", fields, `id=eq.${id}`);
          if (error) return jsonResult({ error: error.message });
          return jsonResult({ updated: true, id, fields });
        }

        case "list_clients": {
          const query = buildQuery(
            { status: data.status },
            {
              selectFields: "*",
              orderBy: "created_at",
              ascending: false,
              limit: data.limit as number,
            },
          );
          const { data: rows, error } = await db.select("clients", query);
          if (error) return jsonResult({ error: error.message });
          return jsonResult({ clients: rows, count: rows?.length ?? 0 });
        }

        // ---- Contacts ----
        case "create_contact": {
          const result = await queuedInsert(db, "contacts", data);
          if (!result.ok) return jsonResult({ error: result.error, table: "contacts" });
          return jsonResult({ queued: true, table: "contacts", note: "Contact queued." });
        }

        case "list_contacts": {
          const parts: string[] = ["select=*", "order=last_contact_date.desc"];
          if (data.relationship) parts.push(`relationship=eq.${data.relationship}`);
          if (data.company)
            parts.push(`company=ilike.*${encodeURIComponent(String(data.company))}*`);
          parts.push(`limit=${(data.limit as number) || 50}`);

          const { data: rows, error } = await db.select("contacts", parts.join("&"));
          if (error) return jsonResult({ error: error.message });
          return jsonResult({ contacts: rows, count: rows?.length ?? 0 });
        }

        // ---- Communication ----
        case "log_communication": {
          const result = await queuedInsert(db, "communication_log", data);
          if (!result.ok) return jsonResult({ error: result.error, table: "communication_log" });
          return jsonResult({
            queued: true,
            table: "communication_log",
            note: "Communication logged to queue.",
          });
        }

        // ---- Outreach Sequences ----
        case "create_outreach_sequence": {
          const result = await queuedInsert(db, "outreach_sequences", data);
          if (!result.ok) return jsonResult({ error: result.error, table: "outreach_sequences" });
          return jsonResult({
            queued: true,
            table: "outreach_sequences",
            note: "Sequence queued.",
          });
        }

        case "list_followups": {
          const now = new Date().toISOString().split("T")[0];

          const [appFollowups, sequences] = await Promise.all([
            db.select(
              "applications",
              `select=id,platform,status,next_followup_date,jobs(title,company)&next_followup_date=not.is.null&next_followup_date=lte.${now}&status=in.(applied,phone_screen,interview)&order=next_followup_date.asc&limit=20`,
            ),
            db.select(
              "outreach_sequences",
              `select=*,contacts(name,email,company)&status=eq.active&next_send_at=lte.${now}&order=next_send_at.asc&limit=20`,
            ),
          ]);

          if (appFollowups.error || sequences.error) {
            return jsonResult({ error: appFollowups.error?.message ?? sequences.error?.message });
          }

          return jsonResult({
            overdue_followups: appFollowups.data ?? [],
            due_sequences: sequences.data ?? [],
            total: (appFollowups.data?.length ?? 0) + (sequences.data?.length ?? 0),
          });
        }

        // ---- Automation Logging ----
        case "log_automation": {
          const result = await queuedInsert(db, "automation_logs", data);
          if (!result.ok) return jsonResult({ error: result.error, table: "automation_logs" });
          return jsonResult({
            queued: true,
            table: "automation_logs",
            note: "Automation log queued.",
          });
        }

        default:
          return jsonResult({ error: `Unknown action: ${action}` });
      }
    },
  };
}
