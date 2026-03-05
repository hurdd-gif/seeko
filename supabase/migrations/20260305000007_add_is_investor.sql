-- ─── Investor flag ────────────────────────────────────────────────────────────
-- Marks a profile as an investor, granting access to the /investor panel.
-- Set manually via Supabase Table Editor or via future invite-as-investor flow.

alter table public.profiles
  add column if not exists is_investor boolean not null default false;
