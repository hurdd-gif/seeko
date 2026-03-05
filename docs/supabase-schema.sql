-- Run in Supabase SQL Editor after creating your project
-- Extends auth.users (created automatically by Supabase Auth)

-- ─── Profiles ─────────────────────────────────────────────────────────────────

create type public.department as enum ('Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation');

create table public.profiles (
  id           uuid references auth.users primary key,
  display_name text,
  department   public.department,
  role         text,
  avatar_url   text,
  onboarded    smallint not null default 0,
  created_at   timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Authenticated users can read all profiles"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, onboarded)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email),
    0
  );
  return new;
end;
$$ language plpgsql security definer set search_path = '';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Areas ────────────────────────────────────────────────────────────────────

create type public.area_status as enum ('Active', 'Planned', 'Complete');
create type public.area_phase as enum ('Alpha', 'Beta', 'Launch');

create table public.areas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  status      public.area_status default 'Active',
  progress    int  default 0,
  description text,
  phase       public.area_phase,
  created_at  timestamptz default now()
);

alter table public.areas enable row level security;

create policy "Authenticated users can read areas"
  on public.areas for select
  using (auth.role() = 'authenticated');

-- ─── Tasks ────────────────────────────────────────────────────────────────────

create type public.task_status as enum ('Complete', 'In Progress', 'In Review', 'Blocked');
create type public.priority as enum ('High', 'Medium', 'Low');

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  department  public.department,
  status      public.task_status default 'In Progress',
  priority    public.priority default 'Medium',
  area_id     uuid references public.areas(id),
  assignee_id uuid references public.profiles(id),
  deadline    date,
  description text,
  created_at  timestamptz default now()
);

alter table public.tasks enable row level security;

create policy "Authenticated users can read tasks"
  on public.tasks for select
  using (auth.role() = 'authenticated');

-- ─── Task Deliverables ────────────────────────────────────────────────────────
-- Files uploaded when completing a task. Visible only to admins (Deliverables tab).
-- See migration 20260305000002_task_deliverables.sql for table + storage bucket.

-- ─── Docs ─────────────────────────────────────────────────────────────────────

create table public.docs (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  content    text,
  parent_id  uuid references public.docs(id),
  sort_order int default 0,
  granted_user_ids uuid[] default null,  -- allow specific users when doc is department-restricted
  created_at timestamptz default now()
);

alter table public.docs enable row level security;

create policy "Authenticated users can read docs"
  on public.docs for select
  using (auth.role() = 'authenticated');

-- ─── Activity Log ─────────────────────────────────────────────────────────────

create table public.activity_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id),
  action     text not null,
  target     text not null,
  created_at timestamptz default now()
);

alter table public.activity_log enable row level security;

create policy "Authenticated users can read activity"
  on public.activity_log for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert activity"
  on public.activity_log for insert
  with check (auth.role() = 'authenticated');

-- ─── Storage: Avatars Bucket ──────────────────────────────────────────────────

-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
-- Policies: anyone can read, authenticated can upload, users can update own avatar

-- ─── Pending Invites ──────────────────────────────────────────────────────────

create table public.pending_invites (
  email        text primary key,
  department   text,
  is_contractor boolean not null default false,
  created_at   timestamptz default now()
);

alter table public.pending_invites enable row level security;
-- Service role only — no authenticated user policies needed
