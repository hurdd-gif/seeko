-- Fix: remove SECURITY DEFINER so current_user reflects the PostgREST role.
-- Also check request.jwt.claims JSON as fallback for newer PostgREST versions.

create or replace function public.profiles_block_privilege_escalation()
returns trigger as $$
begin
  if (old.is_admin is distinct from new.is_admin
      or old.is_contractor is distinct from new.is_contractor
      or old.is_investor is distinct from new.is_investor)
     and current_user <> 'service_role'
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'Only service role may update is_admin, is_contractor, is_investor'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql set search_path = '';
