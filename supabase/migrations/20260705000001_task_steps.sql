-- Admin-authored deliverable sub-steps ("breadcrumbs") for the contractor portal.
-- Stored enum is tiny; the situational active/missed render states are DERIVED
-- at render time (see src/lib/contractor-steps.ts), never stored.

create type public.task_step_state as enum ('pending', 'in_review', 'done');

create table public.task_steps (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  name        text not null,
  deadline    date,                                   -- nullable ("No deadline")
  state       public.task_step_state not null default 'pending',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index task_steps_task_idx on public.task_steps (task_id, sort_order);

alter table public.task_steps enable row level security;

-- SELECT: any authenticated user. The contractor index already filters to the
-- caller's own tasks server-side; step visibility follows task visibility.
create policy "task_steps_select_authenticated"
  on public.task_steps for select
  to authenticated
  using (true);

-- INSERT / UPDATE / DELETE: admin only. The contractor's pending -> in_review
-- advance goes through the API route on the service role (guarded in code), NOT
-- a client-side write, so no assignee UPDATE policy is granted here.
create policy "task_steps_write_admin"
  on public.task_steps for all
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true)
  with check ((select is_admin from public.profiles where id = auth.uid()) = true);

comment on table public.task_steps is 'Admin-authored deliverable breadcrumb steps; contractor advance (pending -> in_review) via service-role API route.';
