-- Close the client-writable authorization surface on profiles, and stop the
-- browser being able to forge audit/notification rows.
--
-- Postgres RLS is ROW-level, not COLUMN-level. The "Users can update own
-- profile" policy (using/with check `auth.uid() = id`) says WHICH ROW you may
-- update — it says nothing about WHICH COLUMNS. `authenticated` held UPDATE on
-- every column of profiles, so any signed-in user could rewrite any field of
-- their own row straight from the browser with the anon key.
--
-- is_admin / is_contractor / is_investor were already saved by the
-- profiles_block_privilege_escalation trigger, so there was no admin
-- escalation. But nothing guarded the other authz-bearing columns:
--
--   department        — src/lib/docs-index.ts feeds profiles.department into
--                       isDocLocked(); the server only blanks content when the
--                       doc is locked. Self-assigning a department therefore
--                       returned the full body of department-restricted docs.
--   nda_accepted_at   — src/api-server/routes/agreement.ts treats a non-null
--   nda_signer_name     value as "already signed". A user could self-stamp the
--   nda_signer_address  NDA and forge the signer/ip/user-agent record — the very
--   nda_ip              fields that exist to make the attestation evidentiary.
--   nda_user_agent
--   role              — spoofable job title.
--   id, created_at    — no reason for a client to touch either.
--
-- The fix is column-level GRANTs, which is the only mechanism in Postgres that
-- can express "you may edit your row, but not these fields". RLS decides the
-- row; the grant decides the column. You need both.
--
-- Least privilege, stated positively: the browser may write exactly the columns
-- the live UI writes, and nothing else. Everything else moves behind the
-- service role, which bypasses RLS and column grants alike.

-- ── profiles ────────────────────────────────────────────────────────────────
-- anon gets nothing: an anonymous caller has no profile row to update. (The
-- policy already denied it — auth.uid() is null — but the grant should not be
-- the thing we are relying on to be unreachable.)
revoke update on public.profiles from anon;
revoke update on public.profiles from authenticated;

-- INSERT was granted to both roles even though no INSERT policy exists, so RLS
-- was the only thing standing between a client and a hand-rolled profile row.
-- Rows are created by handle_new_user (SECURITY DEFINER, unaffected by grants).
revoke insert on public.profiles from anon;
revoke insert on public.profiles from authenticated;

-- Columns the CURRENTLY DEPLOYED client writes. `email`, `must_set_password`
-- and `onboarded` are granted here only because production is still running the
-- client that writes them directly; the follow-up migration
-- (20260713190001_revoke_client_email_password_writes.sql) removes them once
-- OnboardingForm and SetPasswordForm have shipped their move to the API. Do not
-- add a column back here without checking why the browser needs to own it.
grant update (
  display_name,
  avatar_url,
  timezone,
  paypal_email,
  tour_completed,
  last_seen_at,
  onboarded,          -- retired by the follow-up migration
  email,              -- retired by the follow-up migration
  must_set_password   -- retired by the follow-up migration
) on public.profiles to authenticated;

-- ── activity_log ────────────────────────────────────────────────────────────
-- The policy was `with check (auth.role() = 'authenticated')` — i.e. any signed
-- in user could insert ANY activity row: any actor, any task, any action. The
-- audit trail was browser-writable.
--
-- Nothing legitimate is lost. Every real writer is either a SECURITY DEFINER
-- trigger (tasks_audit_insert/update/delete, task_milestone_audit_insert/delete,
-- log_comment_activity — all of which run as the function owner and bypass RLS
-- and grants entirely) or a service-role API route. The only browser-side
-- inserts left in the tree are in TaskDetail.tsx / TaskList.tsx, which are dead
-- Next-era components: nothing in src/rr-app/ mounts them.
drop policy if exists "Authenticated users can insert activity" on public.activity_log;
revoke insert on public.activity_log from anon;
revoke insert on public.activity_log from authenticated;

-- UPDATE was granted too, with no UPDATE policy to authorize it — inert today,
-- but it means the day someone adds an UPDATE policy the audit log silently
-- becomes rewritable. An append-only log should not be updatable at all.
revoke update on public.activity_log from anon;
revoke update on public.activity_log from authenticated;

-- ── notifications ───────────────────────────────────────────────────────────
-- The INSERT policy was `with check (true)` for authenticated — no user_id
-- scoping at all, so any user could plant a notification in ANY other user's
-- inbox. That is an in-app phishing primitive: a forged, system-looking
-- notification with an attacker-chosen title, body and link.
--
-- Reads and read-receipts are untouched: "Users can read own notifications" and
-- "Users can update own notifications" are both correctly scoped to
-- auth.uid() = user_id. Every real insert (comment fan-out, /api/profile/init)
-- is service-role.
drop policy if exists "Authenticated users can create notifications" on public.notifications;
revoke insert on public.notifications from anon;
revoke insert on public.notifications from authenticated;

-- The UPDATE grant covered every column, so a user could rewrite the title,
-- body and link of a notification already sitting in their own inbox. Only they
-- can see it, so this is self-deception rather than a real attack — but the
-- client has no business writing those columns, and `read` is the only one
-- NotificationBell ever sets (`{ read: true }`, both call sites). Grant exactly
-- that. The row-scoping policy still does the "own inbox only" half.
revoke update on public.notifications from anon;
revoke update on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;

-- ── task_comment_attachments ────────────────────────────────────────────────
-- `with check (true)` let any authenticated user attach a row to any comment,
-- including comments on tasks they never touched. The only real writer is the
-- upload route (src/api-server/routes/tasks.ts), which uses the service role.
--
-- The permissive SELECT (`using (true)`) stays deliberately: the client reads
-- attachments embedded in its comment query (TaskActivityThread), and tasks and
-- comments are already readable by every authenticated user, so scoping this
-- alone would buy nothing while breaking the thread.
drop policy if exists "Authenticated can insert comment attachments" on public.task_comment_attachments;
revoke insert on public.task_comment_attachments from anon;
revoke insert on public.task_comment_attachments from authenticated;

-- Same inert-but-latent UPDATE grant as activity_log: granted, with no policy
-- to authorize it. Revoke rather than leave it primed.
revoke update on public.task_comment_attachments from anon;
revoke update on public.task_comment_attachments from authenticated;

-- ── profiles.email becomes server-owned ─────────────────────────────────────
-- profiles.email was never populated at signup — handle_new_user did not copy
-- it — which is exactly why OnboardingForm ended up writing it from the browser
-- off a client-supplied prop. Populate it from auth.users, which is the only
-- authoritative source, so the column no longer needs a client writer at all.
--
-- SECURITY DEFINER (unchanged): the function runs as its owner, so the column
-- grants revoked above do not apply to it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  inv record;
begin
  select pi.is_investor, pi.is_contractor, pi.department, pi.email
    into inv
    from public.pending_invites pi
    where lower(trim(pi.email)) = lower(trim(new.email))
    limit 1;

  insert into public.profiles (
    id, display_name, email, onboarded, tour_completed,
    is_investor, is_contractor, department
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email),
    new.email,
    0,
    0,
    coalesce(inv.is_investor, false),
    coalesce(inv.is_contractor, false),
    (inv.department::public.department)
  );

  if found then
    delete from public.pending_invites where email = inv.email;
  end if;

  return new;
end;
$function$;

-- Backfill, and correct any row whose email was already drifted or spoofed.
-- Only `email` changes, so profiles_block_privilege_escalation (which fires on
-- BEFORE UPDATE but only objects to is_admin/is_contractor/is_investor changes)
-- lets this through.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;
