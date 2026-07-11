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
Phase A is live. Phase B ships as code; its migration (`_tasks_api_only_writes`) must be applied **only after** this branch is deployed to production. NOTE: this DB has no automated `db push` — only `20260710193947` is in `schema_migrations` though later migrations are known-applied — so migrations are applied MANUALLY (dashboard/MCP). Apply `20260710200000_tasks_api_only_writes` by hand immediately after deploy.

## Status — COMPLETE (2026-07-10, committed `4eddbc3`, pushed)
- **Phase A** applied live (`20260710193947`), investor-lockout verified.
- **Phase B** B1/B2/B3 done TDD; gate: 662 passing / 7 pre-existing baseline UI failures (0 new) · tsc pre-existing noise only · vite build green. Independent opus review = APPROVE. Committed `4eddbc3`, pushed to origin. Staged only the 11 Phase-B files (parallel uncommitted work — legal.tsx/scroll-glide/auth-method-memory/LoginForm — deliberately excluded).
- **Deploy-time actions (2026-07-10):** (1) api-server RESTARTED on 8788 → B2 service-role read fix now active. (2) `20260710200000_tasks_api_only_writes` **HELD until deploy (user decision)** — verified `origin/main` writes tasks directly from the browser (TaskDetail/TaskList/InvestorAreaCard, 10+ sites) with no `/api/tasks` door, so applying now would break staff task edits in prod. Apply by hand ONLY after this branch deploys.
- **Open follow-up (flagged to user, not changed):** `POST/PATCH /api/tasks` admit any authenticated user → investors retain an API task-write path (user-decided any-auth contract). Accept-or-tighten (`requireStaffVia`) is a user call. Separate doc drift (#10): milestones/docs/activity schema-doc policies still show non-live `can_read_*_for_rls` hardened wording.
