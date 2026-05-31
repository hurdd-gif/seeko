-- Notes: studio inbox for the Quick Note composer and Telegram bot.

create type public.note_status as enum ('open', 'archived');
create type public.note_source as enum ('web', 'telegram');

create table public.notes (
  id                   uuid primary key default gen_random_uuid(),
  body                 text not null,
  status               public.note_status not null default 'open',
  source               public.note_source not null default 'web',
  created_by           uuid not null references public.profiles(id) on delete cascade,
  created_at           timestamptz not null default now(),
  converted_to_task_id uuid references public.tasks(id) on delete set null
);

create index notes_status_created_at_idx on public.notes (status, created_at desc);
create index notes_created_by_idx on public.notes (created_by);

alter table public.notes enable row level security;

create policy "notes_admin_select"
  on public.notes for select
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true);

create policy "notes_admin_insert"
  on public.notes for insert
  to authenticated
  with check ((select is_admin from public.profiles where id = auth.uid()) = true);

create policy "notes_admin_update"
  on public.notes for update
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true);

comment on table public.notes is 'Inbox for Studio Agents — admin-only via RLS; Telegram bot writes via service role.';
