-- Close the investor direct-access hole on tasks: scope reads/writes to staff
-- (admin OR non-investor member). Deployed-prod safe: staff behavior unchanged.
-- The full API-only write lockdown is a separate migration staged for deploy time.
--
-- APPLIED TO LIVE 2026-07-10 via MCP apply_migration (version 20260710193947).
-- Live-verified by role simulation: investor sees/updates 0 task rows,
-- staff member sees 13/13 and can update+insert. DO NOT re-apply.

create or replace function public.is_staff_for_rls(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_admin or not coalesce(p.is_investor, false)
    from public.profiles p
    where p.id = p_user_id
  ), false)
$$;

drop policy if exists "Authenticated users can read tasks" on public.tasks;
create policy "Staff can read tasks"
  on public.tasks for select
  using (public.is_staff_for_rls(auth.uid()));

drop policy if exists "Authenticated users can update tasks" on public.tasks;
create policy "Staff can update tasks"
  on public.tasks for update
  using (public.is_staff_for_rls(auth.uid()))
  with check (public.is_staff_for_rls(auth.uid()));

drop policy if exists "Authenticated users can insert tasks" on public.tasks;
create policy "Staff can insert tasks"
  on public.tasks for insert
  with check (public.is_staff_for_rls(auth.uid()));

drop policy if exists "Authenticated users can read task comments" on public.task_comments;
create policy "Staff can read task comments"
  on public.task_comments for select
  using (public.is_staff_for_rls(auth.uid()));
