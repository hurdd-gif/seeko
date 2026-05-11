-- Passkey credentials: one row per registered device per user.
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

-- Users may read their own credentials (for SecurityKeysPanel listing).
create policy "own_passkeys_read" on public.passkey_credentials
  for select using (auth.uid() = user_id);

-- Users may delete their own credentials (for SecurityKeysPanel remove).
create policy "own_passkeys_delete" on public.passkey_credentials
  for delete using (auth.uid() = user_id);

-- Inserts/updates go through API routes using the service role.
-- (No client-side insert/update policy on purpose.)

-- Short-lived ceremony challenges. One row per (user, kind).
create table public.passkey_challenges (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  challenge   text not null,
  kind        text not null check (kind in ('register','auth')),
  expires_at  timestamptz not null default (now() + interval '5 minutes'),
  primary key (user_id, kind)
);

alter table public.passkey_challenges enable row level security;
-- No client policies; service-role only.
