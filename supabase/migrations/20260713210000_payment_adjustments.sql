-- Payment adjustments — correcting a recorded payout without erasing what it said.
--
-- Model: RESTATEMENT. payments.amount always holds the current, true amount, so
-- every existing aggregate (payments/stats, the outflow chart, the People rail)
-- keeps summing exactly one number per payment and needs no change. Superseded
-- amounts append here.

create table public.payment_adjustments (
  id              uuid primary key default gen_random_uuid(),
  payment_id      uuid not null references public.payments(id) on delete cascade,
  previous_amount decimal not null,
  new_amount      decimal not null,
  note            text,
  adjusted_by     uuid not null references public.profiles(id),
  created_at      timestamptz not null default now()
);

create index payment_adjustments_payment_id_idx
  on public.payment_adjustments (payment_id, created_at desc);

alter table public.payment_adjustments enable row level security;

-- Mirrors the two policies on public.payments: admins manage, investors read
-- history only for payments they can already see.
create policy "Admins can manage payment adjustments"
  on public.payment_adjustments for all
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true)
  with check ((select is_admin from public.profiles where id = auth.uid()) = true);

create policy "Investors can read adjustments on paid payments"
  on public.payment_adjustments for select
  to authenticated
  using (
    (select is_investor from public.profiles where id = auth.uid()) = true
    and exists (
      select 1 from public.payments p
      where p.id = payment_id and p.status = 'paid'
    )
  );

-- RLS is ROW-level, not COLUMN-level, and a policy is not a grant. A history row
-- that can be rewritten is not history — so the table is append-only from the
-- client roles: rows can be inserted (gated by the admin policy above) and read,
-- never updated or deleted. Cascading deletes from public.payments still work:
-- referential actions run as the owner and are exempt from both grants and RLS.
revoke update, delete on public.payment_adjustments from authenticated;
revoke all on public.payment_adjustments from anon;

-- One function, one transaction: append the history row and move the amount, or
-- do neither. previous_amount is read from the row being updated, never from
-- caller input.
--
-- SECURITY INVOKER (the default) is deliberate. The payments API server holds the
-- caller's own Supabase session (anon key + cookie => the `authenticated` role),
-- so today's PATCH is already gated by the payments admin RLS policy rather than
-- by a service-role bypass. An invoker function inherits exactly that gate and
-- adds no privilege-escalation surface. search_path is pinned and every reference
-- schema-qualified regardless.
create or replace function public.adjust_payment(
  p_payment_id uuid,
  p_amount numeric,
  p_note text,
  p_actor uuid
)
returns public.payments
language plpgsql
set search_path to ''
as $function$
declare
  v_payment public.payments;
begin
  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;

  if v_payment.status <> 'paid' then
    raise exception 'Only paid payments can be adjusted' using errcode = 'P0001';
  end if;

  if coalesce(v_payment.refund_amount, 0) > 0 then
    raise exception 'Remove the refund before adjusting' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 50000 then
    raise exception 'Amount must be between $0.01 and $50,000.00' using errcode = 'P0001';
  end if;

  if p_amount = v_payment.amount then
    raise exception 'Enter a different amount' using errcode = 'P0001';
  end if;

  insert into public.payment_adjustments (
    payment_id, previous_amount, new_amount, note, adjusted_by
  ) values (
    p_payment_id,
    v_payment.amount,
    p_amount,
    nullif(btrim(coalesce(p_note, '')), ''),
    p_actor
  );

  update public.payments
  set amount = p_amount
  where id = p_payment_id
  returning * into v_payment;

  return v_payment;
end;
$function$;

-- Postgres grants EXECUTE to PUBLIC by default; revoking from anon alone would be
-- a no-op because it inherits straight back. The revoke from public is the one
-- that closes it. Only the signed-in admin path (and service_role, which holds its
-- own grant) can call this.
revoke execute on function public.adjust_payment(uuid, numeric, text, uuid) from public;
revoke execute on function public.adjust_payment(uuid, numeric, text, uuid) from anon;
grant execute on function public.adjust_payment(uuid, numeric, text, uuid) to authenticated;
