-- Task deliverables: files uploaded when completing a task. Visible only to admins.
create table public.task_deliverables (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  file_name   text not null,
  storage_path text not null,
  uploaded_by uuid not null references public.profiles(id) on delete set null,
  created_at  timestamptz default now()
);

create index task_deliverables_task_id_idx on public.task_deliverables(task_id);

alter table public.task_deliverables enable row level security;

-- Assignees (and admins via app) insert when completing a task; only admins can read.
create policy "Authenticated can insert own task deliverables"
  on public.task_deliverables for insert
  to authenticated
  with check (auth.uid() = uploaded_by);

create policy "Admins can read all task deliverables"
  on public.task_deliverables for select
  to authenticated
  using (
    (select is_admin from public.profiles where id = auth.uid())
  );

comment on table public.task_deliverables is 'Files uploaded on task completion; visible only to admins in the Deliverables tab.';

-- Storage bucket for deliverable files (private; URLs via signed or service role).
insert into storage.buckets (id, name, public)
values ('task-deliverables', 'task-deliverables', false)
on conflict (id) do nothing;

-- Authenticated users can upload (app validates assignee or admin).
create policy "Authenticated can upload task deliverables"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'task-deliverables');

-- Only admins can read objects in task-deliverables bucket.
create policy "Admins can read task deliverables bucket"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'task-deliverables'
    and (select is_admin from public.profiles where id = auth.uid())
  );
