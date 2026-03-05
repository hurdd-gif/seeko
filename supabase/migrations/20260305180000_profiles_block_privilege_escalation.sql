-- Prevent authenticated users from elevating their own role via direct profile UPDATE.
-- Only the service role (e.g. profile/init, invite flow) may set is_admin, is_contractor, is_investor.

create or replace function public.profiles_block_privilege_escalation()
returns trigger as $$
begin
  if (old.is_admin is distinct from new.is_admin
      or old.is_contractor is distinct from new.is_contractor
      or old.is_investor is distinct from new.is_investor)
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may update is_admin, is_contractor, is_investor'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists profiles_block_privilege_escalation_trigger on public.profiles;
create trigger profiles_block_privilege_escalation_trigger
  before update on public.profiles
  for each row execute procedure public.profiles_block_privilege_escalation();
