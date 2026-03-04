# jobclaw-tracker

CareerClaw job tracking extension for OpenClaw. Provides CRUD operations for jobs, applications, proposals, clients, contacts, outreach sequences, and automation logging via Supabase.

## Tool

- **Name:** `jobclaw`
- **Label:** CareerClaw Tracker

## Actions

| Action                     | Table                 | Description                                                              |
| -------------------------- | --------------------- | ------------------------------------------------------------------------ |
| `create_job`               | `jobs`                | Track a new job listing                                                  |
| `create_application`       | `applications`        | Record a job application (rate limited: 15/day)                          |
| `update_application`       | `applications`        | Update status, notes, follow-up date                                     |
| `list_applications`        | `applications`        | Query applications with optional filters: `status`, `platform`, `limit`  |
| `get_stats`                | multiple              | Aggregate counts across applications, proposals, clients                 |
| `create_proposal`          | `freelance_proposals` | Save a freelance proposal draft (rate limited: 10/day)                   |
| `update_proposal`          | `freelance_proposals` | Update proposal status or content                                        |
| `list_proposals`           | `freelance_proposals` | Query proposals with optional filters: `status`, `platform`, `limit`     |
| `create_client`            | `clients`             | Track a freelance client                                                 |
| `update_client`            | `clients`             | Update client details or status                                          |
| `list_clients`             | `clients`             | Query clients with optional filters: `status`, `limit`                   |
| `create_contact`           | `contacts`            | Add a networking contact                                                 |
| `list_contacts`            | `contacts`            | Query contacts with optional filters: `relationship`, `company`, `limit` |
| `log_communication`        | `communication_log`   | Log an email, call, or message                                           |
| `create_outreach_sequence` | `outreach_sequences`  | Set up a multi-step outreach cadence                                     |
| `list_followups`           | multiple              | Get overdue application follow-ups and due outreach sequences            |
| `log_automation`           | `automation_logs`     | Record automated action for audit trail                                  |

## Parameters

```typescript
{
  action: string,  // One of the actions above
  data?: object    // Action-specific payload (fields for create, { id, ...fields } for update, filters for list)
}
```

## Rate Limits

- Applications: **15/day** (configurable via `MAX_APPLICATIONS_PER_DAY`)
- Proposals: **10/day** (configurable via `MAX_SEARCHES_PER_HOUR`)

## Supabase Tables

`jobs`, `applications`, `freelance_proposals`, `clients`, `contacts`, `communication_log`, `outreach_sequences`, `automation_logs`

## Configuration

Requires `supabaseUrl` and `supabaseKey` in plugin config or environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
