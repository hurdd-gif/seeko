-- Payment status enum
create type public.payment_status as enum ('pending', 'paid', 'cancelled');

-- Payments table
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  amount      decimal not null,
  currency    text not null default 'USD',
  description text,
  status      public.payment_status not null default 'pending',
  paid_at     timestamptz,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz default now()
);

create index payments_recipient_id_idx on public.payments(recipient_id);
create index payments_status_idx on public.payments(status);

alter table public.payments enable row level security;

create policy "Admins can manage payments"
  on public.payments for all
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true)
  with check ((select is_admin from public.profiles where id = auth.uid()) = true);

create policy "Investors can read paid payments"
  on public.payments for select
  to authenticated
  using (
    (select is_investor from public.profiles where id = auth.uid()) = true
    and status = 'paid'
  );

-- Payment line items
create table public.payment_items (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  task_id    uuid references public.tasks(id) on delete set null,
  label      text not null,
  amount     decimal not null
);

create index payment_items_payment_id_idx on public.payment_items(payment_id);

alter table public.payment_items enable row level security;

create policy "Admins can manage payment items"
  on public.payment_items for all
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true)
  with check ((select is_admin from public.profiles where id = auth.uid()) = true);

-- New columns on existing tables
alter table public.profiles add column if not exists paypal_email text;
alter table public.tasks add column if not exists bounty decimal;
