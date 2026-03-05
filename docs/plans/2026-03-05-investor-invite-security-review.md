# Security review: investor invite + auto role from invite

**Date:** 2026-03-05  
**Scope:** Invite flow, profile init, `handle_new_user` trigger, investor routes, department validation.

## Summary

- **Invite API** and **profile/init** are correctly gated; **handle_new_user** uses only auth data. One hardening change applied: **department** is now validated against the enum before storing in `pending_invites` so the trigger never receives an invalid value.

## Findings

### 1. Invite API (`POST /api/invite`)

| Check | Status |
|-------|--------|
| Auth required | ✅ Returns 401 if no user |
| Admin-only | ✅ Checks `profile.is_admin`, returns 403 otherwise |
| Rate limit | ✅ 5 req/hour per IP (note: `x-forwarded-for` is spoofable; acceptable for single instance) |
| Email | ✅ Required; no format validation (Supabase/OTP will fail or send to invalid address) |
| Department | ✅ **Hardened:** only allowed enum values stored; invalid/empty becomes `null` |
| Role flags | ✅ `isContractor` / `isInvestor` coerced with `?? false`; no injection |

### 2. Profile init (`POST /api/profile/init`)

| Check | Status |
|-------|--------|
| Auth required | ✅ Returns 401 if no user |
| Scope | ✅ Updates only current user (`eq('id', user.id)`) |
| Invite lookup | ✅ By `user.email`; user can only consume their own invite |

### 3. `handle_new_user` trigger

| Check | Status |
|-------|--------|
| Input | ✅ No user-controlled input; uses `new` from `auth.users` |
| Search path | ✅ `set search_path = ''` |
| Invalid department | ✅ Mitigated by invite API validation; trigger cast would otherwise throw on bad enum |

### 4. Investor routes (e.g. `GET /api/investor/export-summary`)

| Check | Status |
|-------|--------|
| Auth required | ✅ Returns 401 if no user |
| Access control | ✅ Returns 403 unless `profile.is_investor || profile.is_admin` |

## Change made

- **Invite route:** `department` is validated against `VALID_DEPARTMENTS` (matches `public.department` enum). Invalid or empty values are stored as `null`, so the trigger’s `(inv.department::public.department)` never receives a bad value and signup cannot fail due to invalid department.

## Recommendations (optional / later)

- Consider validating email format or domain before sending OTP.
- If you scale horizontally, replace in-memory rate limit with e.g. Upstash.
