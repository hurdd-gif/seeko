-- EKO pending actions: durable staging for approval-gated agent writes.
-- Mirrors the notes-table RLS pattern (admin-only select/update; the api-server
-- stages and executes via the service role, bypassing RLS).

create type public.eko_pending_action_status as enum (
  'awaiting_approval', 'executing', 'executed', 'rejected', 'failed'
);

create table public.eko_pending_actions (
  id              uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  tool_id         text not null,
  resolved_args   jsonb not null,
  summary         text not null,
  status          public.eko_pending_action_status not null default 'awaiting_approval',
  error           text,
  created_at      timestamptz not null default now(),
  executed_at     timestamptz
);

-- Status set is intentionally 5, not the 8 sketched in the design's data-shapes
-- block. `proposed`/`needs_slots` are dropped because a row is only ever
-- inserted AFTER the write tool's stage() resolves + validates (it enters
-- directly at awaiting_approval); an unresolvable ref never becomes a row — the
-- error goes back to the model instead. `approved` is dropped because approval
-- transitions awaiting_approval → executing directly (no distinct persisted
-- "approved" state to guard). isExecutable() keys off the single live state.

create index eko_pending_actions_conversation_status_idx
  on public.eko_pending_actions (conversation_id, status);

alter table public.eko_pending_actions enable row level security;

create policy "eko_pending_actions_admin_select"
  on public.eko_pending_actions for select
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true);

create policy "eko_pending_actions_admin_update"
  on public.eko_pending_actions for update
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true);

comment on table public.eko_pending_actions is
  'Approval-gated staging for EKO agent writes — admin-only via RLS; api-server stages/executes via service role.';
