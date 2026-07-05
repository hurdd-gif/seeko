create table if not exists public.agent_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'eko', 'action')),
  text text not null check (char_length(text) <= 2000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_chat_messages_user_created_idx
  on public.agent_chat_messages (user_id, created_at desc);

alter table public.agent_chat_messages enable row level security;

drop policy if exists "Users can read their own EKO chat history" on public.agent_chat_messages;
create policy "Users can read their own EKO chat history"
  on public.agent_chat_messages
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can write their own EKO chat history" on public.agent_chat_messages;
create policy "Users can write their own EKO chat history"
  on public.agent_chat_messages
  for insert
  to authenticated
  with check (auth.uid() = user_id);
