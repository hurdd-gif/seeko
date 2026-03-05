-- ─── Investor invites ──────────────────────────────────────────────────────────
-- Allow inviting as investor via pending_invites; profile/init sets is_investor on signup.
-- Investors are excluded from the team roster (fetchTeam filters them out).

alter table public.pending_invites
  add column if not exists is_investor boolean not null default false;
