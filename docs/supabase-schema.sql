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

create or replace function public.is_admin_for_rls(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = p_user_id), false)
$$;

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
  sort_order  int  default 0,
  target_date date,
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

-- task_status expanded to Linear-7 in migration 20260519000001
-- (Complete → Done, Blocked → Backlog; use Canceled for permanent stops).
create type public.task_status as enum (
  'Backlog', 'Todo', 'In Progress', 'In Review', 'Done', 'Canceled', 'Duplicate'
);
create type public.priority as enum ('High', 'Medium', 'Low');
create type public.task_activity_kind as enum (
  'created', 'status_changed', 'assignee_changed',
  'milestone_linked', 'milestone_unlinked', 'progress_changed'
);

create sequence public.task_number_seq;

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  department  public.department,
  status      public.task_status not null default 'Backlog',
  priority    public.priority default 'Medium',
  area_id     uuid references public.areas(id),
  assignee_id uuid references public.profiles(id),
  deadline    date,
  description text,
  bounty      numeric,
  task_number bigint not null default nextval('public.task_number_seq'),
  progress    smallint not null default 0 check (progress between 0 and 100),
  created_at  timestamptz default now(),
  updated_at  timestamptz not null default now()
);

create unique index tasks_task_number_idx on public.tasks (task_number);

-- Milestones (schema only this round; CRUD UI is a follow-up)
create table public.milestones (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  target_date date,
  area_id     uuid references public.areas(id) on delete set null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.task_milestone (
  task_id      uuid not null references public.tasks(id) on delete cascade,
  milestone_id uuid not null references public.milestones(id) on delete cascade,
  primary key (task_id, milestone_id)
);

alter table public.milestones      enable row level security;
alter table public.task_milestone  enable row level security;
-- Read: any authenticated; Modify: admins only.

-- activity_log was extended in 20260519000001:
--   added columns: kind (task_activity_kind, nullable), before_value (jsonb), after_value (jsonb)
--   index: activity_log_task_id_created_at_idx (task_id, created_at DESC) WHERE task_id IS NOT NULL
-- AFTER INSERT/UPDATE/DELETE triggers on tasks and task_milestone write typed rows.
-- activity_log was extended again in 20260704140000:
--   added column: source text NOT NULL DEFAULT 'human' CHECK (source IN ('human','eko'))
--   'eko' marks rows EKO's write executors created; the feed renders EKO's own
--   badge/name for those instead of the admin who ran the agent. Trigger-written
--   rows keep the 'human' default.

alter table public.tasks enable row level security;

create or replace function public.can_read_task_for_rls(p_task_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin_for_rls(p_user_id)
    or coalesce((select t.assignee_id = p_user_id from public.tasks t where t.id = p_task_id), false)
$$;

create policy "Authorized users can read tasks"
  on public.tasks for select
  using (public.can_read_task_for_rls(id, auth.uid()));

create policy "Authorized users can read task_milestone"
  on public.task_milestone for select
  using (public.can_read_task_for_rls(task_id, auth.uid()));

create policy "Authorized users can read milestones"
  on public.milestones for select
  using (
    public.is_admin_for_rls(auth.uid())
    or exists (
      select 1
      from public.task_milestone tm
      where tm.milestone_id = milestones.id
        and public.can_read_task_for_rls(tm.task_id, auth.uid())
    )
  );

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
  restricted_department text[] default null,
  granted_user_ids uuid[] default null,  -- allow specific users when doc is department-restricted
  created_at timestamptz default now()
);

alter table public.docs enable row level security;

create or replace function public.can_read_doc_for_rls(
  p_restricted_departments text[],
  p_granted_user_ids uuid[],
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin_for_rls(p_user_id)
    or coalesce(cardinality(p_restricted_departments), 0) = 0
    or p_user_id = any(coalesce(p_granted_user_ids, array[]::uuid[]))
    or exists (
      select 1
      from public.profiles p
      where p.id = p_user_id
        and p.department::text = any(coalesce(p_restricted_departments, array[]::text[]))
    )
$$;

create or replace function public.can_read_doc_id_for_rls(p_doc_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.can_read_doc_for_rls(d.restricted_department, d.granted_user_ids, p_user_id)
    from public.docs d
    where d.id = p_doc_id
  ), false)
$$;

create policy "Authorized users can read docs"
  on public.docs for select
  using (public.can_read_doc_for_rls(restricted_department, granted_user_ids, auth.uid()));

-- ─── Activity Log ─────────────────────────────────────────────────────────────

create table public.activity_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id),
  task_id    uuid references public.tasks(id) on delete set null,
  doc_id     uuid references public.docs(id) on delete set null,
  action     text not null,
  target     text not null,
  created_at timestamptz default now()
);

alter table public.activity_log enable row level security;

create policy "Authorized users can read activity"
  on public.activity_log for select
  using (
    public.is_admin_for_rls(auth.uid())
    or user_id = auth.uid()
    or (task_id is not null and public.can_read_task_for_rls(task_id, auth.uid()))
    or (doc_id is not null and public.can_read_doc_id_for_rls(doc_id, auth.uid()))
  );

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
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid references public.profiles(id),  -- null for external payees/invoices (20260310100000)
  recipient_email text,                                 -- external invoice flow (20260310100000)
  payee_name      text,                                 -- manual external payee, e.g. a vendor/subscription (20260703120000)
  amount          decimal not null,
  currency        text not null default 'USD',
  description     text,
  status          public.payment_status not null default 'pending',
  paid_at         timestamptz,
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz default now(),
  -- Identity rules: never both a profile and a payee name; always at least one
  -- of profile / payee name / recipient email.
  constraint payments_payee_not_both check (recipient_id is null or payee_name is null),
  constraint payments_payee_identity check (recipient_id is not null or payee_name is not null or recipient_email is not null)
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

-- ─── Passkey credentials (WebAuthn) ─────────────────────────────────────────
-- See migration 20260510000001_passkey_tables.sql.
create table public.passkey_credentials (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  credential_id   text not null unique,
  public_key      text not null,
  counter         bigint not null default 0,
  transports      text[],
  device_name     text not null,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz
);

create index passkey_credentials_user_id_idx
  on public.passkey_credentials(user_id);

alter table public.passkey_credentials enable row level security;

create policy "own_passkeys_read" on public.passkey_credentials
  for select using (auth.uid() = user_id);

create policy "own_passkeys_delete" on public.passkey_credentials
  for delete using (auth.uid() = user_id);

create table public.passkey_challenges (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  challenge   text not null,
  kind        text not null check (kind in ('register','auth')),
  expires_at  timestamptz not null default (now() + interval '5 minutes'),
  primary key (user_id, kind)
);

alter table public.passkey_challenges enable row level security;

-- ─── Notes (Studio Agents inbox) ────────────────────────────────────────────
-- See migration 20260511000001_notes_table.sql.
-- Inbox surface for the Quick Note composer and the Telegram bot (writes via
-- service role). Admin-only RLS: only admins can see/manage the inbox.

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

-- ─── Task steps (contractor deliverable breadcrumbs) ────────────────────────
-- See migration 20260705000001_task_steps.sql.
-- Admin-authored sub-steps for a deliverable. The stored enum stays tiny; the
-- situational active/missed render states are DERIVED at render time in
-- src/lib/contractor-steps.ts, never stored.

create type public.task_step_state as enum ('pending', 'in_review', 'done');

create table public.task_steps (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  name        text not null,
  deadline    date,
  state       public.task_step_state not null default 'pending',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index task_steps_task_idx on public.task_steps (task_id, sort_order);

alter table public.task_steps enable row level security;

create policy "task_steps_select_authenticated"
  on public.task_steps for select
  to authenticated
  using (true);

create policy "task_steps_write_admin"
  on public.task_steps for all
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true)
  with check ((select is_admin from public.profiles where id = auth.uid()) = true);

comment on table public.task_steps is 'Admin-authored deliverable breadcrumb steps; contractor advance (pending -> in_review) via service-role API route.';
