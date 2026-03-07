-- Fix privilege escalation trigger to check current_user (Postgres role) instead of JWT claim.
-- PostgREST sets the Postgres role to 'service_role' for service key requests,
-- but request.jwt.claim.role may not be set in all PostgREST versions.

create or replace function public.profiles_block_privilege_escalation()
returns trigger as $$
begin
  if (old.is_admin is distinct from new.is_admin
      or old.is_contractor is distinct from new.is_contractor
      or old.is_investor is distinct from new.is_investor)
     and current_user <> 'service_role'
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may update is_admin, is_contractor, is_investor'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';
