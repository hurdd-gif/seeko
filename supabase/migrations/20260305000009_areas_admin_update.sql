-- ─── Areas: allow admins to update ───────────────────────────────────────────
-- Admins can update game area progress, phase, status, description from the dashboard.

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'Admins can update areas' and tablename = 'areas'
  ) then
    create policy "Admins can update areas"
      on public.areas for update
      using ((select is_admin from public.profiles where id = auth.uid()) = true)
      with check ((select is_admin from public.profiles where id = auth.uid()) = true);
  end if;
end $$;
