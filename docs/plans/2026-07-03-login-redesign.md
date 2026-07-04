# Login Redesign — Paper reference + Google OAuth + Passkey login

Date: 2026-07-03 · Branch: `feat/light-theme-migration`
Reference: Paper file SK_DB, frame `27P-0` (https://app.paper.design/file/01KSQVTCXRWVYD4DSR5YFANJHB/1-0/27P-0)

## Goal

Rebuild `/login` to the Paper reference layout with three auth methods:

1. **Google** — `signInWithOAuth` (server callback already exists)
2. **Email / password** — existing `signInWithPassword` flow, preserved
3. **Passkey** — net-new first-factor WebAuthn login (existing passkey infra is payments-scoped)

The invite-code onboarding path must remain reachable (secondary link, not a tab).

## Decisions & assumptions (made autonomously — flag if wrong)

- **Page background** stays `--ov-bg` (#eeeeee) for consistency with every other
  auth page (set-password, onboarding, agreement); the reference's pure-white
  page is Phantom chrome, not a SEEKO token. Card geometry/typography follow the
  reference; ink colors follow the app light kit (#111 headings, #808080 muted).
- **Passkey flow is usernameless** (discoverable credentials): no email typed
  first — button → browser passkey sheet → session. Avoids leaking which emails
  have passkeys and matches the reference's one-tap pill pattern.
- **Challenge storage**: short-lived signed HttpOnly cookie (jose HS256,
  `PAYMENTS_JWT_SECRET` reused as HMAC secret, 5 min TTL) instead of the
  `passkey_challenges` table — the table is keyed by `user_id`, unknown before
  authentication. No schema change needed.
- **Session minting**: after assertion verification, server calls
  `service.auth.admin.generateLink({ type: 'magiclink', email })`, extracts
  `properties.hashed_token`, and immediately redeems it **server-side** via the
  anon Hono client `verifyOtp({ type: 'email', token_hash })` — which writes the
  Supabase session cookies onto the response. The token never reaches the
  browser. This is the standard Supabase custom-first-factor pattern and mirrors
  how the invite flow already uses `generateLink`.
- **Enrollment**: no separate login-passkey enrollment UI in this pass. Any
  passkey in `passkey_credentials` (enrolled today via the payments gate, where
  the user proved session + admin + payments token) is accepted for login.
  Passkeys are inherently phishing-resistant possession+biometric factors, so
  login-by-passkey is not a privilege escalation: it yields the same session
  the password would. A dedicated "add passkey" surface in Settings can follow.
- **Google provider** must be enabled in the Supabase dashboard (Auth →
  Providers → Google) with `<site>/api/auth/callback` NOT needed there (Supabase
  redirects to its own callback, then to our `redirectTo`); our `redirectTo`
  origin must be in the Auth allow-list. Config task, not code.
- The reference's "Sign up or login" copy becomes **"Sign in to SEEKO"** —
  the studio is invite-only; there is no self-serve sign-up.

## Server design (`src/api-server/routes/auth.ts`)

Extend `createAuthCallbackRoutes()`'s file with a new `createPasskeyLoginRoutes()`
mounted at `/api/auth` in `app.ts` (alongside the callback routes):

- `POST /api/auth/passkey/options` — unauthenticated.
  `generateAuthenticationOptions({ rpID, userVerification: 'required', allowCredentials: [] })`
  (empty list = discoverable). Sets `login-passkey-challenge` cookie: HS256 JWT
  `{ challenge }`, 5 min, HttpOnly, Secure (prod), SameSite=Strict,
  path `/api/auth/passkey`. Returns options JSON.
- `POST /api/auth/passkey/verify` — unauthenticated. Body `{ assertion }`.
  1. Read + verify challenge cookie (reject if missing/expired), then clear it.
  2. Look up `passkey_credentials` by `credential_id = assertion.id` (service
     role) — includes `user_id`.
  3. `verifyAuthenticationResponse` (same params as payments variant,
     `requireUserVerification: true`).
  4. Clone check: non-zero counter must increase, else delete credential and
     401 `untrusted-device` (same policy as payments).
  5. Update `counter` + `last_used_at`.
  6. `service.auth.admin.getUserById(user_id)` → email;
     `generateLink(magiclink)` → `hashed_token`; anon Hono client
     `verifyOtp({ type: 'email', token_hash })` sets session cookies.
  7. Return `{ success: true }`.
- Rate limit: reuse the in-memory sliding-window pattern from payments
  (5 attempts / 15 min) keyed by IP for `verify`.

RP config from `getRpConfig(origin)` in `src/lib/payments-passkey.ts` (shared).

## UI design (`src/components/auth/LoginForm.tsx` + `src/rr-app/routes/login.tsx`)

Layout per reference frame 27P-0, adapted to app tokens:

- **Route shell**: `--ov-bg` page; top bar (absolute, px-6/10 py-6/8): left =
  SEEKO S-mark (28px) + "Studio" (#686868, 15px); right = "Help & Support"
  (circled-? icon + label, mailto admin). Bottom-center legal footnote:
  "Access is invite-only. By signing in you agree to the SEEKO Studio NDA."
  (14px, #969696, max-w-[300px], centered).
- **Card**: max-w-[420px], white, `rounded-2xl` (concentric with 16px inner
  pills), hairline `border-black/[0.07]` + `shadow-seeko`, p-8 → 40px vertical
  rhythm via space/gap. Content:
  1. 64px circular badge `#525252` with white S-mark (`/seeko-s.png`), centered
  2. Heading "Sign in to SEEKO" — 22px Inter 600, tracking −0.02em, #111
  3. Subcopy — 15px #808080, centered: "Your studio dashboard for tasks, docs, and payments"
  4. Provider pills (stacked, gap-2, both h-12 w-full rounded-2xl bg-[#f1f1f1]
     hover:bg-[#eaeaea] active:scale-[0.98], 600 15px #3a3a3a):
     - Google G (inline SVG, official colors) — "Continue with Google"
     - Fingerprint icon — "Continue with passkey" (hidden if
       `!window.PublicKeyCredential`)
  5. Divider: hairline + "or" (12px #b3b3b3)
  6. Email + Password fields (existing `LIGHT_INPUT` kit) + black pill submit
     (`BTN_PRIMARY`, h-10) "Sign in"
  7. Error slot (shared by all methods, `#d4503e` tint style, aria-live)
  8. Footer link: "Have an invite code?" → swaps card body to
     `<InviteCodeForm />` (AnimatePresence, with "Back to sign in" link)
- **Motion**: keep the storyboard pattern (stage integer + TIMING map), re-staged:
  card 150 → badge/heading 300 → subcopy 420 → pills 540 → divider/fields 660 →
  button 780. Springs from `@/lib/motion`. Tab-pill layoutId animation is
  removed with the tabs.
- **Behaviors**:
  - Google: `signInWithOAuth({ provider: 'google', options: { redirectTo:
    `${origin}/api/auth/callback?next=/tasks` } })`; button shows spinner while
    redirecting. On return with `?error=auth_callback_failed`, show inline error
    (the route currently ignores this param — fixed here).
  - Passkey: options → `startAuthentication({ optionsJSON })` → verify →
    `router.push('/tasks')`. `NotAllowedError` (user cancel) = silent reset,
    no error banner. `untrusted-device` gets a specific message.
  - Email/password: unchanged (`signInWithPassword` → `/tasks`).

## Testing

- Server (TDD, new `src/api-server/__tests__/auth-passkey.test.ts`, modeled on
  payments-routes tests): options sets cookie + returns challenge; verify
  rejects missing cookie / unknown credential / failed verification; happy path
  calls generateLink + verifyOtp and returns success; clone-counter regression
  deletes credential and 401s.
- UI (`src/rr-app/routes/__tests__/login.test.tsx`, updated): heading, three
  method affordances (Google pill, passkey pill, email+password+submit), invite
  link swaps to original InviteCodeForm copy, callback-error param renders
  banner.
- Baseline: suite is 95/97 (two legacy `next/server` route tests expected-red).

## Out of scope

- Login-passkey enrollment UI in Settings (follow-up)
- Redirect-to-login route guard for unauthenticated app pages (separate concern;
  today pages render inline sign-in cards)
- Supabase dashboard Google-provider configuration (manual step for karti)
