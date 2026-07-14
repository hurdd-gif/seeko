# Payment Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin correct the amount of a paid payment, keeping every superseded amount visible beneath the corrected one.

**Architecture:** Restatement accounting. `payments.amount` always holds the current, true amount, so every existing aggregate (stats route, outflow chart, People rail) keeps working untouched. Superseded amounts append to a new `payment_adjustments` table, written together with the amount update inside one Postgres function so the two can never half-land. The UI renders the live row with an accent hue and an `ADJ` marker, and synthesises one dimmed, render-only ghost row per historical amount below it — ghosts never enter the array anything sums.

**Tech Stack:** Supabase Postgres (RLS + plpgsql), Hono API server (`tsx`, port 8788), React 19 + Vite (port 5173), Tailwind v4, Vitest.

**Design doc:** `docs/plans/2026-07-13-payment-adjustments-design.md`

## Global Constraints

- **The dev server talks to the LIVE production database.** Never `curl` a mutating API route in dev — `DEV_AUTH_BYPASS` makes you a real admin, so a POST smoke test is a production admin write. Exercise mutations through the browser UI only.
- **Do not apply the migration until Task 6.** Everything else lands and passes first.
- The API server is plain `tsx` with **no watch** — restart it after editing anything under `src/api-server/**`. Client edits hot-reload.
- Run Vitest with cwd = `seeko-studio`, and never overlap two runs.
- **Test baseline is 6 pre-existing failures** (LightShell ×3, StudioHeaderActions.bell, investor-layout, payments). A run is green if it still shows exactly those 6 and none of yours.
- `npx tsc --noEmit` has pre-existing errors in `PaymentsAdmin.tsx` (`InputCopy value` × 2), `PaymentsChart.tsx`, and `icon-map.tsx`. Do not "fix" them; just do not add new ones.
- Colour comes from tokens — `seeko-accent`, `seeko-accent-ink` — never the raw hex `#0d7aff`. They carry their own dark-mode values.
- Money is `decimal` in Postgres and arrives as a string-ish number over PostgREST. Always wrap in `Number(...)` before arithmetic, as the existing rows do.
- Commit after each task. Do not push; do not open a PR.

---

### Task 1: Types and the migration file (written, not applied)

**Files:**
- Create: `supabase/migrations/20260713210000_payment_adjustments.sql`
- Modify: `src/lib/types.ts:222-248`

**Interfaces:**
- Consumes: nothing.
- Produces: SQL function `public.adjust_payment(p_payment_id uuid, p_amount numeric, p_note text, p_actor uuid) returns public.payments`; TS types `PaymentAdjustment` and `Payment.adjustments?: PaymentAdjustment[]`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260713210000_payment_adjustments.sql`:

```sql
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
```

- [ ] **Step 2: Add the types**

In `src/lib/types.ts`, add `adjustments` to `Payment` (after `items`, line ~239) and define `PaymentAdjustment` immediately after `PaymentItem`:

```ts
export type Payment = {
  // ...unchanged fields...
  items?: PaymentItem[];
  /**
   * Superseded amounts, newest first once sorted. The payment's own `amount` is
   * always the current one — these are history, and are never summed.
   */
  adjustments?: PaymentAdjustment[];
};

export type PaymentAdjustment = {
  id: string;
  payment_id: string;
  previous_amount: number;
  new_amount: number;
  note?: string | null;
  adjusted_by: string;
  created_at: string;
};
```

- [ ] **Step 3: Verify the types compile**

Run: `npx tsc --noEmit 2>&1 | grep -v "InputCopy\|PaymentsChart\|icon-map"`
Expected: no new errors (the four pre-existing ones are filtered out).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260713210000_payment_adjustments.sql src/lib/types.ts
git commit -m "feat(payments): payment_adjustments table, adjust_payment fn, types"
```

---

### Task 2: PATCH /api/payments/:id — the amount branch

**Files:**
- Modify: `src/api-server/routes/payments.ts:133-176` (the PATCH handler; add the branch above the refund branch)
- Modify: `src/api-server/routes/payments.ts:56-74` (GET /payments — embed adjustments)
- Test: `src/api-server/routes/__tests__/payment-adjustments.test.ts` (create)

**Interfaces:**
- Consumes: `public.adjust_payment(...)` from Task 1; `PaymentAdjustment` from Task 1.
- Produces: `PATCH /api/payments/:id` accepting `{ amount: number; adjustment_note?: string | null }` and returning the updated payment row; `GET /api/payments` rows now carry `adjustments`.

- [ ] **Step 1: Write the failing test**

Create `src/api-server/routes/__tests__/payment-adjustments.test.ts`. The PATCH handler calls `requireHonoPaymentsAdminToken` directly (it does not go through the injectable `paymentsAuthResolver`), so the guard module is mocked:

```ts
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rpc: vi.fn(),
  payment: { id: 'pay-1', status: 'paid', amount: 56, recipient_id: 'user-1', refund_amount: 0 } as Record<string, unknown> | null,
}));

vi.mock('../../payments-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../payments-auth')>()),
  requireHonoPaymentsAdminToken: mocks.auth,
}));
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
  getServiceClientAs: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
}));

import { createPaymentsRoutes } from '../payments';

function app() {
  return new Hono().route('/api', createPaymentsRoutes());
}

function patch(body: unknown) {
  return app().request('/api/payments/pay-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.payment = { id: 'pay-1', status: 'paid', amount: 56, recipient_id: 'user-1', refund_amount: 0 };
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: { id: 'pay-1', status: 'paid', amount: 70 }, error: null });
  mocks.auth.mockImplementation(async () => ({
    ok: true,
    auth: {
      user: { id: 'admin-1', email: 'admin@example.invalid' },
      isAdmin: true,
      isInvestor: false,
      tokenValid: true,
      supabase: {
        from: () => ({
          select: () => ({ eq: () => ({ single: async () => ({ data: mocks.payment, error: null }) }) }),
        }),
        rpc: mocks.rpc,
      },
    },
  }));
});

describe('PATCH /api/payments/:id — amount adjustment', () => {
  it('adjusts a paid payment and returns the updated row', async () => {
    const res = await patch({ amount: 70, adjustment_note: 'Invoice was short' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ amount: 70 });
    expect(mocks.rpc).toHaveBeenCalledWith('adjust_payment', {
      p_payment_id: 'pay-1',
      p_amount: 70,
      p_note: 'Invoice was short',
      p_actor: 'admin-1',
    });
  });

  it('stamps the actor from the request, not the session', async () => {
    await patch({ amount: 70 });
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_actor: 'admin-1', p_note: null });
  });

  it('rejects a pending payment', async () => {
    mocks.payment = { id: 'pay-1', status: 'pending', amount: 56, recipient_id: 'user-1', refund_amount: 0 };
    const res = await patch({ amount: 70 });
    expect(res.status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects a payment that already has a refund', async () => {
    mocks.payment = { id: 'pay-1', status: 'paid', amount: 56, recipient_id: 'user-1', refund_amount: 10 };
    const res = await patch({ amount: 70 });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'Remove the refund before adjusting' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([[0], [-5], [56], [50_001], [Number.NaN]])('rejects the amount %s', async (amount) => {
    const res = await patch({ amount });
    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('404s an unknown payment', async () => {
    mocks.payment = null;
    const res = await patch({ amount: 70 });
    expect(res.status).toBe(404);
  });

  it('rejects a non-admin caller', async () => {
    mocks.auth.mockImplementation(async () => ({ ok: false, error: 'Unauthorized', status: 401 }));
    const res = await patch({ amount: 70 });
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/api-server/routes/__tests__/payment-adjustments.test.ts`
Expected: FAIL — the amount branch does not exist, so the happy path falls through to the status branch and returns 400 `Status must be "paid" or "cancelled"`.

- [ ] **Step 3: Add the amount branch to the PATCH handler**

In `src/api-server/routes/payments.ts`, widen the body type and insert the branch **after** the `if (body.refund_amount !== undefined) { ... }` block and **before** the `if (body.status !== 'paid' && body.status !== 'cancelled')` check:

```ts
      const body = await c.req.json().catch(() => null) as {
        status?: 'paid' | 'cancelled';
        refund_amount?: number;
        refund_note?: string | null;
        amount?: number;
        adjustment_note?: string | null;
      } | null;
```

The `select` that loads `current` must also fetch the refund, so change line ~144:

```ts
      const { data: current } = await guard.auth.supabase
        .from('payments')
        .select('id, status, amount, recipient_id, refund_amount')
        .eq('id', id)
        .single();
      if (!current) return c.json({ error: 'Payment not found' }, 404);
```

Then the branch:

```ts
      // Amount adjustment — a restatement, not a second payout. adjust_payment
      // appends the history row and moves payments.amount inside one transaction,
      // so the ledger can never half-update. These checks are here for the
      // message; the function re-checks every one of them for the guarantee.
      if (body.amount !== undefined) {
        if (current.status !== 'paid') {
          return c.json({ error: 'Only paid payments can be adjusted' }, 409);
        }
        if (Number(current.refund_amount ?? 0) > 0) {
          return c.json({ error: 'Remove the refund before adjusting' }, 409);
        }

        const nextAmount = Number(body.amount);
        if (
          !Number.isFinite(nextAmount) ||
          nextAmount <= 0 ||
          nextAmount > MAX_PAYMENT_AMOUNT ||
          nextAmount === Number(current.amount)
        ) {
          return c.json({ error: ADJUST_ERROR }, 400);
        }

        const { data, error } = await guard.auth.supabase.rpc('adjust_payment', {
          p_payment_id: id,
          p_amount: nextAmount,
          p_note: body.adjustment_note?.trim() || null,
          p_actor: guard.auth.user.id,
        } as never);

        if (error || !data) {
          console.error('[hono payments/:id] adjust failed:', error);
          return c.json({ error: 'Failed to adjust payment' }, 500);
        }
        return c.json(data);
      }
```

Add the error constant beside `REFUND_ERROR` (line ~38):

```ts
const ADJUST_ERROR = 'Enter a different amount between $0.01 and $50,000.00';
```

- [ ] **Step 4: Embed adjustments in GET /payments**

In the `.get('/payments')` handler (line ~62), extend the select:

```ts
        .select('*, recipient:profiles!payments_recipient_id_fkey(id, display_name, avatar_url, department, paypal_email), items:payment_items(*), adjustments:payment_adjustments(*)')
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/api-server/routes/__tests__/payment-adjustments.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/api-server/routes/payments.ts src/api-server/routes/__tests__/payment-adjustments.test.ts
git commit -m "feat(payments): PATCH amount branch via adjust_payment, embed history in GET"
```

---

### Task 3: The adjusted row — accent hue, ADJ marker, ghost rows

**Files:**
- Modify: `src/components/dashboard/PaymentsAdmin.tsx:770-1059` (`PaidPaymentRow`)
- Test: `src/components/dashboard/__tests__/PaidPaymentRow.adjusted.test.tsx` (create)

**Interfaces:**
- Consumes: `Payment.adjustments` / `PaymentAdjustment` from Task 1.
- Produces: `PaidPaymentRow` renders one ADJ-marked live row plus N dimmed ghost rows. Task 4 adds the menu action that creates them.

- [ ] **Step 1: Write the failing test**

Create `src/components/dashboard/__tests__/PaidPaymentRow.adjusted.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Payment } from '@/lib/types';
import { PaidPaymentRow } from '../PaymentsAdmin';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const base: Payment = {
  id: 'pay-1',
  recipient_id: null,
  payee_name: 'Vector Gems',
  amount: 70,
  currency: 'USD',
  status: 'paid',
  paid_at: '2026-07-11T12:00:00.000Z',
  created_by: 'admin-1',
  created_at: '2026-07-11T12:00:00.000Z',
  items: [],
};

const adjusted: Payment = {
  ...base,
  adjustments: [
    { id: 'adj-1', payment_id: 'pay-1', previous_amount: 56, new_amount: 62, adjusted_by: 'admin-1', created_at: '2026-07-12T12:00:00.000Z', note: null },
    { id: 'adj-2', payment_id: 'pay-1', previous_amount: 62, new_amount: 70, adjusted_by: 'admin-1', created_at: '2026-07-13T12:00:00.000Z', note: 'Invoice was short' },
  ],
};

function row(payment: Payment) {
  return render(
    <PaidPaymentRow payment={payment} externalPaypalEmail={null} onAction={() => {}} />
  );
}

describe('PaidPaymentRow — adjusted payments', () => {
  it('marks an adjusted payment with ADJ and shows the current amount', () => {
    row(adjusted);
    expect(screen.getByText('ADJ')).toBeInTheDocument();
    expect(screen.getByText('$70.00')).toBeInTheDocument();
  });

  it('renders one ghost row per superseded amount, newest first', () => {
    row(adjusted);
    const ghosts = screen.getAllByTestId('adjustment-ghost');
    expect(ghosts).toHaveLength(2);
    expect(within(ghosts[0]).getByText('$62.00')).toBeInTheDocument();
    expect(within(ghosts[1]).getByText('$56.00')).toBeInTheDocument();
  });

  it('gives ghost rows no expander and no context menu', () => {
    row(adjusted);
    const ghost = screen.getAllByTestId('adjustment-ghost')[0];
    expect(within(ghost).queryByRole('button')).toBeNull();
  });

  it('leaves an unadjusted payment unmarked and ghost-free', () => {
    row(base);
    expect(screen.queryByText('ADJ')).toBeNull();
    expect(screen.queryAllByTestId('adjustment-ghost')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/dashboard/__tests__/PaidPaymentRow.adjusted.test.tsx`
Expected: FAIL — `PaidPaymentRow` is not exported from `PaymentsAdmin.tsx`.

- [ ] **Step 3: Export the row and derive the adjustment state**

In `src/components/dashboard/PaymentsAdmin.tsx`, change the declaration at line 770 to `export function PaidPaymentRow({` (the module already default-exports the page; a named export alongside it is harmless).

Add the derived state next to the existing refund derivations (after `const netAmount = ...`, line ~805):

```ts
  // Newest first. The payment's own `amount` is the current one; every
  // `previous_amount` here is a superseded reading, rendered but never summed.
  const adjustments = [...(payment.adjustments ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const isAdjusted = adjustments.length > 0;
  const latestAdjustmentNote = adjustments[0]?.note?.trim() || null;
```

- [ ] **Step 4: Tint the live row and add the ADJ marker**

Give the clickable `span` (line ~872) the accent wash when adjusted. Note both the resting and hover colours must be overridden together — a bare `hover:bg-wash-3` would wash the tint out on hover:

```tsx
        className={cn(
          'flex items-center justify-between py-3 px-5 w-full text-left transition-colors cursor-pointer',
          isAdjusted
            ? 'bg-seeko-accent/[0.05] hover:bg-seeko-accent/[0.09]'
            : 'hover:bg-wash-3'
        )}
```

Add the badge in the right-hand cluster, immediately **before** the existing refund `Badge` (line ~907):

```tsx
          {isAdjusted && (
            <Badge
              variant="outline"
              className="border-seeko-accent/25 bg-seeko-accent/10 text-[10px] font-medium text-seeko-accent-ink"
            >
              ADJ
            </Badge>
          )}
```

- [ ] **Step 5: Render the ghost rows**

Immediately **after** the closing `</span>` of the clickable row (line ~925, before the `<AnimatePresence>` that holds the expanded drawer), add:

```tsx
      {/* One ghost per superseded amount. Render-only: no chevron, no menu, no
          place in any array that gets summed. Dimmed and struck through because
          a ghost styled like a live row reads as a second payout — which is the
          exact misreading the restatement model exists to prevent. The date is
          the adjustment's, i.e. when this amount stopped being true; paid_at
          never moves and would print the same day on every row in the stack. */}
      {adjustments.map(adj => (
        <div
          key={adj.id}
          data-testid="adjustment-ghost"
          className="flex items-center justify-between gap-3 border-t border-wash-6 bg-surface-2 py-2.5 pl-16 pr-5"
        >
          <div className="min-w-0">
            <p className="truncate text-xs text-ink-faint">{compactTitle}</p>
            <p className="text-[11px] text-ink-faintest">Superseded</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs font-medium tabular-nums text-ink-faint line-through">
              {fmt(Number(adj.previous_amount))}
            </span>
            <span className="text-[11px] tabular-nums text-ink-faintest">
              {new Date(adj.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      ))}
```

`pl-16` (64px) puts the ghost's text on the same spine as the live row's title: 20px of row padding + a 32px avatar + the 12px gap.

- [ ] **Step 6: Surface the note in the drawer**

The drawer's outer condition (line ~933) must also open for a note-only adjustment. Change it to:

```tsx
            {(hasRefund || showPaypalEmail || latestAdjustmentNote || (payment.items && payment.items.length > 0)) && (
```

And add the note band as the **first** child inside that `<div className="border-t border-wash-6 bg-surface-3 text-xs">`, above the refund band:

```tsx
                {latestAdjustmentNote && (
                  <div className="bg-seeko-accent/[0.06] px-5 py-2.5 text-seeko-accent-ink">
                    <div className="flex items-center justify-between gap-3">
                      <span>Amount adjusted</span>
                      <span className="font-medium tabular-nums">
                        {fmt(Number(adjustments[0].previous_amount))} → {fmt(amount)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-seeko-accent-ink/75">{latestAdjustmentNote}</p>
                  </div>
                )}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/components/dashboard/__tests__/PaidPaymentRow.adjusted.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard/PaymentsAdmin.tsx src/components/dashboard/__tests__/PaidPaymentRow.adjusted.test.tsx
git commit -m "feat(payments): ADJ marker, accent hue, and dimmed ghost rows for adjusted payments"
```

---

### Task 4: The Adjust dialog and the peek-menu action

**Files:**
- Modify: `src/components/dashboard/PaymentsAdmin.tsx` (`PaidPaymentRow` — new state, `updateAmount`, menu button, dialog mount; new `AdjustDialog` component beside `RefundDialog` at line ~1061)
- Modify: `src/components/dashboard/PaymentsAdmin.tsx:18-22` (icon imports)
- Test: `src/components/dashboard/__tests__/PaidPaymentRow.adjusted.test.tsx` (extend)

**Interfaces:**
- Consumes: `PATCH /api/payments/:id { amount, adjustment_note }` from Task 2.
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

Append to `src/components/dashboard/__tests__/PaidPaymentRow.adjusted.test.tsx`:

```tsx
import { fireEvent, waitFor } from '@testing-library/react';

describe('PaidPaymentRow — adjust action', () => {
  it('offers Adjust amount in the peek menu on a paid payment', () => {
    const { container } = row(base);
    fireEvent.contextMenu(container.firstChild!);
    expect(screen.getByRole('button', { name: /adjust amount/i })).toBeInTheDocument();
  });

  it('disables Adjust amount when a refund is recorded', () => {
    const { container } = row({ ...base, refund_amount: 10 });
    fireEvent.contextMenu(container.firstChild!);
    expect(screen.getByRole('button', { name: /adjust amount/i })).toBeDisabled();
  });

  it('PATCHes the new amount and the note', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const onAction = vi.fn();

    const { container } = render(
      <PaidPaymentRow payment={base} externalPaypalEmail={null} onAction={onAction} />
    );
    fireEvent.contextMenu(container.firstChild!);
    fireEvent.click(screen.getByRole('button', { name: /adjust amount/i }));

    fireEvent.change(screen.getByLabelText(/new amount/i), { target: { value: '85' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Invoice was short' } });
    fireEvent.click(screen.getByRole('button', { name: /^save adjustment$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/payments/pay-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ amount: 85, adjustment_note: 'Invoice was short' }),
    })));
    await waitFor(() => expect(onAction).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  it('refuses to submit an unchanged amount', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = row(base);
    fireEvent.contextMenu(container.firstChild!);
    fireEvent.click(screen.getByRole('button', { name: /adjust amount/i }));
    fireEvent.change(screen.getByLabelText(/new amount/i), { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: /^save adjustment$/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/different amount/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/dashboard/__tests__/PaidPaymentRow.adjusted.test.tsx`
Expected: FAIL — no "Adjust amount" button in the menu.

- [ ] **Step 3: Add the icon import**

`src/components/dashboard/PaymentsAdmin.tsx` line 18-22:

```tsx
import {
  Users, CheckCircle2,
  CreditCard, Plus, ChevronDown, ChevronUp, ChevronLeft, Check, X as XIcon,
  FileText, RotateCw, Ban, Loader2, Pencil,
} from 'lucide-react';
```

- [ ] **Step 4: Add state and the mutation to PaidPaymentRow**

Beside the refund state (line ~784):

```ts
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
```

And beside `updateRefund` (after it closes, line ~840):

```ts
  async function updateAmount(amount: number, adjustment_note: string | null): Promise<boolean> {
    setAdjustLoading(true);
    try {
      const res = await fetch(`/api/payments/${payment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, adjustment_note }),
      });
      if (res.ok) {
        toast.success('Amount adjusted');
        onAction();
        return true;
      }
      const data = await res.json();
      toast.error(data.error ?? 'Failed to adjust amount');
      return false;
    } catch {
      toast.error('Network error');
      return false;
    } finally {
      setAdjustLoading(false);
    }
  }
```

- [ ] **Step 5: Add the menu action**

In the peek menu, as the **first** action button — above "Record partial refund" (line ~1010) — so the corrective action leads and the destructive ones follow:

```tsx
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-xs font-medium text-seeko-accent-ink transition-[background-color,transform] hover:bg-seeko-accent/10 active:scale-[0.98] disabled:opacity-50"
                onClick={() => { setRefundMenu(null); setAdjustOpen(true); }}
                disabled={adjustLoading || hasRefund}
                title={hasRefund ? 'Remove the refund before adjusting' : undefined}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-[9px] bg-seeko-accent/10">
                  <Pencil className="size-3.5" />
                </span>
                Adjust amount
              </button>
```

The menu's header copy (line ~1004) should reflect the amount's history rather than only the refund:

```tsx
              <div className="px-2.5 py-2">
                <p className="text-xs font-medium text-ink-body">{fmt(amount)}</p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {hasRefund
                    ? `${fmt(refundAmount)} refunded`
                    : isAdjusted
                      ? `Adjusted ${adjustments.length}×`
                      : 'No refund recorded'}
                </p>
              </div>
```

Mount the dialog beside `<RefundDialog ...>` at the end of the component (line ~1050):

```tsx
      <AdjustDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        current={amount}
        loading={adjustLoading}
        onSubmit={updateAmount}
      />
```

- [ ] **Step 6: Write AdjustDialog**

Add immediately after `RefundDialog` closes (line ~1145). It mirrors RefundDialog's shape — same `Dialog`, same `LIGHT_INPUT`, same re-seed-on-open effect — because the two are siblings in the same menu and should not feel like different products:

```tsx
/* ── Adjust Dialog (correct a recorded amount; the old one stays on the ledger) ── */
function AdjustDialog({ open, onOpenChange, current, loading, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: number;
  loading: boolean;
  onSubmit: (amount: number, note: string | null) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Re-seed each time it opens — `current` moves as adjustments land.
  useEffect(() => {
    if (open) {
      setAmount(String(current));
      setNote('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(amount);
    if (!amount.trim() || !Number.isFinite(parsed) || parsed <= 0 || parsed > 50_000) {
      setError('Enter an amount between $0.01 and $50,000.00.');
      return;
    }
    if (parsed === current) {
      setError('Enter a different amount — this is the current one.');
      return;
    }
    const ok = await onSubmit(parsed, note.trim() || null);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-sm" light>
      <DialogHeader>
        <DialogTitle>Adjust amount</DialogTitle>
        <p className="text-[13px] text-ink-muted">
          {fmt(current)} stays on the ledger as a superseded entry. Totals count only the new amount.
        </p>
      </DialogHeader>
      <DialogClose onClose={() => onOpenChange(false)} />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-body">New amount</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">$</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null); }}
              autoFocus
              className={`flex h-9 w-full pl-7 pr-3 text-sm tabular-nums focus-visible:outline-none ${LIGHT_INPUT} ${error ? 'border-danger focus-visible:ring-danger/30' : ''}`}
            />
          </div>
          {error && <span className="text-[11px] text-danger">{error}</span>}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-body">
            Reason <span className="font-normal text-ink-faint">(optional)</span>
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why the amount changed"
            className={`flex h-9 w-full px-3 text-sm focus-visible:outline-none ${LIGHT_INPUT}`}
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" className={DIALOG_CANCEL} onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" className={cn('gap-1.5', DIALOG_SAVE)} disabled={loading}>
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            Save adjustment
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
```

The `<span>` labels are inside `<label>`, so `getByLabelText(/new amount/i)` and `getByLabelText(/reason/i)` resolve — the same pattern `RefundDialog` uses.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/components/dashboard/__tests__/PaidPaymentRow.adjusted.test.tsx`
Expected: PASS — 8 tests.

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard/PaymentsAdmin.tsx src/components/dashboard/__tests__/PaidPaymentRow.adjusted.test.tsx
git commit -m "feat(payments): Adjust amount dialog + peek-menu action"
```

---

### Task 5: Full verification

**Files:** none changed unless a regression turns up.

- [ ] **Step 1: Full test suite**

Run: `npm test -- --run`
Expected: PASS except the **6 known pre-existing failures** (LightShell ×3, StudioHeaderActions.bell, investor-layout, payments). Any 7th failure is yours — fix it before continuing.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v "InputCopy\|PaymentsChart\|icon-map"`
Expected: empty.

- [ ] **Step 3: Confirm totals ignore ghosts**

Read `src/api-server/routes/payments.ts:325` (`GET /payments/stats`) and the outflow chart's input in `PaymentsAdmin.tsx`. Confirm both still sum `payment.amount` over the `payments` array and that nothing maps over `adjustments`. This is the whole safety property of the restatement model — verify it by reading, not by assuming.

- [ ] **Step 4: Commit if anything moved**

```bash
git add -A && git commit -m "test(payments): verification pass for adjustments"
```

---

### Task 6: Apply the migration and QA against live data

The user's go-ahead: *"once all is finished do the migration."* Tasks 1–5 must be green first. The migration is additive — new table, new function, no column dropped, no existing row touched — so applying it before the client redeploys is safe: nothing reads `payment_adjustments` until then.

- [ ] **Step 1: Apply the migration**

Use the Supabase MCP `apply_migration` tool with name `payment_adjustments` and the exact body of `supabase/migrations/20260713210000_payment_adjustments.sql`. Do not hand-edit the SQL at apply time — if it needs a change, change the file and re-read it, so the repo and the database never disagree.

- [ ] **Step 2: Verify the schema landed**

Use the Supabase MCP `list_tables` tool and confirm `payment_adjustments` exists with RLS enabled.

Then run this **read-only** query via `execute_sql` to confirm the grants really are append-only:

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'payment_adjustments'
order by grantee, privilege_type;
```

Expected: `authenticated` holds SELECT and INSERT but **no** UPDATE or DELETE; `anon` appears with nothing.

- [ ] **Step 3: Check the advisors**

Use the Supabase MCP `get_advisors` tool with `type: "security"`. Expected: no new finding naming `payment_adjustments` or `adjust_payment`. A "function search_path mutable" warning here would mean the `set search_path to ''` did not land — fix it if so.

- [ ] **Step 4: QA in the browser**

Restart the API server (it does not watch `src/api-server/**`), then drive the UI at `http://localhost:5173/payments` with Playwright MCP — **through the interface, never a curl to the route**, because dev writes hit the production database and a stray POST is a real admin write.

Adjust one real paid payment: right-click a row → Adjust amount → change the amount → save. Confirm:
1. The row gains the accent tint and the ADJ badge, and shows the **new** amount.
2. One dimmed ghost row appears below it with the **old** amount, struck through.
3. The month total and the outflow chart move by the *difference*, not by the old amount plus the new one.
4. Adjust it a second time — two ghosts stack, newest directly under the live row.
5. Right-click a refunded payment — "Adjust amount" is disabled.

- [ ] **Step 5: Clean up and commit**

Delete every QA screenshot, and close the browser and kill the Playwright MCP process and its Chrome (leave the idle harness respawn alone).

```bash
git add -A && git commit -m "feat(payments): payment adjustments — migration applied"
```

---

## Self-Review

**Spec coverage** — every section of `2026-07-13-payment-adjustments-design.md` maps to a task: data model + grants + atomicity → Task 1; API branch, rejection table, GET embed → Task 2; ADJ marker, accent hue, ghost rows, drawer note → Task 3; peek-menu action, AdjustDialog, refund-block → Task 4; the "ghosts never enter a total" property → Task 3 test plus the Task 5 Step 3 read; deployment order → Task 6.

**Type consistency** — `adjust_payment(p_payment_id, p_amount, p_note, p_actor)` is declared in Task 1 and called with exactly those four keys in Task 2 and asserted with them in the Task 2 test. `PaymentAdjustment.previous_amount` is the field read in Task 3's ghost rows and Task 3's test. `updateAmount(amount, note)` in Task 4 matches `AdjustDialog.onSubmit`. `PaidPaymentRow` is exported in Task 3 and imported by the tests in Tasks 3 and 4.

**Known gap, deliberate** — `GET /payments/mine` (the team member's own view) does not embed adjustments, so a payee sees only the corrected amount, not its history. That is the right default: adjustment history is admin bookkeeping. Revisit only if someone asks.
