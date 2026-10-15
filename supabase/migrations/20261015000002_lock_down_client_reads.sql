-- Close direct PostgREST reads that bypassed the API's role filtering. Every
-- server loader reads with the service role (unaffected by these grants and
-- policies); the browser only reads profiles(id, display_name, avatar_url).

-- 1. profiles: personal columns are no longer readable by clients. Column
--    grants replace the table-wide SELECT; the PII columns stay service-only.
revoke select on public.profiles from anon, authenticated;
grant select (
  id, display_name, department, role, created_at, onboarded, avatar_url,
  tour_completed, is_admin, timezone, is_contractor, last_seen_at,
  must_set_password, is_investor, nda_accepted_at
) on public.profiles to authenticated;

-- 2. docs + activity_log: lock-state and department filtering live in the API
--    (service role). Direct client reads are admin-only.
drop policy if exists "Authenticated users can read docs" on public.docs;
create policy "Admins can read docs" on public.docs
  for select to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true);

drop policy if exists "Authenticated users can read activity" on public.activity_log;
create policy "Admins can read activity" on public.activity_log
  for select to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true);
