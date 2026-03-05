-- Add updated_at to docs for "Updated X ago" on cards.
alter table public.docs
  add column if not exists updated_at timestamptz default now();

comment on column public.docs.updated_at is 'Set on every update; used for recency display.';

-- Backfill existing rows so ordering works (use created_at if present, else now)
update public.docs
set updated_at = coalesce(created_at, now())
where updated_at is null;
