-- When an invited user signs up, set their profile from pending_invites so it's automatic
-- (no manual toggle or dependency on profile/init). Applies to all invite types:
--   - Investor:  is_investor=true
--   - Contractor: is_contractor=true
--   - Team member: department + is_contractor=false, is_investor=false
create or replace function public.handle_new_user()
returns trigger as $$
declare
  inv record;
begin
  select pi.is_investor, pi.is_contractor, pi.department
    into inv
    from public.pending_invites pi
    where pi.email = new.email
    limit 1;

  insert into public.profiles (id, display_name, onboarded, is_investor, is_contractor, department)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email),
    0,
    coalesce(inv.is_investor, false),
    coalesce(inv.is_contractor, false),
    (inv.department::public.department)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = '';
