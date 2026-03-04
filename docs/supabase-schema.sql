-- Run in Supabase SQL Editor after creating your project
-- Extends auth.users (created automatically by Supabase Auth)

create table public.profiles (
  id                   uuid references auth.users primary key,
  notion_assignee_name text not null,   -- matches "Assignee" name in Notion Tasks DB
  display_name         text,
  department           text,
  role                 text,
  created_at           timestamptz default now()
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Users can only read their own profile
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, notion_assignee_name, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'notion_assignee_name', new.email),
    coalesce(new.raw_user_meta_data->>'display_name', new.email)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
