-- FOLLOW-UP to 20260713190000_lock_down_client_authz_writes.sql.
--
-- ⚠️  DO NOT APPLY THIS UNTIL THE CLIENT THAT STOPS WRITING THESE COLUMNS IS
--     DEPLOYED TO RENDER. Applying it against the old client breaks onboarding
--     and the set-password ceremony for every invited user.
--
-- The first migration had to keep three columns writable from the browser,
-- because the deployed client still wrote them directly:
--
--   email              — OnboardingForm sent it from a prop
--   onboarded          — OnboardingForm set it to 1 on submit
--   must_set_password  — SetPasswordForm cleared it after setting a password
--
-- All three are authorization state, not preference state. `onboarded` and
-- `must_set_password` are the flags that decide whether a user is held on the
-- onboarding / set-password screens, so a client that can write them can walk
-- straight past both — an invited user could skip the password ceremony and
-- keep using their temporary invite credentials. `email` is identity, and the
-- only authoritative copy lives in auth.users.
--
-- The client-side writes are now gone:
--   OnboardingForm  → POST /api/profile/onboarding     (sets email from the
--                     session + onboarded, service role)
--   SetPasswordForm → POST /api/profile/password-complete  (clears the flag on
--                     the CALLER's row; identity from the session, no body)
--   handle_new_user → now populates profiles.email at signup (migration 190000)
--
-- so the grant can go. Re-granting UPDATE from scratch is the clearest way to
-- state the end result rather than diffing against the previous grant.

revoke update on public.profiles from authenticated;

grant update (
  display_name,
  avatar_url,
  timezone,
  paypal_email,
  tour_completed,
  last_seen_at
) on public.profiles to authenticated;

-- Final state: the browser may edit six presentation/preference columns of its
-- OWN row (RLS still enforces the row). Every column that carries authorization
-- meaning — email, onboarded, must_set_password, department, role, is_admin,
-- is_contractor, is_investor, nda_* — is server-only, reachable exclusively
-- through the service role behind an authenticated API route.
