---
name: seeko-payments-flow-auditor
description: Audit SEEKO Studio payments workflows. Use when work touches payments, refunds, partial refunds, manual payment entry, payment requests, invoice requests, contractor deadlines, passkey gates, investor payment visibility, payment notifications, payment API routes, or related Supabase migrations and RLS policies.
---

# SEEKO Payments Flow Auditor

## Purpose

Use this skill to keep SEEKO payment behavior consistent across UI, API, Supabase data, notifications, and role boundaries.

## Key Files

Start with these areas, then expand by search:

- `src/components/dashboard/PaymentsAdmin.tsx`
- `src/components/dashboard/PaymentsInvestor.tsx`
- `src/components/dashboard/PaymentCreateDialog.tsx`
- `src/components/dashboard/PaymentRequestDialog.tsx`
- `src/components/dashboard/PaymentsPasskeyGate.tsx`
- `src/components/dashboard/InvoiceRequestForm.tsx`
- `src/rr-app/routes/payments.tsx`
- `src/rr-app/routes/investor-payments.tsx`
- `src/rr-app/routes/invoice.tsx`
- `src/rr-app/clients/invoice-client.tsx`
- `src/api-server/routes/payments.ts`
- `src/api-server/routes/invoice.ts`
- `src/api-server/payments-auth.ts`
- `src/lib/payments-index.ts`
- `src/lib/payments-passkey.ts`
- `src/lib/invoice-request.ts`
- `supabase/migrations/*payment*`
- `supabase/migrations/*invoice*`

## Audit Workflow

1. Classify the change:
   - manual admin-created payment
   - contractor payment request
   - investor-visible payment history
   - invoice request or external invoice route
   - refund or partial refund state
   - passkey/payment access gate
   - notification or activity-log behavior
2. Trace the end-to-end flow:
   - UI command and form validation
   - API route or client-side Supabase call
   - Supabase table, migration, and generated type
   - authorization and role boundary
   - notification/activity side effect
   - list/detail display for admin and investor users
   - empty, loading, error, and success states
3. Review security boundaries:
   - payment writes must not trust client-supplied role claims alone
   - service-role operations must stay server-side
   - passkey/session checks must cover the protected action, not only the page shell
   - investor views must not expose admin-only notes, hashes, or internal audit data
4. Review data integrity:
   - refund and partial-refund states must be representable in the DB and UI
   - totals should not double-count refunded amounts
   - contractor deadline logic should not silently mutate payment history
   - currency, dates, and status labels should format consistently
   - optimistic UI must roll back on API or Supabase errors
5. Search for stale assumptions:

```bash
grep -R "payment\\|refund\\|invoice\\|passkey\\|PAYMENTS_" -n src supabase docs
```

6. Pair with `seeko-supabase-mutation-reviewer` when writes or RLS change, and with `seeko-ui-regression-reviewer` when payment screens or dialogs change.

## Output

Lead with production risks:

- **Critical:** unauthorized payment write, broken passkey protection, incorrect totals, exposed sensitive data.
- **Important:** missing refund state, stale migration/types, broken notification, investor/admin visibility mismatch.
- **Polish:** copy, formatting, empty states, confirmation clarity.

For each finding, include the file, the affected flow, the current behavior, and the minimum fix.
