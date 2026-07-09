alter table public.payments
  add column if not exists refund_amount decimal not null default 0,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_note text;

alter table public.payments
  drop constraint if exists payments_refund_amount_bounds;

alter table public.payments
  add constraint payments_refund_amount_bounds
  check (refund_amount >= 0 and refund_amount <= amount);
