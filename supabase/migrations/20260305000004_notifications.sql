-- ─── Notifications ────────────────────────────────────────────────────────────
-- Inbox for task_assigned, task_completed, deliverable_uploaded, mentioned,
-- comment_reply events. Inserted server-side via service role; read by owner.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  link       text,
  read       boolean not null default false,
  created_at timestamptz default now()
);

alter table public.notifications enable row level security;

-- Users can read their own notifications
create policy "Users can read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

-- Users can mark their own notifications as read
create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Enable Supabase Realtime so the bell updates instantly
alter publication supabase_realtime add table public.notifications;
