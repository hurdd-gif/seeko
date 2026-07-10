-- Tasks: retire staff-direct writes → API-only (service-role) writes.
--
-- STAGED — DO NOT APPLY UNTIL THIS BRANCH (codex/eko-agent-current) IS DEPLOYED
-- TO PRODUCTION. Production `main` still writes to public.tasks directly from the
-- browser; dropping the authenticated write policies before the API-only write
-- path ships (POST /api/tasks via the service-role tasks-repo) would break task
-- creation for the live app. Apply this immediately AFTER this branch deploys.
--
-- Builds on 20260710193947_tasks_staff_rls (Phase A, applied live 2026-07-10),
-- which scoped tasks SELECT/INSERT/UPDATE to staff (is_staff_for_rls = admin OR
-- non-investor). This removes the staff INSERT/UPDATE policies so the only
-- remaining writers are service-role callers (which bypass RLS). Staff SELECT is
-- intentionally KEPT — the tasks board realtime subscription runs as the
-- authenticated user and needs read access; realtime only delivers rows the
-- subscriber's SELECT policy admits.

drop policy if exists "Staff can insert tasks" on public.tasks;
drop policy if exists "Staff can update tasks" on public.tasks;

-- After this migration, public.tasks has exactly:
--   SELECT  "Staff can read tasks"        (is_staff_for_rls; realtime + reads)
--   DELETE  "Only admins can delete tasks"
-- INSERT/UPDATE have no authenticated policy → writes are service-role/API-only.
