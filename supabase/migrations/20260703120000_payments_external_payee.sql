-- Manual payments to external payees (e.g. "Anthropic — Claude") that have no
-- profile and no invoice flow. recipient_id is already nullable (external
-- invoices, 20260310100000); payee_name is the display identity for rows
-- created directly by an admin with no profile and no invite.
alter table public.payments add column if not exists payee_name text;

-- A payment can't be both a team payment and an external-payee payment.
alter table public.payments add constraint payments_payee_not_both
  check (recipient_id is null or payee_name is null);

-- Every payment must carry at least one identity: a profile (team), a
-- payee name (manual external), or a recipient email (invoice flow).
alter table public.payments add constraint payments_payee_identity
  check (recipient_id is not null or payee_name is not null or recipient_email is not null);
