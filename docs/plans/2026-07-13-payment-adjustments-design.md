# Payment Adjustments — Design

**Date:** 2026-07-13
**Status:** Approved (design), not yet implemented
**Surface:** `/payments` (admin) — Recent payments list

## Problem

An admin can record a payout, but cannot correct one. If the recorded amount is
wrong (typo, price change, wrong invoice total), the only tools today are a
refund — which means something different — or a delete, which erases the record.

There is no way to say "this payout was actually $70, not $56," and keep the
trace of what it used to say.

## Decision summary

| Question | Decision |
|---|---|
| What does an adjustment mean? | **Restatement.** The payment's amount is corrected; it was always one payout. |
| What counts in totals? | **Only the current amount.** A $56 payment corrected to $70 reports $70 paid out, never $126. |
| Multiple adjustments? | **Full chain.** Every superseded amount stays visible. |
| Which payments? | **Paid only.** A pending amount is not money out the door. |
| Payment already refunded? | **Blocked.** A refund is computed against the amount; changing the amount under it can make the refund exceed the payment. |

## Data model

`payments.amount` continues to hold the **current, true** amount. This is the
load-bearing choice: every existing aggregate — `/api/payments/stats`, the
outflow chart, the People rail's pending totals — sums `amount` over
`status = 'paid'`, and none of them need to change or learn about supersession.

Superseded amounts move to a new history table. `amount` on `payments` is
`decimal`, so the history columns are `decimal` too — no type drift across the
join:

```sql
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
```

RLS mirrors `payments`: one admin-only `for all` policy, plus the same
read-only policy investors already have on paid payments, so a superseded
amount is never visible to someone who cannot see the payment itself.

**Grants make the table append-only.** The lesson from the July 13 authz
lockdown holds here: *RLS is row-level, not column-level, and a policy does not
substitute for a grant.* A history row that can be rewritten is not history, so
`update` and `delete` are revoked from `authenticated`, and `anon` gets nothing
at all. Rows can be appended (gated by the admin policy) and read; they cannot
be edited or removed. Deleting the parent payment still cascades — that is an FK
action, not a client grant.

### Atomicity and privilege

The write touches two tables (append history, update amount). Two sequential
`supabase-js` calls can half-fail and leave the ledger lying about itself, so it
is one Postgres function called in a single round trip:

```sql
adjust_payment(p_payment_id uuid, p_amount decimal, p_note text)
```

It reads the payment, re-checks every invariant server-side (status is `paid`,
no refund recorded, amount finite, positive, and actually different), appends
the `payment_adjustments` row with `previous_amount` **read from the row it is
about to update** — never from caller input — and updates `payments.amount`.
One transaction: both writes land or neither does.

The function is **security invoker** (the default), with `set search_path to ''`
and schema-qualified references. It deliberately is *not* `security definer`:
the payments API server holds the caller's own Supabase session (anon key +
cookie → the `authenticated` role), so today's `PATCH` is already gated by the
`payments` admin RLS policy rather than by a service-role bypass. An invoker
function inherits exactly that gate, keeps the same failure mode for a
non-admin, and adds no privilege-escalation surface. A definer function here
would bypass RLS and then have to re-implement the admin check by hand — more
code, weaker guarantee.

`adjusted_by` is passed by the route as `guard.auth.user.id`, the same id
`created_by` already stores. It is **not** derived from `auth.uid()` inside a
trigger: a trigger that stamps `auth.uid()` breaks the moment its writes move
behind a service-role seam, where `auth.uid()` is null. Stamp the actor from the
request, not the session.

## API

`PATCH /api/payments/:id` — already admin-gated via
`requireHonoPaymentsAdminToken` — accepts a new body shape:

```ts
{ amount: number; adjustment_note?: string | null }
```

The new branch sits beside the existing `refund_amount` branch and returns the
updated payment row, exactly as the refund branch does.

Rejections:

| Condition | Status | Message |
|---|---|---|
| `status !== 'paid'` | 409 | Only paid payments can be adjusted |
| `refund_amount > 0` | 409 | Remove the refund before adjusting |
| Amount not finite, `<= 0`, or unchanged | 400 | Enter a different, positive amount |
| Amount `> MAX_PAYMENT_AMOUNT` (50,000) | 400 | Same cap the create route already enforces |

Every one of these is enforced twice: in the route (for the message) and inside
`adjust_payment` (for the guarantee). The route's checks are a courtesy to the
UI; the function's are the contract.

`GET /api/payments` embeds the history alongside the line items:

```ts
.select('*, items:payment_items(*), adjustments:payment_adjustments(*)')
```

`Payment` gains `adjustments?: PaymentAdjustment[]` in `src/lib/types.ts`.

## Rendering

In **Recent payments**, an adjusted payment renders as:

```
[ADJ] Vector Gems   $70.00   Jul 13   ← live row: accent hue, ADJ marker, counts
      Vector Gems   $62.00   Jul 12   ← ghost: dimmed, superseded
      Vector Gems   $56.00   Jul 12   ← ghost: dimmed, original
```

- **The live row** keeps every affordance it has today: expandable, right-click
  peek menu, refund actions. It gains the brand accent hue (`#0d7aff` — the same
  accent "Paid" and "Approved" already use, not a new colour) and an `ADJ`
  marker.
- **Ghost rows** are render-only, derived from `previous_amount` on each
  adjustment, newest to oldest. No chevron, no peek menu, dimmed. They are a
  trace, not a payout: styling them identically to a live row would make the
  list read as two payments totalling $126, which is precisely the misreading
  the accounting model avoids.
- Ghost rows are **synthesised at render time** and never enter the `payments`
  array that the chart and the stat tiles sum. Supersession cannot leak into a
  total, by construction.
- A ghost row's date is its adjustment's `created_at` — the moment that amount
  stopped being true. Not `paid_at`, which never changes and would print the
  same date on every row in the stack.
- The adjustment note surfaces in the expanded drawer, alongside the line items,
  in the same full-width band the refund notice uses.

The peek menu gains an **Adjust amount** action beside the refund actions,
disabled with a reason when a refund is recorded. It opens an `AdjustDialog`
mirroring the existing `RefundDialog` (amount + optional note).

## Testing

**API** (`src/api-server/routes/__tests__/`):
- happy path: amount updated, history row written with the correct
  `previous_amount`, `adjusted_by` set
- rejects a `pending` payment (409)
- rejects a payment with a refund recorded (409)
- rejects a zero, negative, or unchanged amount (400)
- rejects a non-admin caller (existing guard)

**Client**:
- an adjusted payment renders one ADJ row plus N ghost rows, in newest-first order
- ghost rows expose no menu and no expander
- the array handed to the chart and the stat tiles contains only the live
  payment — the totals show the adjusted amount, never the sum

## Deployment

The dev server talks to the **live production database**, so applying this
migration is a live schema change. The user has given the go-ahead — *"once all
is finished do the migration."* Order matters:

1. Write the migration, the API branch, the types, the UI, and the tests.
2. Verify: `npm test` and the type-check pass; the UI renders against stubbed data.
3. **Then** apply the migration to the live project.

It is additive — a new table, a new function, no column dropped and no existing
row touched — so applying it before the client ships is safe: nothing reads
`payment_adjustments` until the new client is deployed.

## Out of scope

- Adjusting pending payments (edit/cancel those instead)
- Adjusting a refunded payment (blocked; clear the refund first)
- Adjusting the line items — this corrects the payout total only
