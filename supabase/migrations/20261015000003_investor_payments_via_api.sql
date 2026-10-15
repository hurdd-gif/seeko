-- Apply AFTER the API change that reads investor payments with the service
-- role is deployed; before that, investors' /payments list would come back empty.
-- Investors read through the API's service-role route with an
--    explicit investor-safe column list. Admins keep "Admins can manage
--    payments"; members keep "Members can read own payments".
drop policy if exists "Investors can read paid and pending payments" on public.payments;
drop policy if exists "Investors can read paid payments" on public.payments;

