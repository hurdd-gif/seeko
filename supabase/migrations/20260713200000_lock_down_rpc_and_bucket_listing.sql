-- Two findings from the Supabase security advisors.
--
-- ── 1. increment_verification_attempt was an anon-callable RPC ───────────────
--
-- The function is SECURITY DEFINER, had NO `SET search_path`, and returned
-- SETOF external_signing_invites — the whole invite row, RLS bypassed. And it
-- was reachable by `anon` at /rest/v1/rpc/increment_verification_attempt.
--
-- Two problems, one fix each:
--
-- (a) Mutable search_path on a SECURITY DEFINER function is the classic
--     privilege-escalation vector: the body referenced `external_signing_invites`
--     unqualified, so whoever controls the search_path chooses which table the
--     owner's privileges get applied to. Pinning search_path to '' and
--     schema-qualifying the reference removes the ambiguity entirely.
--
-- (b) No browser client has any business calling this. All three real callers —
--     routes/invoice.ts, routes/doc-share.ts, routes/external-signing.ts — go
--     through service.rpc(), i.e. the service role. Exposed to anon it is an
--     abuse primitive: burn a pending invite's verification_attempts up to the
--     cap to lock out the legitimate signer, and read back the invite row.
--
-- NOTE on the revoke: Postgres grants EXECUTE on functions to PUBLIC by default,
-- and this function's ACL confirmed it (`=X/postgres`). Revoking from anon and
-- authenticated ALONE would be a no-op — they would inherit EXECUTE straight
-- back from PUBLIC. The revoke from public is the one that actually closes it.
-- service_role holds its own explicit grant and is deliberately untouched.

create or replace function public.increment_verification_attempt(
  p_token text,
  p_purpose text,
  p_max_attempts integer
)
returns setof public.external_signing_invites
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return query
  update public.external_signing_invites
  set verification_attempts = verification_attempts + 1
  where token = p_token
    and purpose = p_purpose
    and status = 'pending'
    and verification_attempts < p_max_attempts
  returning *;
end;
$function$;

revoke execute on function public.increment_verification_attempt(text, text, integer) from public;
revoke execute on function public.increment_verification_attempt(text, text, integer) from anon;
revoke execute on function public.increment_verification_attempt(text, text, integer) from authenticated;

-- ── 2. Public storage buckets allowed listing ───────────────────────────────
--
-- `avatars` and `bug-reports` are PUBLIC buckets. A public bucket serves its
-- object URLs (/storage/v1/object/public/...) without consulting any policy —
-- that is what makes it public. A broad SELECT policy on storage.objects does
-- NOT enable that; what it enables is LISTING the bucket. So these policies were
-- granting enumeration and nothing the app needed.
--
-- bug-reports: dropped outright. It is written only by routes/workflow.ts on the
-- service role (which bypasses policies) and read only via getPublicUrl(), which
-- merely builds a URL string and never touches the database. The policy let
-- anyone — including anon, unauthenticated — enumerate and pull every user's bug
-- report screenshot. Those are screenshots of the running app, so they can carry
-- other people's data. Nothing legitimate regresses; the screenshots stay
-- reachable by their public URL for anyone the link is shared with.
drop policy if exists "Public read for bug report screenshots" on storage.objects;

-- avatars: narrowed rather than dropped. The only .list() is in routes/admin.ts
-- under the service role, but browsers upload with { upsert: true }, and an
-- upsert can consult SELECT while deciding insert-vs-update. Every uploader is
-- signed in, so scoping the read to `authenticated` keeps that path intact while
-- ending anonymous enumeration of the team's user ids and avatar images.
-- getPublicUrl() is unaffected either way — avatars still render for everyone.
drop policy if exists "Anyone can read avatars" on storage.objects;

create policy "Authenticated can read avatars"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'avatars');
