# Contractor Deadline Extension Requests — Design

**Status:** Approved (design phase). Next step: writing-plans → implementation.
**Branch:** `feat/light-theme-migration` (worktree `.worktrees/contractor-portal`)
**Supersedes:** `docs/plans/2026-03-08-deadline-extensions.md` (Next.js/App-Router, `extra_hours` model — pre-migration; retained for history only).

---

## Goal

Let a contractor request a later deadline on one of their deliverables (a `task`) by
picking a target **date** and optionally writing a **reason**; an admin approves or
denies it inline from the migrated task-detail screen; the contractor sees the
outcome inline in their portal (which has no notification bell).

## Why this is mostly a reshape, not a greenfield build

The deadline-extension backend already exists **in the migrated stack and is live**:

- `deadline_extensions` table — present in `docs/supabase-schema.sql:334` and
  `src/lib/supabase/database.types.ts:137`, but with **no migration file** (orphaned;
  deployed out-of-band by the superseded 2026-03-08 plan).
- `POST /api/deadline-extensions` (`src/api-server/routes/workflow.ts:165`) — assignee-guarded
  create, currently computes `new_deadline` from `extra_hours`, blocks duplicate `pending`,
  notifies admins.
- `PATCH /api/deadline-extensions/:id` (`workflow.ts:203`) — `requireAdmin`, writes
  `tasks.deadline` on approve (with rollback), stores `denial_reason` on deny, notifies requester.
- Notification kinds `deadline_extension_requested|_approved|_denied` already in
  `src/lib/notification-kinds.ts` + `src/lib/types.ts`; helpers `notifyAdminsDirect` /
  `notifyUserDirect` in `workflow.ts`.

**Decision (ratified):** reshape this existing backend from the duration model
(`extra_hours` → computed `new_deadline`) to a **date + reason** model. The real new
work is: (1) author the missing/idempotent migration, (2) rewrite the two routes'
payloads/validation, (3) build the contractor-facing request affordance + inline
outcome states, (4) port the admin approve/deny banner into the migrated stack.

**Explicitly out of scope (YAGNI):** email notifications, an extensions list/queue
page, per-*step* extensions (task-level only), editing a pending request (cancel +
re-request instead).

---

## 1. Data model

Reshape `public.deadline_extensions`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `task_id` | uuid **not null** → `tasks(id)` on delete cascade | |
| `requested_by` | uuid **not null** → `profiles(id)` on delete cascade | |
| `original_deadline` | date **not null** | snapshot of `tasks.deadline` at request time |
| `requested_deadline` | date **not null** | date the contractor wants; must be `> original_deadline` |
| `reason` | text **null** | contractor's optional "why" |
| `status` | text **not null** default `'pending'` check `in ('pending','approved','denied')` | |
| `decided_by` | uuid **null** → `profiles(id)` | admin who decided |
| `decided_at` | timestamptz **null** | |
| `denial_reason` | text **null** | admin's reason on deny |
| `created_at` | timestamptz **not null** default `now()` | |

**Removed:** `extra_hours`, `new_deadline` (replaced by `requested_deadline`).

**Index:** partial `(task_id, status) where status = 'pending'` — fast "does this task
already have a pending request?" lookup, and the per-task latest fetch.

**RLS:** enabled. `select` allowed to the owner (`auth.uid() = requested_by`) or any
admin. **No client `insert`/`update` policy** — every write goes through the
service-role API route, matching the `task_steps` decision (contractor writes are
server-guarded, never a raw client mutation).

### Migration (`supabase/migrations/<ts>_deadline_extensions_reshape.sql`)

Authored **idempotent** so it is safe on a fresh DB (table absent) *and* on the live DB
(old-shape table present):

1. `create table if not exists public.deadline_extensions (...)` with the **new** shape.
2. `alter table ... add column if not exists requested_deadline date;`
   `alter table ... add column if not exists reason text;`
3. Backfill for pre-existing rows: `update ... set requested_deadline = new_deadline
   where requested_deadline is null;` then `alter column requested_deadline set not null`
   (guarded so it no-ops when already not-null).
4. `alter table ... drop column if exists extra_hours;`
   `alter table ... drop column if exists new_deadline;`
5. `alter table ... enable row level security;` + the two `select` policies.
6. Create the partial index `if not exists`.

**Not applied to prod in this branch.** Per the prior "Hold — apply later" decision, the
file is authored and committed; it batches with `20260705000001_task_steps.sql` when the
branch ships, on explicit confirmation only.

Also update `docs/supabase-schema.sql` (reshape the block) and regenerate/adjust
`src/lib/supabase/database.types.ts` to the new columns.

---

## 2. API contract (`src/api-server/routes/workflow.ts`)

### `POST /api/deadline-extensions`

- **Body:** `{ taskId: string, requestedDeadline: string (YYYY-MM-DD), reason?: string }`
- **Guards (unchanged):** `requireUser`; fetch task via service role; `403` unless
  `task.assignee_id === user.id`; `400` if `!task.deadline`; `409` if a `pending` row
  already exists for the task.
- **New validation:** `requestedDeadline` matches `^\d{4}-\d{2}-\d{2}$` and is strictly
  `> task.deadline` (ISO date string compare is correct) → else `400`. `reason` trimmed,
  capped (≤ 500 chars), stored `null` when blank.
- **Insert:** `{ task_id, requested_by, original_deadline: task.deadline,
  requested_deadline, reason, status: 'pending' }`.
- **Side effects:** `activity_log` row `'Requested extension'`; `notifyAdminsDirect(
  'deadline_extension_requested', 'Extension requested on "<task>"', '<requested date> —
  <reason snippet>', '/tasks/<taskId>')` (link retargeted to the migrated `/tasks/:id`).
- **Returns:** `{ success: true, extension: { id, requested_deadline, reason, status } }`.

### `PATCH /api/deadline-extensions/:id`

- **Guard:** `requireAdmin`.
- **Body:** `{ action: 'approve' | 'deny', reason?: string }` (`reason` = denial reason).
- Fetch the row (must be `status === 'pending'` → else `409`).
- **approve:** set `status='approved', decided_by, decided_at`; then
  `update tasks set deadline = requested_deadline` — keep the existing rollback: if the
  task update fails, revert the row to `pending` and return `500`.
- **deny:** set `status='denied', decided_by, decided_at, denial_reason = reason || null`.
- **Side effects:** `activity_log` (`'Approved extension'` / `'Denied extension'`);
  `notifyUserDirect(requested_by, 'deadline_extension_approved'|'_denied', title,
  body, '/tasks/<taskId>')`.
- **Returns:** `{ success: true, status }`.

---

## 3. Contractor portal UX (the new surface)

**Threading:** `contractor.tsx → StepDeliverableTimeline → DeliverableSteps` currently
drops the task-level `deadline`. Thread `deadline` **and** `taskId` (= `d.id`) down to the
deliverable heading. Add `latestExtension` to `ContractorDeliverable` in
`src/lib/contractor-index.ts` — the newest `deadline_extensions` row for the task
(`{ id, status, requested_deadline, reason, denial_reason } | null`), fetched server-side
within the existing assignee-scoped query.

**On each _active_ (non-Done) deliverable with a deadline, at the heading:**

| `latestExtension` state | Rendered affordance |
|---|---|
| none, or last was `approved` (superseded) | quiet **"Request more time"** button → inline form: date picker (constrained `> current deadline`) + optional reason textarea → `POST` → optimistic **pending** |
| `pending` | amber **"Extension requested — pending"** pill with the requested date; request button suppressed |
| `denied` (latest) | subtle **"Extension denied"** note + `denial_reason` (if any) + **"Request again"** button |
| `approved` | no banner — the deadline now simply reads the new date (that *is* the outcome signal) |

**Outcome visibility:** the portal has **no notification bell**, so these inline states
are the contractor's only outcome surface. Approve is self-evident (deadline changed);
deny must be shown explicitly.

**Denial persistence (design decision):** a denial persists inline until the contractor
dismisses it or submits a new request. Driven purely by "latest row, `status='denied'`" —
**no `acknowledged` column**. (Open to an auto-clear-after-N-days variant later; not built now.)

**Craft:** implementation runs the mandated design loop on the request form + state pills
— Mobbin references → `/interface-craft` + `/make-interfaces-feel-better` critique
**before and after**. Reduced-motion respected; date picker constrained, not free-typed.

---

## 4. Admin decision UX

Port the legacy banner (`src/components/dashboard/TaskDetail.tsx:770`) into the migrated
`src/components/dashboard/tasks/TaskDetailPage.tsx`. The task-detail data path
(`GET /api/task-detail/:id`) gains the task's `pending` extension (requester display name +
`original_deadline`, `requested_deadline`, `reason`). When `isAdmin` and a pending request
exists, render a top banner:

> **{requester}** requested an extension · **{original} → {requested}** · "{reason}"
> [ Approve ]  [ Deny ]

Deny reveals an optional reason field then a confirm. Approve → `PATCH approve` → deadline
updates, banner clears. Contractors never see the dashboard, so this is the admin-only
action surface.

---

## 5. Error handling

- **API:** all failure branches return typed JSON + status (`400/403/404/409/500`) as
  above; approve is atomic-ish via the existing revert-on-task-update-failure guard.
- **Contractor form:** disable submit while in flight; surface the API error message
  (e.g. duplicate-pending `409`) inline; date picker prevents `≤ current deadline`
  selection client-side, server re-validates.
- **States never blank:** pending/denied/approved each have an explicit render; a task with
  no deadline shows no affordance (can't extend what has no deadline).

---

## 6. Testing (TDD)

**API (`src/api-server/routes/__tests__/`)** — mirror `task-steps-advance.test.ts` harness
(`vi.mock('@/lib/supabase/service')`, `new Hono().route('/api', createWorkflowRoutes(...))`):

- POST: happy path (inserts `pending`, snapshots `original_deadline`); `403` non-assignee;
  `400` task has no deadline; `400` malformed date; `400` date not after deadline; `409`
  duplicate pending; reason optional (null when blank) and capped.
- PATCH: approve writes `tasks.deadline = requested_deadline`; deny stores `denial_reason`;
  `403` non-admin; `409` already decided; rollback path when the task update fails.

**Data (`contractor-index`)** — `latestExtension` populated with the newest row per task;
`null` when none.

**Contractor route (RTL, `contractor.test.tsx` pattern)** — pending pill renders with the
requested date; denied note renders with reason + "Request again"; request affordance
renders on an active deliverable with a deadline and is absent without one.

**Admin banner (RTL)** — renders requester + date range + reason; Approve/Deny present;
deny reveals the reason field.

---

## 7. File touch list (for writing-plans)

- **Migration:** `supabase/migrations/<ts>_deadline_extensions_reshape.sql` (new)
- **Schema docs:** `docs/supabase-schema.sql` (reshape block), `docs/personas/ia.md` (table entry)
- **Types:** `src/lib/supabase/database.types.ts`, `src/lib/types.ts` (`DeadlineExtension`)
- **API:** `src/api-server/routes/workflow.ts` (both routes) + tests
- **Contractor data:** `src/lib/contractor-index.ts`, `src/lib/contractor-steps.ts` (thread `deadline`/`taskId`)
- **Contractor UI:** `StepDeliverableTimeline.tsx`, `DeliverableSteps.tsx`, new request-form + state components + tests; QA seed `contractor-qa.tsx`
- **Admin UI:** `src/api-server/routes/dashboard.ts` (task-detail payload), `TaskDetailPage.tsx` + test
- **Memory housekeeping:** update `deadline-extension-requests.md` (date+reason model ratified) and `contractor-deliverable-steps-model.md` (Phase 3 done)
