# Payments — Passkey (WebAuthn) Access

**Date:** 2026-05-10
**Status:** Design approved
**Replaces:** Bcrypt password gate at `/api/payments/verify` (kept as recovery)

---

## Goal

Replace the shared bcrypt password that gates the `/payments` admin surface with WebAuthn passkeys. One admin (karti), multiple devices, 1-hour unlock window. Lose-all-devices recovery via the existing env-var password (break-glass only, hidden from normal UI).

## Non-goals

- Per-action re-tap (every create/delete requires fresh Touch ID)
- Per-admin gating — `is_admin = true` continues to be the sole authorization predicate
- Push notifications on passkey events
- Audit log of unlocks (Supabase logs are sufficient)

---

## Current state

- `/payments` page checks `profile.is_admin`, then renders `PaymentsPasswordGate`
- User enters password → `POST /api/payments/verify` → bcrypt against `PAYMENTS_ACCESS_HASH` → server signs HS256 JWT → sets `payments-token` httpOnly cookie (24h, scoped to `/api/payments`)
- Every payment API route calls `getPaymentsAuth()` which checks Supabase user + `is_admin` + valid JWT cookie

The JWT cookie mechanism is sound and stays. We only change the **issuance path**.

---

## Approach

Use `@simplewebauthn/server` (~1.5M weekly downloads) and `@simplewebauthn/browser`. They handle every WebAuthn ceremony detail correctly — challenge generation, attestation parsing, COSE key extraction, signature verification, counter checks.

Considered and rejected:
- **Supabase MFA** — WebAuthn isn't GA in Supabase Auth (only TOTP/phone today)
- **Hand-rolled WebAuthn** — security footgun, not worth the maintenance

---

## Architecture

```
PaymentsPasskeyGate (replaces PaymentsPasswordGate)
  ├─ first visit (0 passkeys)  → "Register this device" → Touch ID → enrolled + unlocked
  └─ return visit              → "Unlock with passkey" → Touch ID → unlocked
  └─ "Lost devices? Recover"   → password recovery sub-form

SettingsPanel
  └─ SecurityKeysPanel (new)
       ├─ list registered devices (name, last used, created)
       ├─ "Add another device" → register ceremony
       └─ "Remove" per-row (with last-device confirm)

API routes (new, under /api/payments/passkey/)
  ├─ register-options    POST  → challenge for new credential
  ├─ register-verify     POST  → verify attestation, store credential, issue cookie
  ├─ auth-options        POST  → challenge + allowCredentials list
  └─ auth-verify         POST  → verify assertion, increment counter, issue cookie

API route (existing, role narrowed)
  └─ /api/payments/verify   → break-glass recovery (env-var password)
                              not linked from main UI; small "lost devices" link only

Tables (new)
  ├─ passkey_credentials    → enrolled devices
  └─ passkey_challenges     → short-lived ceremony challenges
```

---

## Data model

```sql
create table passkey_credentials (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  credential_id   text not null unique,
  public_key      bytea not null,
  counter         bigint not null default 0,
  transports      text[],
  device_name     text not null,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz
);
create index passkey_credentials_user_id_idx on passkey_credentials(user_id);

alter table passkey_credentials enable row level security;
create policy "own_passkeys_read" on passkey_credentials
  for select using (auth.uid() = user_id);
create policy "own_passkeys_delete" on passkey_credentials
  for delete using (auth.uid() = user_id);

create table passkey_challenges (
  user_id     uuid not null references profiles(id) on delete cascade,
  challenge   text not null,
  kind        text not null check (kind in ('register','auth')),
  expires_at  timestamptz not null,
  primary key (user_id, kind)
);
alter table passkey_challenges enable row level security;
-- no client policies; service-role only
```

`passkey_challenges` is server-only (no client RLS policies). One row per `(user, kind)` so a fresh ceremony overwrites a stale one. 5-minute TTL.

Inserts to `passkey_credentials` go through API routes after attestation verification, using the service-role client (not subject to RLS). Reads/deletes go through the user's normal Supabase client and rely on RLS.

---

## Flows

### Enrollment (first device or additional device)
1. Client `POST /api/payments/passkey/register-options`
2. Server: verify Supabase user + `is_admin`. Generate challenge via `generateRegistrationOptions()`. Upsert into `passkey_challenges (kind='register')`. Return options JSON.
3. Browser: `startRegistration()` → OS Touch ID prompt → returns attestation
4. Client `POST /api/payments/passkey/register-verify` with attestation + optional device name
5. Server: load challenge, call `verifyRegistrationResponse()`, on success delete challenge + insert `passkey_credentials` row + (gate flow only) sign 1h JWT cookie. Return success.

### Authentication (return visit)
1. Client `POST /api/payments/passkey/auth-options`
2. Server: verify user + `is_admin`. Load credential ids for this user. `generateAuthenticationOptions({ allowCredentials })`. Upsert `passkey_challenges (kind='auth')`. Return options.
3. Browser: `startAuthentication()` → Touch ID → returns assertion
4. Client `POST /api/payments/passkey/auth-verify` with assertion
5. Server: load challenge + credential row by `credential_id`. Call `verifyAuthenticationResponse()`. If counter ≤ stored counter → delete credential row, return 401 "untrusted device". Else update counter + `last_used_at`, delete challenge, sign JWT cookie.

### Recovery (lost all devices)
- Tiny "Lost your devices?" link on the gate → reveals password input → `POST /api/payments/verify` (existing route, unchanged) → JWT cookie issued
- Toast: "Recovered. Register a new device in Settings."

---

## Components

### `PaymentsPasskeyGate.tsx` (replaces `PaymentsPasswordGate.tsx`)
- On mount, fetches `/api/payments/passkey/auth-options` to know if user has credentials
  - If 200 with non-empty `allowCredentials` → "Unlock with passkey"
  - If 200 with empty list → "Register this device"
- Calls `startRegistration()` or `startAuthentication()` from `@simplewebauthn/browser`
- WebAuthn unsupported (no `window.PublicKeyCredential`) → show only the recovery link

### `SecurityKeysPanel.tsx` (new, mounted in `SettingsPanel`)
- Lists devices via Supabase select (RLS-scoped to caller)
- "Add another device" → register ceremony (no JWT cookie issuance — admin already past gate by then)
- "Remove" → Supabase delete (RLS-scoped). If removing last device, confirm dialog.

### Server: `src/lib/payments-passkey.ts` (new helper module)
- `getRpId()` — returns hostname (e.g. `seeko-studio.onrender.com` in prod, `localhost` in dev)
- `getRpName()` — `"SEEKO Studio"`
- `getOrigin()` — full origin from request headers
- Wrappers around the four SimpleWebAuthn functions with consistent error shapes

---

## Error handling

| State | Surface | Behavior |
|---|---|---|
| Not admin | `/payments` page redirect | unchanged |
| 0 passkeys, WebAuthn supported | gate | "Register this device" + "Lost devices?" link |
| 0 passkeys, WebAuthn unsupported | gate | only recovery link |
| User cancels Touch ID | gate | inline "Cancelled. Try again." with fresh challenge |
| Wrong/unknown credential | gate | "That device isn't registered." |
| Counter mismatch | gate | server deletes row → "This passkey is no longer trusted." |
| Challenge expired (>5min) | gate | retry transparently fetches new options |
| Recovery password wrong | recovery sub-form | "Invalid password" |
| Settings: register existing credential | SecurityKeysPanel | inline "Already registered" |
| Settings: remove last device | SecurityKeysPanel | confirm "This will lock you out unless you have recovery access." |

---

## Testing (Vitest)

- `register-verify`: valid attestation inserts row; invalid rejected; expired challenge rejected; non-admin rejected
- `auth-verify`: valid assertion issues JWT; counter increment persisted; cloned counter deletes row + 401; non-admin rejected
- `auth-options`: returns only the calling user's `allowCredentials`
- Mock `@simplewebauthn/server` verify functions; assert challenge consumption + DB writes
- RLS test: user A cannot read/delete user B's `passkey_credentials`

Manual QA:
- Mac Touch ID register → unlock → wait 1h → re-unlock
- Add iPhone passkey via QR → unlock with either device
- Remove a device in Settings → confirm it can't unlock
- Recovery via env-var password → register fresh device after

---

## Rollout

1. Supabase migration: add `passkey_credentials` + `passkey_challenges` tables (update `docs/supabase-schema.sql` and `docs/personas/ia.md`)
2. Add deps: `@simplewebauthn/server`, `@simplewebauthn/browser`
3. Build `src/lib/payments-passkey.ts` helper
4. Build the four `/api/payments/passkey/*` routes
5. Build `PaymentsPasskeyGate` and wire into `/payments`
6. Build `SecurityKeysPanel` and mount in `SettingsPanel`
7. Reduce JWT cookie `maxAge` in `/api/payments/verify` from `24*60*60` → `60*60`
8. Reduce JWT cookie `maxAge` in passkey verify routes to `60*60`
9. Manual QA, then delete `PaymentsPasswordGate.tsx`
10. No new env vars. `PAYMENTS_ACCESS_HASH` and `PAYMENTS_JWT_SECRET` keep their roles.

---

## Open questions

None — design fully approved.
