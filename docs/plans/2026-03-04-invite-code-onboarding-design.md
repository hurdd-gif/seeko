# Invite Code Onboarding — Design

**Date:** 2026-03-04
**Status:** Approved

## Problem

Users receive a Supabase magic-link invite email but frequently don't complete account setup. The link-based flow has high dropout.

## Solution

Replace the magic-link invite with a Supabase OTP (6-digit code) flow. Users enter their email + code on the login page to create their account, then proceed to set-password → onboarding.

---

## Flow

```
Admin (team page) → POST /api/invite
  → service role client: auth.signInWithOtp({ email, shouldCreateUser: true })
  → stores { email, department, is_contractor } in pending_invites table
  → Supabase emails user a 6-digit code

User arrives at /login
  → Two tabs: "Sign in" | "Invite code"
  → Invite code tab: enter email + 6-digit code
  → Client calls supabase.auth.verifyOtp({ email, token, type: 'email' })
  → On success: POST /api/profile/init (reads pending_invites, upserts profile, deletes row)
  → Redirect to /set-password → /onboarding → dashboard
```

---

## UI

Login page gains two tabs. "Sign in" tab is unchanged. "Invite code" tab:

```
┌─────────────────────────────────────┐
│           SEEKO Studio              │
│      Sign in to your workspace      │
│                                     │
│  [Sign in]  [Invite code]           │
│  ─────────────────────────────────  │
│                                     │
│  Email                              │
│  [you@seeko.studio              ]   │
│                                     │
│  Invite code                        │
│  [  6-digit code from your email ]  │
│                                     │
│  [        Continue          ]       │
└─────────────────────────────────────┘
```

---

## Backend Changes

### `/api/invite` (modified)
- Replace `admin.auth.admin.inviteUserByEmail()` with `admin.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` using service role client
- Insert `{ email, department, is_contractor }` into `pending_invites` table (upsert on conflict)
- Remove profile upsert from this route (moved to `/api/profile/init`)

### `/api/profile/init` (new)
- Authenticated route (user must have valid session from OTP verify)
- Reads `pending_invites` row by `user.email`
- Upserts `profiles` row: `{ id: user.id, email, display_name: email.split('@')[0], department, is_contractor, must_set_password: true }`
- Deletes the `pending_invites` row

### `/api/auth/callback/invite` (deleted)
- No longer needed — magic link flow removed

---

## Schema

### New table: `pending_invites`

```sql
create table pending_invites (
  email text primary key,
  department text,
  is_contractor boolean default false,
  created_at timestamptz default now()
);

-- RLS: service role only (no user access needed)
alter table pending_invites enable row level security;
```

---

## Files Affected

| File | Change |
|------|--------|
| `src/app/(auth)/login/page.tsx` | Add tabs + InviteCodeForm component |
| `src/components/auth/InviteCodeForm.tsx` | New component |
| `src/app/api/invite/route.ts` | Replace inviteUserByEmail with signInWithOtp + pending_invites insert |
| `src/app/api/profile/init/route.ts` | New route |
| `src/app/api/auth/callback/invite/route.ts` | Delete |
| Supabase dashboard | Create pending_invites table |

---

## Out of Scope

- Invite code expiry UI (Supabase OTP expires after 1 hour by default)
- Resend code flow (can be added later)
- Admin visibility into pending invites
