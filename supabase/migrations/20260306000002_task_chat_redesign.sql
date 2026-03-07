-- Add reply threading to task_comments
alter table public.task_comments
  add column reply_to_id uuid references public.task_comments(id) on delete set null;

-- Reactions on comments
create table public.task_comment_reactions (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.task_comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz default now(),
  unique (comment_id, user_id, emoji)
);

create index task_comment_reactions_comment_id_idx on public.task_comment_reactions(comment_id);

alter table public.task_comment_reactions enable row level security;

create policy "Authenticated can read comment reactions"
  on public.task_comment_reactions for select
  to authenticated
  using (true);

create policy "Authenticated can insert own reactions"
  on public.task_comment_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own reactions"
  on public.task_comment_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

-- File attachments on comments
create table public.task_comment_attachments (
  id           uuid primary key default gen_random_uuid(),
  comment_id   uuid not null references public.task_comments(id) on delete cascade,
  file_url     text not null,
  file_name    text not null,
  file_type    text not null default 'application/octet-stream',
  file_size    int not null default 0,
  storage_path text not null,
  created_at   timestamptz default now()
);

create index task_comment_attachments_comment_id_idx on public.task_comment_attachments(comment_id);

alter table public.task_comment_attachments enable row level security;

create policy "Authenticated can read comment attachments"
  on public.task_comment_attachments for select
  to authenticated
  using (true);

create policy "Authenticated can insert comment attachments"
  on public.task_comment_attachments for insert
  to authenticated
  with check (true);

-- Storage bucket for chat attachments
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

create policy "Authenticated can upload chat attachments"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-attachments');

create policy "Authenticated can read chat attachments"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'chat-attachments');
