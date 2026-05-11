# Studio Agents — Design

> Two Claude Console managed agents + one new feature surface (`notes`), brainstormed 2026-05-10.

## Why

SEEKO needs (a) a weekly studio snapshot for admin + investor visibility, and (b) a way for Karti to capture tasks and ideas from anywhere via text. Both are cheap to operate as managed agents in the Claude Console; both write to Supabase and surface in the seeko-studio dashboard. They share infrastructure (Supabase MCP, credential vault, observability), which is the reason to centralize them in the Console rather than rolling each as a Next.js route.

## Agents catalog

| Agent | Trigger | Purpose |
|---|---|---|
| `seeko-weekly-digest` | Cron Mon 08:00 America/New_York | Writes one `digests` row; app renders `/digest` |
| `seeko-studio-bot` | Telegram webhook | Karti texts the studio dashboard; agent creates tasks + notes, reads context |

**Shared Console infra:**
- Supabase MCP (service-role)
- Credential vault: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `TELEGRAM_BOT_TOKEN`, `ALLOWED_TELEGRAM_USER_IDS`
- Observability: Console run logs, traces, token counts

---

## 1. `seeko-studio-bot` — Telegram bot

### Flow

```
Karti texts bot
  → Telegram POSTs update → Console webhook
  → Allowlist check: from.id ∈ ALLOWED_TELEGRAM_USER_IDS?
    no → drop silently
    yes ↓
  → Resolve Telegram ID → profile UUID (env mapping for v1, single-operator)
  → Claude session loads with:
      • system prompt (studio context, current date, operator name)
      • tool definitions
      • memory store keyed by Telegram chat_id (~20 turns)
      • new user message
  → Claude calls tools as needed (Supabase reads/writes)
  → Claude returns reply text
  → Bridge POSTs to Telegram sendMessage API
```

### Tools

| Tool | Surface |
|---|---|
| `read_tasks(filters?)` | List tasks; optional filter by status, assignee, area, department |
| `create_task(name, department, ...)` | Insert into `tasks`; defaults `status='In Progress'`, `priority='Medium'` |
| `update_task(id, patch)` | Update status / assignee / deadline / priority / description |
| `read_areas()` | Areas + progress |
| `read_team()` | Profiles roster |
| `read_recent_tasks(limit=20)` | For context resolution ("that task I just made") |
| `create_note(body)` | Insert into `notes` with `status='open'`, `source='telegram'` |

**No `delete_task` tool.** Too easy to destroy work — agent can `update_task(status='Blocked')` or `update_task(status='Complete')` to retire a task instead.

### Destructive-action policy

Writes execute immediately. The reply confirms what happened ("Created task: Boss Music Pass · Animation · In Progress · due Fri 5/16"). Karti can ask the bot to undo. The cost of a wrong write is a follow-up message, which is cheap; the cost of every write needing a "yes?" round-trip kills the ergonomics.

### Memory

Console memory store, keyed by Telegram `chat_id`. Holds last ~20 message turns + any agent-set scratch keys (e.g., the last-created task ID for "make that high priority" follow-ups). Auto-trimmed.

### Auth gap (v1 limitation)

`ALLOWED_TELEGRAM_USER_IDS` maps to **one** profile UUID — Karti's. The bot is single-operator. Multi-user requires either a binding table or the magic-link onboarding flow; out of scope for v1.

---

## 2. Notes feature — studio inbox

### Why a new feature surface

The bot wants to capture short thoughts that aren't yet tasks ("need to redo boss music"). Forcing those into `tasks` pollutes the task list. Forcing them into `docs` is overkill (docs are long-form, hierarchical). A lightweight `notes` table gives capture a home and gives Karti an inbox to triage at the desk.

### `notes` table

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| body | text | The note content |
| status | `note_status` enum | `open` \| `archived` |
| source | text | `telegram` \| `web` (extensible) |
| created_by | uuid FK | → `profiles.id` |
| created_at | timestamptz | |
| converted_to_task_id | uuid FK nullable | → `tasks.id` (set when triaged into a task) |

**Enum:** `CREATE TYPE note_status AS ENUM ('open', 'archived');`

**RLS:** Admins can `select`, `insert`, `update`. Non-admins: no access. Bot inserts via service role.

### UI — `/inbox`

- Sidebar item "Inbox" — admin-only, with badge for `count(status = 'open')`
- Page lists open notes newest-first. Each row:
  - Body
  - Source badge (`telegram` / `web`)
  - Timestamp (relative)
  - Quick actions: **Archive** · **Convert to task** · **Edit**
- "Convert to task" opens a small form prefilled with note body as `description`. Submit creates a `tasks` row and updates the note: `converted_to_task_id = new_task.id`, `status = 'archived'`.
- Archived tab for browsing historic notes.
- Top of page: "Quick note" composer for adding notes from the web (so web isn't bot-only).

---

## 3. `seeko-weekly-digest`

### When

Cron `0 8 * * 1` in America/New_York. Summarizes prior week Mon 00:00 → Sun 23:59 (ET, expressed as UTC for SQL).

### `digests` table

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| week_start | date | Mon of summarized week (UTC) |
| week_end | date | Sun of summarized week (UTC) |
| generated_at | timestamptz | |
| data | jsonb | Structured payload |

`UNIQUE(week_start)` — one digest per week, re-runs noop.

### `data` jsonb shape

```ts
{
  payments: {
    created_count: number,
    created_total_usd: number,
    paid_count: number,
    paid_total_usd: number,
    pending_total_usd: number,            // outstanding as of week_end
    top_recipients: [{                    // top 5 by amount paid
      recipient_id: uuid,
      name: string,
      total_paid: number,
    }]
  },
  nda: {
    signed_count: number,
    unsigned_count: number,
    signed_this_week: [{                  // admin-only at render time
      user_id: uuid,
      name: string,
      signed_at: timestamptz,
    }],
    unsigned_list: [{ user_id, name }]    // admin-only at render time
  },
  team: {
    new_members: [{ id, name, department, role, created_at }],
    // role/flag changes omitted — no audit log exists yet
  }
}
```

### `/digest` access + render

- Sidebar entry "Digest" shown to `is_admin OR is_investor`
- `/digest` (server component) fetches latest row, filters `data` by viewer role:
  - **Admin** → full payload
  - **Investor** → aggregates only: `signed_count`, `unsigned_count`, `new_members` (name + dept + role, no flags); `signed_this_week` and `unsigned_list` stripped
- Routes:
  - `/digest` → latest week
  - `/digest/[year]-W[week]` → specific week (e.g. `/digest/2026-W19`)

### Team-activity caveat

No audit table exists. We can report new members via `profiles.created_at`, but role and flag changes are invisible. To capture those later: add `profiles_audit` table + Supabase trigger on update. Out of scope for v1.

### Agent run

1. Compute `week_start`/`week_end` for the just-finished week (ET → UTC)
2. Query payments (created/paid/pending in window) + payment_items for recipient totals
3. Query profiles (NDA fields + new members)
4. Assemble `data` jsonb
5. `INSERT INTO digests` (idempotent via unique constraint)
6. Log run result

### Failure mode

If the agent errors, no row is written. `/digest` shows "no digest for week of X". Next Monday's run continues. No retry on the agent side — weekly is the cadence; a missed week is recoverable manually.

---

## Cost estimate

**Telegram bot** (Claude Sonnet 4.6 at API rates, ~10k input / 500 output tokens per turn):
- 10 msg/day → ~$12/month
- 30 msg/day → ~$36/month
- 100 msg/day → ~$120/month

**Weekly digest:** ~$1/month (4 runs × ~50k tokens each).

Console managed-runtime fee is on top of these and not publicly priced — visible in Console before enabling.

## Out of scope (parking lot)

- Multi-user Telegram (binding flow, magic links)
- Payments creation via bot (high blast radius — service-role can mutate money)
- Doc drafting via bot
- Role / flag change tracking (needs `profiles_audit`)
- PR sentinel agent (separate brainstorm — flagged as the next agent after these ship)

## Next step

Invoke `writing-plans` to produce an implementation plan covering, in order:
1. `notes` table + enum + RLS + types
2. `/inbox` route + sidebar entry
3. `digests` table + types
4. `/digest` route + sidebar entry + role-based render
5. Console agent: `seeko-weekly-digest`
6. Console agent: `seeko-studio-bot` (Telegram webhook, allowlist, tools, memory)
