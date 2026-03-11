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
  is_admin     boolean not null default false,
  is_contractor boolean not null default false,
  is_investor  boolean not null default false,
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

-- Block privilege escalation: only service role may change is_admin, is_contractor, is_investor.
create or replace function public.profiles_block_privilege_escalation()
returns trigger as $$
begin
  if (old.is_admin is distinct from new.is_admin
      or old.is_contractor is distinct from new.is_contractor
      or old.is_investor is distinct from new.is_investor)
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may update is_admin, is_contractor, is_investor'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

create trigger profiles_block_privilege_escalation_trigger
  before update on public.profiles
  for each row execute procedure public.profiles_block_privilege_escalation();

-- When an invited user signs up, set their profile from pending_invites (match email case-insensitively; delete row after apply).
create or replace function public.handle_new_user()
returns trigger as $$
declare
  inv record;
begin
  select pi.is_investor, pi.is_contractor, pi.department, pi.email
    into inv
    from public.pending_invites pi
    where lower(trim(pi.email)) = lower(trim(new.email))
    limit 1;

  insert into public.profiles (id, display_name, onboarded, is_investor, is_contractor, department)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email),
    0,
    coalesce(inv.is_investor, false),
    coalesce(inv.is_contractor, false),
    (inv.department::public.department)
  );

  if found then
    delete from public.pending_invites where email = inv.email;
  end if;

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

create policy "Admins can update areas"
  on public.areas for update
  using ((select is_admin from public.profiles where id = auth.uid()) = true)
  with check ((select is_admin from public.profiles where id = auth.uid()) = true);

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

-- ─── Task Comment Reactions ──────────────────────────────────────────────────

create table public.task_comment_reactions (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.task_comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz default now(),
  unique (comment_id, user_id, emoji)
);

-- ─── Task Comment Attachments ───────────────────────────────────────────────

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

-- ─── Deadline Extensions ──────────────────────────────────────────────────────

create table public.deadline_extensions (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references public.tasks(id) on delete cascade,
  requested_by      uuid not null references public.profiles(id) on delete cascade,
  extra_hours       integer not null,
  original_deadline date not null,
  new_deadline      date not null,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by        uuid references public.profiles(id),
  decided_at        timestamptz,
  denial_reason     text,
  created_at        timestamptz not null default now()
);

-- ─── Storage: Avatars Bucket ──────────────────────────────────────────────────

-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
-- Policies: anyone can read, authenticated can upload, users can update own avatar

-- ─── Pending Invites ──────────────────────────────────────────────────────────

create table public.pending_invites (
  email        text primary key,
  department   text,
  is_contractor boolean not null default false,
  is_investor  boolean not null default false,
  created_at   timestamptz default now()
);

alter table public.pending_invites enable row level security;
-- Service role only — no authenticated user policies needed

-- ─── Payments ───────────────────────────────────────────────────────────────
-- See migration 20260307000001_payment_tracker.sql for full schema.

create type public.payment_status as enum ('pending', 'paid', 'cancelled');

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  amount       decimal not null,
  currency     text not null default 'USD',
  description  text,
  status       public.payment_status not null default 'pending',
  paid_at      timestamptz,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz default now()
);

create table public.payment_items (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  task_id    uuid references public.tasks(id) on delete set null,
  label      text not null,
  amount     decimal not null
);

-- profiles.paypal_email text (nullable)
-- tasks.bounty decimal (nullable)

-- ─── Decks ──────────────────────────────────────────────────────────────────

-- Add type column (doc or deck, default doc so existing rows unaffected)
ALTER TABLE public.docs ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'doc';

-- Add slides column (jsonb array of { url, sort_order })
ALTER TABLE public.docs ADD COLUMN IF NOT EXISTS slides jsonb DEFAULT NULL;

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_docs_type ON public.docs(type);

-- Storage bucket: deck-slides (public read, create manually in Supabase dashboard)
-- Path format: {deck_id}/{slide_number}.webp

-- ─── External Signing Invites — doc sharing columns ─────────────────────────
-- See migration 20260310100000_external_invoice.sql for base table + invoice columns.
-- See migration 20260311100000_external_doc_sharing.sql for doc sharing columns.

ALTER TABLE external_signing_invites
  ADD COLUMN IF NOT EXISTS shared_doc_id uuid REFERENCES docs(id),
  ADD COLUMN IF NOT EXISTS session_token text,
  ADD COLUMN IF NOT EXISTS session_ip text,
  ADD COLUMN IF NOT EXISTS session_user_agent text,
  ADD COLUMN IF NOT EXISTS session_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_count int DEFAULT 0;

-- ─── NDA Agreement columns ──────────────────────────────────────────────────
alter table public.profiles
  add column if not exists nda_accepted_at   timestamptz,
  add column if not exists nda_signer_name   text,
  add column if not exists nda_signer_address text,
  add column if not exists nda_ip            text,
  add column if not exists nda_user_agent    text;
