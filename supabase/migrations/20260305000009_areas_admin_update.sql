-- ─── Areas: allow admins to update ───────────────────────────────────────────
-- Admins can update game area progress, phase, status, description from the dashboard.

create policy "Admins can update areas"
  on public.areas for update
  using ((select is_admin from public.profiles where id = auth.uid()) = true)
  with check ((select is_admin from public.profiles where id = auth.uid()) = true);
