# Tasks RLS Re-hardening Plan

**Goal:** Close the investor direct-DB access hole on `tasks`/`task_comments`, then complete an API-only write posture, without breaking the currently-deployed (main) app.

**Origin:** Follow-ups #1/#10 of the 2026-07-09 architecture-deepening series. Verified live 2026-07-10: an investor session could SELECT all 13 tasks and UPDATE them; the `20260619` hardening migration was never applied (function absent live).

**User decisions (2026-07-10):** read rule = staff only (`is_admin OR NOT is_investor`); write rule = API-only; fold in the empty-endpoint fix, task_comments tightening, and retire the stale `20260619` file.

## Phase A — LIVE NOW (applied)

`supabase/migrations/20260710193947_tasks_staff_rls.sql` — **APPLIED to live 2026-07-10** (version 20260710193947). Adds `is_staff_for_rls(uuid)`; scopes `tasks` SELECT/UPDATE/INSERT and `task_comments` SELECT to staff. Deployed-prod safe: staff keep full access, only investors lose direct access. Live-verified by role simulation (investor: 0 rows read/updated; staff member: 13 read, update+insert ok). **DO NOT re-apply.**

## Phase B — BRANCH CODE, applied to live at DEPLOY time

Depends on this branch (`task-store`/`tasks-repo` API-only writes) reaching production first.

### B1 — Last direct browser task write → API
`src/lib/dashboard-actions.ts` `createTask` becomes a thin wrapper over `task-store.createTask` (POST `/api/tasks`, service-role `tasks-repo`). Drops the direct `supabase.from('tasks').insert()` and the client `is_admin` pre-check (create dialogs remain admin-gated in the UI; POST `/api/tasks` keeps the standing any-authenticated-create rule). Contract preserved: returns the created `Task`, throws on failure — the three dialogs (`CreateTaskModal`, `QuickCreateMorph`, `CreateTaskComposer`) call `const created = await createTask(...)` → `issueCreatedToast(created)` unchanged. `CreateTaskModal.test.tsx` mocks the module, so it stays green.

### B2 — Fix silently-empty server reads
`src/lib/supabase/server.ts` `createClient()` switches from the anon key to `SUPABASE_SERVICE_ROLE_KEY`. It is imported only by `data.ts`, which is server-only (api-server routes; `RecentItemsRow` imports a type only). Fixes `GET /tasks/:id/rail` (milestones/activity) and `GET /investor/export-summary`, both of which return empty today because the session-less anon client is filtered by RLS. All `data.ts` readers that need per-user scoping already pass an explicit id, so service-role is correct.

### B3 — API-only write migration (staged) + doc truth
- New migration `supabase/migrations/<ts>_tasks_api_only_writes.sql`: DROP `"Staff can insert tasks"` + `"Staff can update tasks"` (all task writes become service-role/API-only). KEEP `"Staff can read tasks"` — the `tasks` realtime board subscription runs as the authenticated user and needs SELECT. **NOT applied to live until deploy** (current main-production staff still write directly).
- `docs/supabase-schema.sql`: tasks + task_comments policy blocks → the live staff wording (Phase A), with a dated NOTE that the api-only write drop is deploy-staged.
- Retire `supabase/migrations/20260619000001_harden_rls_for_docs_tasks_attachments.sql`: it was never applied and encodes a different (assignee-only) rule — add a superseded header or remove, so a future `db push` can't apply it cold.
- `src/lib/__tests__/rls-policies.test.ts`: re-pin the tasks/comments doc assertions to the staff wording.
- Update `CONTEXT.md` (tasks-repo seam note) + memory.

## Sequencing constraint
Phase A is live. Phase B ships as code; its migration (`_tasks_api_only_writes`) must be applied **only after** this branch is deployed to production. `db push` at deploy applies it in order.
