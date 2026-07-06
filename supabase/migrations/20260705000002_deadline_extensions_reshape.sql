-- Reshape deadline_extensions from the duration model (extra_hours -> computed
-- new_deadline) to a date + reason model (requested_deadline + reason).
-- Authored idempotent: safe on a fresh DB (table absent) AND on the live DB
-- (old-shape table present, deployed out-of-band by the superseded 2026-03-08
-- plan). NOT applied to prod on this branch -- batches with
-- 20260705000001_task_steps.sql on explicit confirmation.

-- 1. Fresh-DB path: create the table in its NEW shape if absent.
create table if not exists public.deadline_extensions (
  id                  uuid primary key default gen_random_uuid(),
  task_id             uuid not null references public.tasks(id) on delete cascade,
  requested_by        uuid not null references public.profiles(id) on delete cascade,
  original_deadline   date not null,
  requested_deadline  date not null,
  reason              text,
  status              text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by          uuid references public.profiles(id),
  decided_at          timestamptz,
  denial_reason       text,
  created_at          timestamptz not null default now()
);

-- 2. Live-DB path: add the new columns if the old-shape table already exists.
alter table public.deadline_extensions add column if not exists requested_deadline date;
alter table public.deadline_extensions add column if not exists reason text;

-- 3. Backfill requested_deadline from the old computed column, then enforce
--    NOT NULL (guarded so it no-ops when already not-null / on a fresh DB).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deadline_extensions' and column_name = 'new_deadline'
  ) then
    update public.deadline_extensions set requested_deadline = new_deadline where requested_deadline is null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deadline_extensions'
      and column_name = 'requested_deadline' and is_nullable = 'YES'
  ) then
    alter table public.deadline_extensions alter column requested_deadline set not null;
  end if;
end $$;

-- 4. Drop the superseded duration columns.
alter table public.deadline_extensions drop column if exists extra_hours;
alter table public.deadline_extensions drop column if exists new_deadline;

-- 5. RLS: owner-or-admin select; NO client insert/update (writes go through the
--    service-role API route, mirroring task_steps).
alter table public.deadline_extensions enable row level security;

drop policy if exists "deadline_extensions_select_owner_or_admin" on public.deadline_extensions;
create policy "deadline_extensions_select_owner_or_admin"
  on public.deadline_extensions for select
  to authenticated
  using (
    auth.uid() = requested_by
    or (select is_admin from public.profiles where id = auth.uid()) = true
  );

-- 6. Fast "does this task have a pending request?" lookup + per-task latest fetch.
create index if not exists deadline_extensions_task_pending_idx
  on public.deadline_extensions (task_id, status)
  where status = 'pending';

comment on table public.deadline_extensions is 'Contractor-requested deadline extensions (date + reason model); admin approve/deny via service-role API route.';
