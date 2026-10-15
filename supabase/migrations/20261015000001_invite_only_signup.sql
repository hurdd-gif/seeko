-- Invite-only signup. Before this, any Google sign-in created an auth user and
-- handle_new_user gave it a plain team-member profile (no investor/contractor
-- flag) = full dashboard access. Every legitimate account is created by the
-- admin invite route, which inserts pending_invites BEFORE generateLink, so a
-- signup with no matching invite is rejected and the auth.users insert rolls back.
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

  if not found then
    raise exception 'signup requires an invite' using errcode = '42501';
  end if;

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

  delete from public.pending_invites where email = inv.email;

  return new;
end;
$function$;
