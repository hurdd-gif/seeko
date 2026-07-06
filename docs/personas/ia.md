# Persona: Information Architect

Load this file when working on: Supabase schema, content hierarchy, task taxonomy, data modeling.

---

## Overview

Supabase Postgres is the **single source of truth** for SEEKO Studio data.
Karti manages content via the Supabase Table Editor.
The TypeScript types in `src/lib/types.ts` must align with the table columns exactly.

---

## Supabase Tables

### 1. profiles (= team roster)

Every authenticated user gets a profile row automatically on signup. This doubles as the team roster — the `/team` page lists all profiles.

| Column        | Type           | Notes                                                        |
|---------------|----------------|--------------------------------------------------------------|
| id            | uuid (PK)      | References auth.users                                        |
| display_name  | text           | User display name                                            |
| department    | department enum| Coding, Visual Art, UI/UX, Animation, Asset Creation         |
| role          | text           | Job title / role description                                 |
| is_admin      | boolean        | Full admin access                                            |
| is_contractor | boolean        | Contractor; Activity page hidden from sidebar                |
| is_investor   | boolean        | Grants access to /investor panel; investors see limited view |
| created_at    | timestamptz    |                                                              |
| nda_accepted_at   | timestamptz    | When they signed the NDA (null = not signed)                 |
| nda_signer_name   | text           | Legal full name as typed during signing                      |
| nda_signer_address| text           | Address as typed during signing                              |
| nda_ip            | text           | IP address at time of signing                                |
| nda_user_agent    | text           | Browser user agent at time of signing                        |

---

### 2. tasks

| Column      | Type             | Notes                                                                |
|-------------|------------------|----------------------------------------------------------------------|
| id          | uuid (PK)        | Auto-generated                                                       |
| task_number | bigint           | Auto from `task_number_seq`; displayed as the bare number in the board (no prefix)     |
| name        | text             | Task name                                                            |
| department  | department enum  | Coding, Visual Art, UI/UX, Animation, Asset Creation                 |
| status      | task_status enum | Backlog, Todo, In Progress, In Review, Done, Canceled, Duplicate     |
| priority    | priority enum    | High, Medium, Low                                                    |
| area_id     | uuid (FK)        | → areas.id                                                           |
| assignee_id | uuid (FK)        | → profiles.id                                                        |
| deadline    | date             |                                                                      |
| description | text             |                                                                      |
| bounty      | numeric          | Optional payment amount                                              |
| progress    | smallint         | 0–100, default 0                                                     |
| created_at  | timestamptz      |                                                                      |
| updated_at  | timestamptz      | Auto-touched by BEFORE UPDATE trigger                                |

AFTER INSERT/UPDATE/DELETE on `tasks` write typed rows to `activity_log` (kind = `created`, `status_changed`, `assignee_changed`, `progress_changed`; legacy text rows for priority/department/assigned/deleted).

#### Milestones

| Table             | Columns                                                                   |
|-------------------|---------------------------------------------------------------------------|
| `milestones`      | id, name, target_date, area_id (FK areas, null on delete), sort_order, created_at |
| `task_milestone`  | task_id (FK tasks, cascade), milestone_id (FK milestones, cascade), PK both |

RLS: any authenticated user can SELECT; only `profiles.is_admin = true` can INSERT/UPDATE/DELETE. AFTER INSERT/DELETE on `task_milestone` write `milestone_linked`/`milestone_unlinked` rows to `activity_log`.

---

### 3. areas

| Column      | Type              | Notes                                    |
|-------------|-------------------|------------------------------------------|
| id          | uuid (PK)         | Auto-generated                           |
| name        | text              | Area name                                |
| status      | area_status enum  | Active, Planned, Complete                |
| progress    | int               | Percentage 0–100                         |
| description | text              |                                          |
| phase       | area_phase enum   | Alpha, Beta, Launch                      |
| created_at  | timestamptz       |                                          |

**Rows:** Main Game, Fighting Club

---

### 4. docs

| Column     | Type        | Notes                                    |
|------------|-------------|------------------------------------------|
| id         | uuid (PK)   | Auto-generated                           |
| title      | text        | Doc title                                |
| content    | text        | HTML content                             |
| parent_id  | uuid (FK)   | → docs.id (self-referencing tree)        |
| sort_order | int         | Ordering within a parent                 |
| granted_user_ids | uuid[] | User IDs granted access when doc is department-restricted |
| created_at | timestamptz |                                          |

### 5. payments

| Column          | Type             | Notes                                                       |
|-----------------|------------------|-------------------------------------------------------------|
| id              | uuid (PK)        | Auto-generated                                              |
| recipient_id    | uuid (FK, null)  | → profiles.id (null for external payees/invoices)           |
| recipient_email | text (null)      | External invoice flow identity                              |
| payee_name      | text (null)      | Manual external payee (vendor/subscription); XOR w/ recipient_id, at least one identity of the three required (check constraints) |
| amount          | decimal          | Total payment amount                                        |
| currency     | text             | Default 'USD'                          |
| description  | text             | Summary of what payment covers         |
| status       | payment_status   | pending, paid, cancelled               |
| paid_at      | timestamptz      | When marked as paid                    |
| created_by   | uuid (FK)        | → profiles.id (admin who created it)   |
| created_at   | timestamptz      |                                        |

### 6. payment_items

| Column     | Type             | Notes                                  |
|------------|------------------|----------------------------------------|
| id         | uuid (PK)        | Auto-generated                         |
| payment_id | uuid (FK)        | → payments.id (cascade delete)         |
| task_id    | uuid (FK, null)  | → tasks.id (null for custom items)     |
| label      | text             | Description                            |
| amount     | decimal          | Line item amount                       |

### 7. passkey_credentials

One row per registered WebAuthn device. Gates `/payments` instead of a shared password.

| Column        | Type           | Notes                                                |
|---------------|----------------|------------------------------------------------------|
| id            | uuid (PK)      | Auto-generated                                       |
| user_id       | uuid (FK)      | → profiles.id (cascade delete)                       |
| credential_id | text (unique)  | WebAuthn credential ID (base64url)                   |
| public_key    | text           | Credential public key, base64url-encoded             |
| counter       | bigint         | Signature counter (clone detection)                  |
| transports    | text[]         | usb, nfc, ble, internal, hybrid                      |
| device_name   | text           | Human-readable device label (derived from UA)        |
| created_at    | timestamptz    |                                                      |
| last_used_at  | timestamptz    | Updated on successful auth-verify                    |

RLS: owner can `select` and `delete`. Inserts/updates go through API routes using the service role.

### 8. passkey_challenges

Short-lived registration/authentication challenges. One row per `(user_id, kind)`.

| Column     | Type           | Notes                                              |
|------------|----------------|----------------------------------------------------|
| user_id    | uuid (FK, PK)  | → profiles.id (cascade delete)                     |
| challenge  | text           | Base64url-encoded random challenge                 |
| kind       | text (PK)      | `register` or `auth` (check constraint)            |
| expires_at | timestamptz    | Defaults to `now() + interval '5 minutes'`         |

RLS: enabled, no client policies — service-role-only.

### 9. notes

Inbox surface for the Studio Agents Quick Note composer (in-app, written as the admin user) and the Telegram bot (writes via service role, bypassing RLS). `note_status` enum is `open | archived`.

| Column               | Type                | Notes                                                  |
|----------------------|---------------------|--------------------------------------------------------|
| id                   | uuid (PK)           | Auto-generated                                         |
| body                 | text                | Note contents                                          |
| status               | note_status enum    | `open` or `archived` (defaults to `open`)              |
| source               | note_source enum    | Origin tag (`web` or `telegram`); defaults to `web`    |
| created_by           | uuid (FK)           | → profiles.id (cascade delete)                         |
| created_at           | timestamptz         | Defaults to `now()`                                    |
| converted_to_task_id | uuid (FK, null)     | → tasks.id (null until promoted; set null on task delete) |

Indexes: `(status, created_at desc)` for the inbox feed, `(created_by)` for per-author lookups.

RLS: admin-only `select` / `insert` / `update` (checked against `profiles.is_admin`). The Telegram bot inserts via the service role, which bypasses RLS.

---

### 10. task_steps

Admin-authored deliverable sub-steps ("breadcrumbs") for the contractor portal. Each task/deliverable holds 1–10 ordered steps on one vertical spine. The stored enum is deliberately tiny — the situational `active`/`missed` render states are **derived** at render time in `src/lib/contractor-steps.ts`, never stored.

| Column     | Type                 | Notes                                                      |
|------------|----------------------|------------------------------------------------------------|
| id         | uuid (PK)            | Auto-generated                                             |
| task_id    | uuid (FK)            | → tasks.id (cascade delete)                                |
| name       | text                 | Step label                                                 |
| deadline   | date (null)          | Nullable ("No deadline")                                   |
| state      | task_step_state enum | pending, in_review, done (defaults to `pending`)           |
| sort_order | int                  | Ordering within a deliverable (default 0)                  |
| created_at | timestamptz          | Defaults to `now()`                                        |

Index: `(task_id, sort_order)` for the per-deliverable ordered fetch.

RLS: any authenticated user can `select` (step visibility follows task visibility, which the contractor index filters server-side); only `profiles.is_admin = true` can `insert` / `update` / `delete`. The contractor's `pending → in_review` advance is NOT a client write — it goes through the API route on the service role (guarded in code), so no assignee UPDATE policy is granted.

---

## Enum Types (dropdowns in Table Editor)

| Enum                | Values                                                                       |
|---------------------|------------------------------------------------------------------------------|
| department          | Coding, Visual Art, UI/UX, Animation, Asset Creation                         |
| task_status         | Backlog, Todo, In Progress, In Review, Done, Canceled, Duplicate             |
| task_activity_kind  | created, status_changed, assignee_changed, milestone_linked, milestone_unlinked, progress_changed |
| priority            | High, Medium, Low                                                            |
| area_status         | Active, Planned, Complete                                                    |
| area_phase          | Alpha, Beta, Launch                                                          |
| payment_status      | pending, paid, cancelled                                                     |
| note_status         | open, archived                                                               |
| note_source         | web, telegram                                                                |
| task_step_state     | pending, in_review, done                                                     |

---

## Content Hierarchy

```
Supabase (seeko-studio project)
├── tasks          ← area_id → areas, assignee_id → profiles
│   └── task_steps ← task_id → tasks (admin-authored deliverable breadcrumbs)
├── areas          ← Main Game, Fighting Club
├── profiles       ← auto-created from auth.users (= team roster)
├── payments       ← recipient_id → profiles, created_by → profiles
│   └── payment_items ← task_id → tasks (optional)
├── passkey_credentials ← user_id → profiles (WebAuthn devices for /payments gate)
├── passkey_challenges  ← user_id → profiles (short-lived ceremony challenges)
├── notes          ← created_by → profiles, converted_to_task_id → tasks (Studio Agents inbox)
└── docs           ← self-referencing tree (parent_id)
    ├── Game Design Doc
    └── Onboarding
```

---

## Task Taxonomy

**Departments:** Coding · Visual Art · UI/UX · Animation · Asset Creation
**Statuses:** Backlog · Todo · In Progress · In Review · Done · Canceled · Duplicate
**Priorities:** High · Medium · Low
**Game Areas:** Main Game · Fighting Club

---

## Data Access

All queries go through `src/lib/supabase/data.ts`:

```ts
import { fetchTasks, fetchAreas, fetchTeam, fetchDocs } from '@/lib/supabase/data';

const tasks = await fetchTasks(userId);   // optional assignee filter
const areas = await fetchAreas();
const team  = await fetchTeam();          // queries profiles table
const docs  = await fetchDocs(parentId);  // optional parent filter, null = top-level
```

---

## RLS Policies

- `profiles`: any authenticated user can read all profiles (needed for team page)
- `tasks`, `areas`, `docs`: any authenticated user can read
- `passkey_credentials`: owner can `select` and `delete`; inserts/updates only via service role
- `passkey_challenges`: RLS enabled, no client policies — service-role only
- `notes`: admin-only select/insert/update; service role bypasses for the Telegram bot.
- `task_steps`: any authenticated user can `select`; admin-only `insert`/`update`/`delete`. Contractor advance (`pending → in_review`) via the service-role API route, not a client write.

Doc visibility is enforced in app logic: a doc is locked for a user unless they are admin, their department is in `restricted_department`, or their user id is in `granted_user_ids` (granted access despite department restriction).

Full schema: `docs/supabase-schema.sql`

---

## Skill Routing Reminders

- Before any schema change: review `docs/supabase-schema.sql` first
- After schema changes: update this file AND `src/lib/types.ts` to stay in sync
- Trigger maintenance agent when schema changes significantly
