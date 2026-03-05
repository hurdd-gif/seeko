-- Add must_set_password so invited users are forced to set a password before using the app.
-- Run in Supabase SQL Editor if your profiles table already exists.

alter table public.profiles
  add column if not exists must_set_password boolean not null default false;

comment on column public.profiles.must_set_password is 'When true, user must complete /set-password before accessing the app (e.g. invited users).';
