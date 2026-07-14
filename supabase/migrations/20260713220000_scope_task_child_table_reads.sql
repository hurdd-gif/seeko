-- Scope child-table SELECT policies to the SAME predicate as their parent,
-- closing investor read holes. Two parents, four child tables, one bucket:
--   parent `tasks`         → task_steps, task_links
--   parent `task_comments` → task_comment_attachments, task_comment_reactions
--   storage bucket         → chat-attachments (defense in depth)
-- Both parents were narrowed to staff-only (`public.is_staff_for_rls(auth.uid())`
-- = `is_admin OR NOT is_investor`) in 20260710193947_tasks_staff_rls.sql to keep
-- INVESTORS out. Each child below shipped a `using (true)` SELECT — world-readable
-- to EVERY authenticated user — so an investor blocked from the parent could still
-- read the children directly over PostgREST with their own JWT.
--
-- ROW-vs-PARENT CONSISTENCY: a child row's visibility must never exceed its
-- parent's. We reuse the SAME function the parents use, so every table stays in
-- lockstep: investors excluded, while staff/clients/contractors (all
-- `is_investor = false`) keep read access exactly as they do on the parent.
--
-- STAGED FOR DEPLOY — NOT applied live from this session.

-- ── parent: tasks ────────────────────────────────────────────────────────────
-- task_steps (20260705000001) and task_links (20260713120000) each shipped a
-- SELECT policy of `using (true)`. An investor blocked from `tasks` could still
-- `GET /rest/v1/task_steps?select=*` and `GET /rest/v1/task_links?select=*` to
-- read every deliverable step plus the entire task-link graph.
--
-- NO UI IMPACT: the app never reads either table from the browser. task_steps is
-- read server-side by loadContractorOverview (src/lib/contractor-index.ts) and
-- task_links by fetchTaskLinks (src/lib/tasks-board.ts), both through the
-- service-role client (src/lib/supabase/service.ts), which BYPASSES RLS. The
-- browser's only task_links access is writes via POST/DELETE
-- /api/tasks/:taskId/links (service-role routes). Investors never read these
-- tables directly: loadTasksBoard / loadTaskDetailFull reject investors with
-- `investor_forbidden`, and the investor surfaces touch neither table.

drop policy if exists "task_steps_select_authenticated" on public.task_steps;
create policy "task_steps_select_authenticated"
  on public.task_steps for select
  to authenticated
  using (public.is_staff_for_rls(auth.uid()));

drop policy if exists "task_links_select_authenticated" on public.task_links;
create policy "task_links_select_authenticated"
  on public.task_links for select
  to authenticated
  using (public.is_staff_for_rls(auth.uid()));

-- ── parent: task_comments ───────────────────────────────────────────────────
-- task_comment_attachments and task_comment_reactions
-- (20260306000002_task_chat_redesign.sql) each shipped `to authenticated using
-- (true)`. 20260713190000_lock_down_client_authz_writes.sql revoked their client
-- WRITES but deliberately LEFT the SELECT open, reasoning that "comments are
-- already readable by every authenticated user" — a premise 20260710193947 (three
-- days earlier, same branch) had already falsified by scoping task_comments to
-- staff. Net effect: an investor blocked from `task_comments` can still
-- `GET /rest/v1/task_comment_attachments?select=*` to read every attachment row —
-- including the stored signed file_url, which downloads the file irrespective of
-- storage RLS — and `task_comment_reactions` to see who reacted to which internal
-- comment.
--
-- CLIENT READ PATH: unlike task_steps/task_links, these two ARE read from the
-- browser — but ONLY as a nested join under task_comments in
-- TaskActivityThread.tsx (createClient() = user JWT). PostgREST applies RLS to the
-- parent first, so an investor already resolves zero comment rows and never reaches
-- the children, while every legitimate reader keeps is_staff_for_rls = true. So
-- this is the same no-regression, no-deploy-race change as the tasks block above
-- and may be applied at any time. Recreated under the ORIGINAL policy names so the
-- drop replaces the permissive policy rather than leaving it to OR back in.

drop policy if exists "Authenticated can read comment attachments" on public.task_comment_attachments;
create policy "Authenticated can read comment attachments"
  on public.task_comment_attachments for select
  to authenticated
  using (public.is_staff_for_rls(auth.uid()));

drop policy if exists "Authenticated can read comment reactions" on public.task_comment_reactions;
create policy "Authenticated can read comment reactions"
  on public.task_comment_reactions for select
  to authenticated
  using (public.is_staff_for_rls(auth.uid()));

-- ── storage bucket: chat-attachments (defense in depth) ─────────────────────
-- The app serves attachments through server-minted signed URLs
-- (service.storage.from('chat-attachments').createSignedUrl in
-- src/api-server/routes/tasks.ts), so the browser never needs the bucket's
-- authenticated-read policy. Narrow it to staff too: an investor who somehow
-- learns a storage_path cannot then pull the object with a raw authenticated read.
-- Signed URLs bypass RLS and keep working; only unsigned direct reads are gated.
-- (Already-minted signed URLs remain valid until expiry — RLS cannot revoke them;
-- the primary fix is the metadata lockdown above, which stops new enumeration.)

drop policy if exists "Authenticated can read chat attachments" on storage.objects;
create policy "Authenticated can read chat attachments"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'chat-attachments' and public.is_staff_for_rls(auth.uid()));
