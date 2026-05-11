# Payments Passkey Access — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the bcrypt password gate at `/payments` with WebAuthn passkeys (one admin, multiple devices, 1h unlock). Keep the existing env-var password as a hidden break-glass recovery path.

**Architecture:** Add two Supabase tables (`passkey_credentials`, `passkey_challenges`). Add four API routes under `/api/payments/passkey/*` that use `@simplewebauthn/server` to run WebAuthn ceremonies, then mint the same `payments-token` httpOnly JWT cookie the existing system already uses. Replace `PaymentsPasswordGate` with `PaymentsPasskeyGate`; add a `SecurityKeysPanel` to `SettingsPanel`. The existing `/api/payments/verify` route stays untouched as the recovery path.

**Tech Stack:** Next.js 16 App Router · TypeScript · Supabase Postgres + RLS · `@simplewebauthn/server` · `@simplewebauthn/browser` · `jose` (already used) · Vitest · `motion/react` · Tailwind v4 · shadcn/ui

**Design doc:** `docs/plans/2026-05-10-payments-passkey-design.md`

**Sub-skills to use:**
- @superpowers:test-driven-development for every server route + helper
- @superpowers:verification-before-completion before claiming any task done
- @superpowers:systematic-debugging if anything misbehaves

---

## Conventions

- All new test files use Vitest. Mock `@supabase/ssr` and `@simplewebauthn/server` — never hit a real DB or real WebAuthn ceremony in unit tests.
- Test file location follows the existing convention: `src/app/api/.../__tests__/route.test.ts` and `src/lib/__tests__/<name>.test.ts`.
- Commit at the end of every numbered task. Conventional commits: `feat:`, `test:`, `chore:`, `refactor:`, `docs:`.
- The persona to load while implementing depends on the task; tasks call it out explicitly.
- **Code-sample notation:** Plan uses bracket notation `process["env"]["X"]` instead of dot notation in samples (a tooling quirk). When implementing, match the existing codebase style (dot notation) — see `src/lib/payments-auth.ts` and `src/app/api/payments/verify/route.ts` for the canonical shape.

---

## Task 1: Add Supabase migration for passkey tables

**Persona:** ia
**Files:**
- Create: `supabase/migrations/20260510000001_passkey_tables.sql`

**Step 1: Write the migration**

```sql
-- Passkey credentials: one row per registered device per user.
create table public.passkey_credentials (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  credential_id   text not null unique,
  public_key      bytea not null,
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
```

**Step 2: Apply migration**

If a local Supabase is wired up: `supabase db push`. Otherwise apply via the Supabase MCP `apply_migration` tool, name `passkey_tables`.
Expected: both tables exist, RLS enabled, two policies on `passkey_credentials`.

**Step 3: Verify schema**

Use `mcp__supabase__list_tables` filtered to `public` (or `supabase db diff --schema public`).
Expected: tables `passkey_credentials` and `passkey_challenges` present with the columns above.

**Step 4: Commit**

```bash
git add supabase/migrations/20260510000001_passkey_tables.sql
git commit -m "feat(db): add passkey_credentials and passkey_challenges tables"
```

---

## Task 2: Sync schema doc + IA persona

**Persona:** ia
**Files:**
- Modify: `docs/supabase-schema.sql` (append the same SQL as Task 1)
- Modify: `docs/personas/ia.md` (add table descriptions under "Supabase Tables")

**Step 1: Append to `docs/supabase-schema.sql`**

Add the full SQL block from Task 1 verbatim at the end of the file under a `-- Passkey credentials` comment header.

**Step 2: Document tables in `docs/personas/ia.md`**

Insert two new sections after the `payment_items` table:

```markdown
### 7. passkey_credentials

| Column        | Type        | Notes                                              |
|---------------|-------------|----------------------------------------------------|
| id            | uuid (PK)   | Auto-generated                                     |
| user_id       | uuid (FK)   | -> profiles.id                                     |
| credential_id | text        | Unique. Base64url id from WebAuthn attestation     |
| public_key    | bytea       | COSE public key bytes                              |
| counter       | bigint      | Signature counter; must monotonically increase     |
| transports    | text[]      | e.g. ['internal'], ['usb','nfc']                   |
| device_name   | text        | User-supplied or derived label ("MacBook Touch ID")|
| created_at    | timestamptz |                                                    |
| last_used_at  | timestamptz | Updated on each successful auth                    |

### 8. passkey_challenges

| Column     | Type        | Notes                                       |
|------------|-------------|---------------------------------------------|
| user_id    | uuid (FK)   | -> profiles.id                              |
| challenge  | text        | Random base64url string from server         |
| kind       | text        | 'register' or 'auth'                        |
| expires_at | timestamptz | 5-minute TTL                                |

PK: (user_id, kind). Server-only (no RLS policies).
```

**Step 3: Commit**

```bash
git add docs/supabase-schema.sql docs/personas/ia.md
git commit -m "docs(ia): document passkey_credentials and passkey_challenges tables"
```

---

## Task 3: Install WebAuthn dependencies

**Persona:** swe
**Files:**
- Modify: `package.json` and `package-lock.json` (npm will update both)

**Step 1: Install packages**

Run: `npm install @simplewebauthn/server@latest @simplewebauthn/browser@latest`
Expected: both packages added to `dependencies`. Versions should be in the v11+ range.

**Step 2: Verify TypeScript types resolve**

Run: `npx tsc --noEmit`
Expected: clean (or unchanged from baseline).

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @simplewebauthn/server and @simplewebauthn/browser"
```

---

## Task 4: Build the payments-passkey helper module (TDD)

**Persona:** swe
**Files:**
- Create: `src/lib/payments-passkey.ts`
- Create: `src/lib/__tests__/payments-passkey.test.ts`

This module centralizes the RP (relying party) config and a few small wrappers.

**Step 1: Write failing tests**

```ts
// src/lib/__tests__/payments-passkey.test.ts
import { describe, it, expect } from 'vitest';
import { getRpConfig, deriveDeviceName } from '../payments-passkey';

describe('getRpConfig', () => {
  it('uses localhost in dev', () => {
    const cfg = getRpConfig('http://localhost:3000');
    expect(cfg.rpId).toBe('localhost');
    expect(cfg.origin).toBe('http://localhost:3000');
    expect(cfg.rpName).toBe('SEEKO Studio');
  });

  it('uses bare hostname in production', () => {
    const cfg = getRpConfig('https://seeko-studio.onrender.com');
    expect(cfg.rpId).toBe('seeko-studio.onrender.com');
    expect(cfg.origin).toBe('https://seeko-studio.onrender.com');
  });

  it('throws on missing/invalid origin', () => {
    expect(() => getRpConfig('')).toThrow();
    expect(() => getRpConfig('not-a-url')).toThrow();
  });
});

describe('deriveDeviceName', () => {
  it('returns Mac for macOS UA', () => {
    expect(deriveDeviceName('Mozilla/5.0 (Macintosh; Mac OS X 14_0)')).toBe('Mac');
  });
  it('returns iPhone for iPhone UA', () => {
    expect(deriveDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('iPhone');
  });
  it('returns Unknown device for empty UA', () => {
    expect(deriveDeviceName(null)).toBe('Unknown device');
  });
});
```

**Step 2: Run the tests — confirm they fail**

Run: `npm test -- src/lib/__tests__/payments-passkey.test.ts`
Expected: failures with "Cannot find module '../payments-passkey'".

**Step 3: Write the minimal implementation**

Create `src/lib/payments-passkey.ts`:

```ts
export type RpConfig = {
  rpId: string;
  rpName: string;
  origin: string;
};

export const RP_NAME = 'SEEKO Studio';

/**
 * Resolve the WebAuthn RP config from a request origin.
 * Pass `req.headers.get('origin') ?? new URL(req.url).origin` from a route.
 */
export function getRpConfig(origin: string): RpConfig {
  const url = new URL(origin); // throws on invalid input
  return {
    rpId: url.hostname,
    rpName: RP_NAME,
    origin: url.origin,
  };
}

/**
 * Best-effort device label from the User-Agent string.
 * Fallback "Unknown device" can be renamed later in Settings.
 */
export function deriveDeviceName(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone')) return 'iPhone';
  if (ua.includes('ipad')) return 'iPad';
  if (ua.includes('mac os')) return 'Mac';
  if (ua.includes('android')) return 'Android device';
  if (ua.includes('windows')) return 'Windows device';
  if (ua.includes('linux')) return 'Linux device';
  return 'Unknown device';
}
```

**Step 4: Run tests — confirm they pass**

Run: `npm test -- src/lib/__tests__/payments-passkey.test.ts`
Expected: all pass.

**Step 5: Commit**

```bash
git add src/lib/payments-passkey.ts src/lib/__tests__/payments-passkey.test.ts
git commit -m "feat(lib): add payments-passkey RP config helper"
```

---

## Task 5: Add cookie-issuance helper (DRY for all four passkey routes + recovery)

**Persona:** swe
**Files:**
- Modify: `src/lib/payments-passkey.ts` (add `issuePaymentsCookie`)
- Modify: `src/lib/__tests__/payments-passkey.test.ts` (add tests)

**Step 1: Add failing tests**

Append:

```ts
import { issuePaymentsCookie, PAYMENTS_COOKIE, PAYMENTS_COOKIE_MAX_AGE } from '../payments-passkey';
import { jwtVerify } from 'jose';

describe('issuePaymentsCookie', () => {
  const SECRET = 'a'.repeat(48);
  beforeEach(() => {
    process["env"]["PAYMENTS_JWT_SECRET"] = SECRET;
    process["env"]["NODE_ENV"] = 'test';
  });

  it('returns a cookie with httpOnly, sameSite=strict, scoped to /api/payments', async () => {
    const cookie = await issuePaymentsCookie('user-123');
    expect(cookie.name).toBe(PAYMENTS_COOKIE);
    expect(cookie.options.httpOnly).toBe(true);
    expect(cookie.options.sameSite).toBe('strict');
    expect(cookie.options.path).toBe('/api/payments');
    expect(cookie.options.maxAge).toBe(PAYMENTS_COOKIE_MAX_AGE);
    expect(PAYMENTS_COOKIE_MAX_AGE).toBe(60 * 60); // 1h
  });

  it('signs a JWT bound to the user with scope=payments', async () => {
    const cookie = await issuePaymentsCookie('user-123');
    const { payload } = await jwtVerify(cookie.value, new TextEncoder().encode(SECRET));
    expect(payload.sub).toBe('user-123');
    expect(payload.scope).toBe('payments');
  });

  it('throws if PAYMENTS_JWT_SECRET is missing', async () => {
    delete process["env"]["PAYMENTS_JWT_SECRET"];
    await expect(issuePaymentsCookie('user-123')).rejects.toThrow(/PAYMENTS_JWT_SECRET/);
  });
});
```

**Step 2: Run tests — confirm they fail**

Run: `npm test -- src/lib/__tests__/payments-passkey.test.ts`
Expected: 3 new failing tests.

**Step 3: Implement**

Append to `src/lib/payments-passkey.ts`:

```ts
import { SignJWT } from 'jose';

export const PAYMENTS_COOKIE = 'payments-token';
export const PAYMENTS_COOKIE_MAX_AGE = 60 * 60; // 1 hour

export type IssuedCookie = {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'strict';
    path: string;
    maxAge: number;
  };
};

export async function issuePaymentsCookie(userId: string): Promise<IssuedCookie> {
  const secret = process["env"]["PAYMENTS_JWT_SECRET"];
  if (!secret) throw new Error('PAYMENTS_JWT_SECRET is not configured');

  const token = await new SignJWT({ sub: userId, scope: 'payments' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${PAYMENTS_COOKIE_MAX_AGE}s`)
    .setIssuedAt()
    .sign(new TextEncoder().encode(secret));

  return {
    name: PAYMENTS_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      secure: process["env"]["NODE_ENV"] === 'production',
      sameSite: 'strict',
      path: '/api/payments',
      maxAge: PAYMENTS_COOKIE_MAX_AGE,
    },
  };
}
```

**Step 4: Run tests — confirm they pass**

Run: `npm test -- src/lib/__tests__/payments-passkey.test.ts`
Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/lib/payments-passkey.ts src/lib/__tests__/payments-passkey.test.ts
git commit -m "feat(lib): add issuePaymentsCookie helper (1h JWT)"
```

---

## Task 6: Implement `/api/payments/passkey/register-options` (TDD)

**Persona:** swe
**Files:**
- Create: `src/app/api/payments/passkey/register-options/route.ts`
- Create: `src/app/api/payments/passkey/register-options/__tests__/route.test.ts`

This route requires Supabase auth + `is_admin`, generates registration options via `@simplewebauthn/server`, persists the challenge in `passkey_challenges`.

**Step 1: Write failing tests** covering:
- 401 not signed in
- 403 signed in but not admin
- 200 + persists challenge for admin (assert upsert was called with `kind='register'`)
- Passes existing credentials as `excludeCredentials`

Mock `@supabase/ssr`, `next/headers`, and `@simplewebauthn/server` (`generateRegistrationOptions`). Mirror the mock-Supabase pattern from `src/app/api/invite/__tests__/route.test.ts`.

**Step 2: Run tests — confirm they fail.**

**Step 3: Implement the route**

```ts
// src/app/api/payments/passkey/register-options/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getRpConfig } from '@/lib/payments-passkey';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabaseUrl = process["env"]["NEXT_PUBLIC_SUPABASE_URL"]!;
  const supabaseAnon = process["env"]["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!;
  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { data: existing } = await supabase
    .from('passkey_credentials').select('credential_id').eq('user_id', user.id);

  const origin = req.headers.get('origin') ?? new URL(req.url).origin;
  const { rpId, rpName } = getRpConfig(origin);

  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userName: user.email ?? user.id,
    userDisplayName: user.email ?? 'admin',
    attestationType: 'none',
    excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  const { error: chErr } = await supabase.from('passkey_challenges').upsert({
    user_id: user.id,
    kind: 'register',
    challenge: options.challenge,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
  if (chErr) return NextResponse.json({ error: 'Failed to store challenge' }, { status: 500 });

  return NextResponse.json(options);
}
```

**Step 4: Run tests — confirm they pass.**

**Step 5: Commit**

```bash
git add src/app/api/payments/passkey/register-options
git commit -m "feat(api): add passkey register-options route"
```

---

## Task 7: Implement `/api/payments/passkey/register-verify` (TDD)

**Persona:** swe
**Files:**
- Create: `src/app/api/payments/passkey/register-verify/route.ts`
- Create: `src/app/api/payments/passkey/register-verify/__tests__/route.test.ts`

Verifies attestation, deletes challenge, inserts credential row, issues 1h cookie.

**Step 1: Write failing tests** covering:
- 401 not signed in / 403 not admin / 400 missing `attestation`
- 400 if no matching `passkey_challenges` row (`kind='register'`) for this user, or expired
- 400 if attestation verification fails (mock `verifyRegistrationResponse` to throw)
- 409 on duplicate credential (Postgres `23505`)
- 200 on success: cookie set, credential row inserted, challenge row deleted

Mock `@simplewebauthn/server` `verifyRegistrationResponse` to return `{ verified: true, registrationInfo: { credential: { id, publicKey, counter } } }`.

**Step 2: Run tests — confirm they fail.**

**Step 3: Implement**

```ts
// src/app/api/payments/passkey/register-verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { getRpConfig, issuePaymentsCookie, deriveDeviceName } from '@/lib/payments-passkey';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process["env"]["NEXT_PUBLIC_SUPABASE_URL"]!,
    process["env"]["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!,
    { cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    }}
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  let body: { attestation?: unknown; deviceName?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.attestation) return NextResponse.json({ error: 'attestation required' }, { status: 400 });

  const { data: ch } = await supabase
    .from('passkey_challenges')
    .select('challenge, expires_at')
    .eq('user_id', user.id).eq('kind', 'register')
    .single();
  if (!ch || new Date(ch.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Challenge missing or expired' }, { status: 400 });
  }

  const origin = req.headers.get('origin') ?? new URL(req.url).origin;
  const { rpId, origin: expectedOrigin } = getRpConfig(origin);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.attestation as any,
      expectedChallenge: ch.challenge,
      expectedOrigin,
      expectedRPID: rpId,
      requireUserVerification: false,
    });
  } catch {
    return NextResponse.json({ error: 'Attestation verification failed' }, { status: 400 });
  }
  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Attestation rejected' }, { status: 400 });
  }

  // SimpleWebAuthn v11+ shape
  const cred = (verification.registrationInfo as any).credential
    ?? verification.registrationInfo;
  const credentialIdRaw = cred.id ?? cred.credentialID;
  const publicKey = cred.publicKey ?? cred.credentialPublicKey;
  const counter = cred.counter ?? 0;
  const transports = (body.attestation as any)?.response?.transports ?? null;

  const credentialId = typeof credentialIdRaw === 'string'
    ? credentialIdRaw
    : Buffer.from(credentialIdRaw).toString('base64url');

  const deviceName = body.deviceName?.trim() || deriveDeviceName(req.headers.get('user-agent'));

  const { error: insErr } = await supabase.from('passkey_credentials').insert({
    user_id: user.id,
    credential_id: credentialId,
    public_key: publicKey,
    counter,
    transports,
    device_name: deviceName,
  });
  if (insErr) {
    if ((insErr as any).code === '23505') return NextResponse.json({ error: 'Already registered' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to store credential' }, { status: 500 });
  }

  await supabase.from('passkey_challenges')
    .delete().eq('user_id', user.id).eq('kind', 'register');

  // First-time enrollment from the gate also unlocks. Issuing here is harmless
  // if the user is already past the gate (Settings re-registration) — same scope.
  const cookie = await issuePaymentsCookie(user.id);
  const res = NextResponse.json({ success: true, deviceName });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
```

**Step 4: Run tests — confirm they pass.**

**Step 5: Commit**

```bash
git add src/app/api/payments/passkey/register-verify
git commit -m "feat(api): add passkey register-verify route"
```

---

## Task 8: Implement `/api/payments/passkey/auth-options` (TDD)

**Persona:** swe
**Files:**
- Create: `src/app/api/payments/passkey/auth-options/route.ts`
- Create: `src/app/api/payments/passkey/auth-options/__tests__/route.test.ts`

**Step 1: Write failing tests** covering:
- 401 / 403 / admin path
- Returns options + `allowCredentials` derived from the calling user's `passkey_credentials` rows only
- Persists `kind='auth'` challenge (upsert overwrites stale)
- Returns options with `allowCredentials: []` when user has no passkeys (gate uses this to decide register vs unlock mode)

**Step 2: Run tests — confirm they fail.**

**Step 3: Implement**

```ts
// src/app/api/payments/passkey/auth-options/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getRpConfig } from '@/lib/payments-passkey';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process["env"]["NEXT_PUBLIC_SUPABASE_URL"]!,
    process["env"]["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!,
    { cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    }}
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { data: creds } = await supabase
    .from('passkey_credentials')
    .select('credential_id, transports')
    .eq('user_id', user.id);

  const origin = req.headers.get('origin') ?? new URL(req.url).origin;
  const { rpId } = getRpConfig(origin);

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    userVerification: 'preferred',
    allowCredentials: (creds ?? []).map((c) => ({
      id: c.credential_id,
      transports: c.transports ?? undefined,
    })),
  });

  const { error: chErr } = await supabase.from('passkey_challenges').upsert({
    user_id: user.id,
    kind: 'auth',
    challenge: options.challenge,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
  if (chErr) return NextResponse.json({ error: 'Failed to store challenge' }, { status: 500 });

  return NextResponse.json(options);
}
```

**Step 4: Run tests — confirm they pass.**

**Step 5: Commit**

```bash
git add src/app/api/payments/passkey/auth-options
git commit -m "feat(api): add passkey auth-options route"
```

---

## Task 9: Implement `/api/payments/passkey/auth-verify` (TDD)

**Persona:** swe
**Files:**
- Create: `src/app/api/payments/passkey/auth-verify/route.ts`
- Create: `src/app/api/payments/passkey/auth-verify/__tests__/route.test.ts`

**Step 1: Write failing tests** covering:
- 401 / 403 / admin path; 400 missing assertion
- 400 if no matching `kind='auth'` challenge or expired
- 400 if `assertion.id` doesn't match a stored credential for this user
- **Cloned-credential path:** when verification returns `newCounter <= storedCounter`, route deletes the credential row and returns 401 with `error: 'untrusted-device'`
- 200 success: cookie set, counter + `last_used_at` updated, challenge row deleted

**Step 2: Run tests — confirm they fail.**

**Step 3: Implement**

```ts
// src/app/api/payments/passkey/auth-verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { getRpConfig, issuePaymentsCookie } from '@/lib/payments-passkey';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process["env"]["NEXT_PUBLIC_SUPABASE_URL"]!,
    process["env"]["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!,
    { cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    }}
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  let body: { assertion?: any };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.assertion?.id) return NextResponse.json({ error: 'assertion required' }, { status: 400 });

  const { data: ch } = await supabase
    .from('passkey_challenges')
    .select('challenge, expires_at')
    .eq('user_id', user.id).eq('kind', 'auth')
    .single();
  if (!ch || new Date(ch.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Challenge missing or expired' }, { status: 400 });
  }

  const { data: cred } = await supabase
    .from('passkey_credentials')
    .select('id, credential_id, public_key, counter, transports')
    .eq('user_id', user.id).eq('credential_id', body.assertion.id)
    .single();
  if (!cred) return NextResponse.json({ error: 'Unknown credential' }, { status: 400 });

  const origin = req.headers.get('origin') ?? new URL(req.url).origin;
  const { rpId, origin: expectedOrigin } = getRpConfig(origin);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.assertion,
      expectedChallenge: ch.challenge,
      expectedOrigin,
      expectedRPID: rpId,
      requireUserVerification: false,
      credential: {
        id: cred.credential_id,
        publicKey: cred.public_key as unknown as Uint8Array,
        counter: Number(cred.counter),
        transports: cred.transports ?? undefined,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  const newCounter = verification.authenticationInfo.newCounter;
  if (newCounter !== 0 && newCounter <= Number(cred.counter)) {
    await supabase.from('passkey_credentials').delete().eq('id', cred.id);
    return NextResponse.json({ error: 'untrusted-device' }, { status: 401 });
  }

  await supabase.from('passkey_credentials')
    .update({ counter: newCounter, last_used_at: new Date().toISOString() })
    .eq('id', cred.id);

  await supabase.from('passkey_challenges')
    .delete().eq('user_id', user.id).eq('kind', 'auth');

  const cookie = await issuePaymentsCookie(user.id);
  const res = NextResponse.json({ success: true });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
```

**Step 4: Run tests — confirm they pass.**

**Step 5: Commit**

```bash
git add src/app/api/payments/passkey/auth-verify
git commit -m "feat(api): add passkey auth-verify route with clone detection"
```

---

## Task 10: Add list + delete API for the SecurityKeysPanel

**Persona:** swe
**Files:**
- Create: `src/app/api/payments/passkey/credentials/route.ts` (GET list, DELETE one by id)
- Create: `src/app/api/payments/passkey/credentials/__tests__/route.test.ts`

**Step 1: Write failing tests** covering:
- GET returns array of `{ id, device_name, created_at, last_used_at }` for the calling user only
- GET 401 if not signed in
- DELETE accepts `?id=<uuid>` and removes the row; returns 200 on success
- DELETE 404 if id doesn't belong to the caller (RLS prevents the delete; route reports 404 via `count: 0`)

**Step 2: Run tests — confirm they fail.**

**Step 3: Implement**

```ts
// src/app/api/payments/passkey/credentials/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function client() {
  const cookieStore = await cookies();
  return createServerClient(
    process["env"]["NEXT_PUBLIC_SUPABASE_URL"]!,
    process["env"]["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!,
    { cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    }}
  );
}

export async function GET() {
  const supabase = await client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('passkey_credentials')
    .select('id, device_name, created_at, last_used_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ credentials: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const supabase = await client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error, count } = await supabase
    .from('passkey_credentials')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
```

**Step 4: Run tests — confirm they pass.**

**Step 5: Commit**

```bash
git add src/app/api/payments/passkey/credentials
git commit -m "feat(api): add passkey credentials list/delete route"
```

---

## Task 11: Refactor existing `/api/payments/verify` to use shared cookie helper

**Persona:** swe
**Files:**
- Modify: `src/app/api/payments/verify/route.ts`

**Step 1: Replace cookie-issuance block**

Inside the success branch (after `bcrypt.compare` returns true), replace the inline `SignJWT` + `response.cookies.set(PAYMENTS_COOKIE, ...)` block with:

```ts
import { issuePaymentsCookie } from '@/lib/payments-passkey';
// ...
const cookie = await issuePaymentsCookie(user.id);
const response = NextResponse.json({ success: true, recovered: true });
response.cookies.set(cookie.name, cookie.value, cookie.options);
return response;
```

Drop unused imports (`SignJWT` and the local `PAYMENTS_COOKIE` constant if no longer referenced).

**Step 2: Run all payments-related tests**

Run: `npm test -- src/app/api/payments src/lib/__tests__/payments-passkey`
Expected: green.

**Step 3: Commit**

```bash
git add src/app/api/payments/verify/route.ts
git commit -m "refactor(api): payments/verify uses shared cookie helper (1h)"
```

---

## Task 12: Build `PaymentsPasskeyGate` component

**Persona:** ux
**Files:**
- Create: `src/components/dashboard/PaymentsPasskeyGate.tsx`

This replaces `PaymentsPasswordGate`. Same visual frame (Card, accent icon ring, motion entrance), different inner state machine.

**Step 1: Run `interface-craft critique` on the existing PaymentsPasswordGate**

Skill: @superpowers:interface-craft. Critique `src/components/dashboard/PaymentsPasswordGate.tsx`. Carry forward what works; document what to change.

**Step 2: Implement the component**

```tsx
// src/components/dashboard/PaymentsPasskeyGate.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Lock, Fingerprint, KeyRound, Loader2 } from 'lucide-react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { springs } from '@/lib/motion';

type Mode = 'loading' | 'register' | 'unlock' | 'unsupported' | 'recovery';

interface Props {
  onAuthenticated: () => void;
}

export function PaymentsPasskeyGate({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recoveryPw, setRecoveryPw] = useState('');

  // Detect WebAuthn + check if the user has any registered credentials.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.PublicKeyCredential) { setMode('unsupported'); return; }

    (async () => {
      try {
        const res = await fetch('/api/payments/passkey/auth-options', { method: 'POST' });
        if (!res.ok) { setMode('register'); return; }
        const opts = await res.json();
        setMode((opts.allowCredentials?.length ?? 0) > 0 ? 'unlock' : 'register');
      } catch {
        setMode('register');
      }
    })();
  }, []);

  const doRegister = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const optsRes = await fetch('/api/payments/passkey/register-options', { method: 'POST' });
      if (!optsRes.ok) throw new Error((await optsRes.json()).error || 'Failed to start');
      const options = await optsRes.json();
      const attestation = await startRegistration({ optionsJSON: options });
      const verifyRes = await fetch('/api/payments/passkey/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attestation }),
      });
      if (!verifyRes.ok) throw new Error((await verifyRes.json()).error || 'Registration failed');
      onAuthenticated();
    } catch (e: any) {
      setError(e?.message ?? 'Could not register device');
    } finally {
      setBusy(false);
    }
  }, [onAuthenticated]);

  const doUnlock = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const optsRes = await fetch('/api/payments/passkey/auth-options', { method: 'POST' });
      if (!optsRes.ok) throw new Error('Failed to start unlock');
      const options = await optsRes.json();
      const assertion = await startAuthentication({ optionsJSON: options });
      const verifyRes = await fetch('/api/payments/passkey/auth-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertion }),
      });
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({}));
        throw new Error(body.error === 'untrusted-device'
          ? 'This device is no longer trusted. Use another or recover.'
          : 'Could not unlock');
      }
      onAuthenticated();
    } catch (e: any) {
      setError(e?.message ?? 'Could not unlock');
    } finally {
      setBusy(false);
    }
  }, [onAuthenticated]);

  const doRecover = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: recoveryPw }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Invalid password');
      onAuthenticated();
    } catch (e: any) {
      setError(e?.message ?? 'Recovery failed');
    } finally {
      setBusy(false);
    }
  }, [onAuthenticated, recoveryPw]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springs.snappy}
      >
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-seeko-accent/10">
              {mode === 'recovery' ? <KeyRound className="size-5 text-seeko-accent" />
                : mode === 'register' ? <Fingerprint className="size-5 text-seeko-accent" />
                : <Lock className="size-5 text-seeko-accent" />}
            </div>
            <CardTitle>
              {mode === 'recovery' ? 'Recovery access'
                : mode === 'register' ? 'Register this device'
                : mode === 'unsupported' ? 'Passkeys unavailable'
                : 'Payments access'}
            </CardTitle>
            <CardDescription>
              {mode === 'recovery' ? 'Use your recovery password.'
                : mode === 'register' ? 'Use Touch ID, Face ID, or a security key to enroll.'
                : mode === 'unsupported' ? 'Your browser does not support passkeys. Use recovery instead.'
                : mode === 'loading' ? ''
                : 'Tap unlock and complete the prompt.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mode === 'loading' && (
              <div className="flex justify-center py-4 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}
            {mode === 'register' && (
              <Button onClick={doRegister} disabled={busy} className="w-full">
                {busy ? 'Waiting for prompt...' : 'Register this device'}
              </Button>
            )}
            {mode === 'unlock' && (
              <Button onClick={doUnlock} disabled={busy} className="w-full">
                {busy ? 'Waiting for prompt...' : 'Unlock with passkey'}
              </Button>
            )}
            {mode === 'recovery' && (
              <form onSubmit={doRecover} className="space-y-3">
                <Input
                  type="password"
                  value={recoveryPw}
                  onChange={(e) => setRecoveryPw(e.target.value)}
                  placeholder="Recovery password"
                  autoFocus
                />
                <Button type="submit" disabled={busy || !recoveryPw} className="w-full">
                  {busy ? 'Verifying...' : 'Recover'}
                </Button>
              </form>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {mode !== 'recovery' && mode !== 'loading' && (
              <button
                type="button"
                onClick={() => { setError(''); setMode('recovery'); }}
                className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Lost your devices? Use recovery
              </button>
            )}
            {mode === 'recovery' && (
              <button
                type="button"
                onClick={() => { setError(''); setMode('unlock'); }}
                className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to passkey
              </button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
```

**Step 3: Run `interface-craft critique` again** on the new component and apply structural fixes.

**Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean.

**Step 5: Commit**

```bash
git add src/components/dashboard/PaymentsPasskeyGate.tsx
git commit -m "feat(ui): add PaymentsPasskeyGate (passkey + recovery)"
```

---

## Task 13: Wire `PaymentsPasskeyGate` into `PaymentsAdmin`

**Persona:** swe
**Files:**
- Modify: `src/components/dashboard/PaymentsAdmin.tsx:28` and `:135`

**Step 1: Swap the import**

Line 28:
```ts
import { PaymentsPasskeyGate } from '@/components/dashboard/PaymentsPasskeyGate';
```

**Step 2: Swap the JSX**

Line 135 (or wherever `<PaymentsPasswordGate>` is rendered):
```tsx
<PaymentsPasskeyGate onAuthenticated={() => setAuthenticated(true)} />
```
Same `onAuthenticated` contract — no other changes needed.

**Step 3: TypeScript + tests**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: clean.

**Step 4: Commit**

```bash
git add src/components/dashboard/PaymentsAdmin.tsx
git commit -m "feat(ui): swap PaymentsAdmin gate from password to passkey"
```

---

## Task 14: Build `SecurityKeysPanel` and mount in `SettingsPanel`

**Persona:** ux
**Files:**
- Create: `src/components/dashboard/SecurityKeysPanel.tsx`
- Modify: `src/components/dashboard/SettingsPanel.tsx`

**Step 1: Build the panel**

```tsx
// src/components/dashboard/SecurityKeysPanel.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, Trash2, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { springs } from '@/lib/motion';

type Credential = {
  id: string;
  device_name: string;
  created_at: string;
  last_used_at: string | null;
};

export function SecurityKeysPanel() {
  const [creds, setCreds] = useState<Credential[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/payments/passkey/credentials');
    if (!res.ok) { setCreds([]); return; }
    const body = await res.json();
    setCreds(body.credentials);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addDevice = useCallback(async () => {
    setBusy(true);
    try {
      const optsRes = await fetch('/api/payments/passkey/register-options', { method: 'POST' });
      if (!optsRes.ok) throw new Error('Could not start registration');
      const options = await optsRes.json();
      const attestation = await startRegistration({ optionsJSON: options });
      const verify = await fetch('/api/payments/passkey/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attestation, deviceName: newName.trim() || undefined }),
      });
      if (!verify.ok) throw new Error((await verify.json()).error || 'Registration failed');
      toast.success('Device registered');
      setNewName('');
      setAdding(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not register device');
    } finally {
      setBusy(false);
    }
  }, [newName, load]);

  const removeDevice = useCallback(async (cred: Credential) => {
    const isLast = (creds?.length ?? 0) <= 1;
    const ok = window.confirm(
      isLast
        ? 'This is your last passkey. Removing it will lock you out unless you have the recovery password. Continue?'
        : `Remove "${cred.device_name}"?`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/payments/passkey/credentials?id=${cred.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not remove device');
      toast.success('Device removed');
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not remove device');
    } finally {
      setBusy(false);
    }
  }, [creds, load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security keys</CardTitle>
        <CardDescription>
          Devices you can use to unlock payments. Add a backup device so you don't get locked out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {creds === null ? (
          <div className="flex justify-center py-2"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
        ) : creds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No devices registered.</p>
        ) : (
          <ul className="divide-y divide-border">
            {creds.map(c => (
              <motion.li
                key={c.id}
                layout
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={springs.snappy}
                className="flex items-center gap-3 py-3"
              >
                <Fingerprint className="size-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.device_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Added {new Date(c.created_at).toLocaleDateString()}
                    {c.last_used_at && ` - Last used ${new Date(c.last_used_at).toLocaleDateString()}`}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeDevice(c)} disabled={busy} aria-label={`Remove ${c.device_name}`}>
                  <Trash2 className="size-4" />
                </Button>
              </motion.li>
            ))}
          </ul>
        )}

        <AnimatePresence initial={false}>
          {adding ? (
            <motion.div
              key="add-form"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              transition={springs.heavy}
              className="overflow-hidden space-y-2"
            >
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Device name (optional, e.g. iPhone)"
              />
              <div className="flex gap-2">
                <Button onClick={addDevice} disabled={busy} className="flex-1">
                  {busy ? 'Waiting...' : 'Continue'}
                </Button>
                <Button variant="ghost" onClick={() => { setAdding(false); setNewName(''); }} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="add-btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Button variant="outline" onClick={() => setAdding(true)} disabled={busy} className="w-full">
                <Plus className="size-4 mr-2" /> Add another device
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Mount in `SettingsPanel`**

In `src/components/dashboard/SettingsPanel.tsx`, import and render the panel only when the loaded profile is admin. Reasonable placement: a new Card section near the existing "Change Password" block (around line 401), wrapped in an admin guard.

```tsx
import { SecurityKeysPanel } from '@/components/dashboard/SecurityKeysPanel';
// ...
{profile?.is_admin && <SecurityKeysPanel />}
```
Confirm the in-scope variable name for the loaded profile (might be `me`, `currentProfile`, etc.) and use that.

**Step 3: Run `interface-craft critique`** on the new panel + its placement in SettingsPanel. Apply structural fixes only.

**Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean.

**Step 5: Commit**

```bash
git add src/components/dashboard/SecurityKeysPanel.tsx src/components/dashboard/SettingsPanel.tsx
git commit -m "feat(ui): add SecurityKeysPanel for managing passkeys"
```

---

## Task 15: Verification — full sweep + dev-server smoke

**Persona:** swe
Use @superpowers:verification-before-completion.

**Step 1: Full test run**

Run: `npm test -- --run`
Expected: green.

**Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean.

**Step 3: Build**

Run: `npm run build`
Expected: clean.

**Step 4: Dev-server manual QA (real Touch ID / passkey)**

Start: `npm run dev`. Walk through:
- [ ] Sign in as karti (admin). Visit `/payments`. Gate shows "Register this device".
- [ ] Register -> Touch ID prompt -> page unlocks, payments load.
- [ ] Open Settings -> "Security keys" lists the new device with today's date.
- [ ] Add a second device (or simulate via QR/phone passkey). Both appear.
- [ ] Wait > 1h (or expire the cookie via DevTools) and reload `/payments`. Gate shows "Unlock with passkey". Touch ID -> unlocks.
- [ ] Remove the most-recently-added device in Settings. Confirm it's gone.
- [ ] Click "Lost your devices? Use recovery" on the gate. Type the recovery password. Unlocks.
- [ ] Cloned-credential simulation: bump the credential's `counter` in Supabase to `9999999`. Try to unlock. Expect `untrusted-device`, row deleted, gate falls back to register.
- [ ] In a browser without WebAuthn (or with `window.PublicKeyCredential = undefined` via DevTools), gate shows "Passkeys unavailable" and only the recovery link works.

**Step 5: Commit any fixes** discovered during smoke test.

---

## Task 16: Remove `PaymentsPasswordGate`

**Persona:** swe
**Files:**
- Delete: `src/components/dashboard/PaymentsPasswordGate.tsx`

**Step 1: Confirm no remaining references**

Run: `grep -r "PaymentsPasswordGate" src/`
Expected: zero matches.

**Step 2: Delete the file**

Run: `rm src/components/dashboard/PaymentsPasswordGate.tsx`

**Step 3: Build + test**

Run: `npx tsc --noEmit && npm test -- --run && npm run build`
Expected: all clean.

**Step 4: Commit**

```bash
git add -A src/components/dashboard/PaymentsPasswordGate.tsx
git commit -m "chore: remove PaymentsPasswordGate (replaced by passkey gate)"
```

---

## Task 17: Update protocol docs

**Persona:** ia
**Files:**
- Modify: `docs/personas/devops.md` (clarify `PAYMENTS_ACCESS_HASH` is now recovery-only)
- Modify: `docs/personas/ux.md` (cross-reference the new components)

**Step 1: Edit `docs/personas/devops.md`**

Update the `PAYMENTS_ACCESS_HASH` description to:
> bcrypt hash of payments **recovery** password (break-glass only; passkeys are the primary access mechanism)

**Step 2: Edit `docs/personas/ux.md`**

Add to the component table:
| `PaymentsPasskeyGate` | `src/components/dashboard/PaymentsPasskeyGate.tsx` | Gate at `/payments`. WebAuthn passkeys + recovery password fallback. |
| `SecurityKeysPanel` | `src/components/dashboard/SecurityKeysPanel.tsx` | Settings panel for managing registered passkeys (admin only). |

**Step 3: Commit**

```bash
git add docs/personas/devops.md docs/personas/ux.md
git commit -m "docs: clarify passkey is primary, recovery password is break-glass"
```

---

## Task 18: Open the PR

**Persona:** swe
Use @superpowers:finishing-a-development-branch.

Branch: `claude/eloquent-dewdney-e58356`. Push, then open a PR with body:

```
## Summary
- Replace bcrypt password gate at /payments with WebAuthn passkeys
- Add Settings -> Security keys for device management
- Keep PAYMENTS_ACCESS_HASH as hidden break-glass recovery
- Reduce JWT cookie window 24h -> 1h

## Test plan
- [ ] /payments register-device flow on a fresh admin
- [ ] /payments unlock flow on returning admin
- [ ] Add + remove devices in Settings
- [ ] Recovery password path
- [ ] Cloned-credential detection (forced via Supabase counter bump)
- [ ] Browser without WebAuthn shows recovery-only
```

---

## Out of scope (do not implement here)

- Per-action re-tap (every create/delete requires fresh Touch ID)
- Per-admin gating (only `is_admin` matters)
- Push notifications on passkey events
- Audit log table for unlocks (Supabase logs are sufficient)
