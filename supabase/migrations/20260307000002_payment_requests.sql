-- Team members can INSERT their own payment requests (pending only, recipient = self)
create policy "Members can insert own payment requests"
  on public.payments for insert
  to authenticated
  with check (
    recipient_id = auth.uid()
    and created_by = auth.uid()
    and status = 'pending'
  );

-- Team members can read their own payments (any status)
create policy "Members can read own payments"
  on public.payments for select
  to authenticated
  using (recipient_id = auth.uid());

-- Team members can insert payment items for their own payments
create policy "Members can insert own payment items"
  on public.payment_items for insert
  to authenticated
  with check (
    (select recipient_id from public.payments where id = payment_id) = auth.uid()
    and (select status from public.payments where id = payment_id) = 'pending'
  );

-- Team members can read payment items for their own payments
create policy "Members can read own payment items"
  on public.payment_items for select
  to authenticated
  using (
    (select recipient_id from public.payments where id = payment_id) = auth.uid()
  );
