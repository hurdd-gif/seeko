-- Update handle_new_user to: delete pending_invites row after applying, and match email case-insensitively.

create or replace function public.handle_new_user()
returns trigger as $$
declare
  inv record;
begin
  select pi.is_investor, pi.is_contractor, pi.department, pi.email
    into inv
    from public.pending_invites pi
    where lower(trim(pi.email)) = lower(trim(new.email))
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

  if found then
    delete from public.pending_invites where email = inv.email;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = '';
