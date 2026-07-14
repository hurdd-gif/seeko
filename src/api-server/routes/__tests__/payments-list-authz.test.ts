import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// GET /payments calls requireHonoPaymentsViewerToken directly (not through an
// injectable resolver), so the guard module is what gets mocked here. The mock
// returns a Supabase double whose .select() projects a canonical full row down
// to only the columns the handler actually asked for — so "the response leaks X"
// is a real consequence of the select string, exactly like Postgres projection.
const mocks = vi.hoisted(() => ({
  viewerAuth: vi.fn(),
  captured: {} as { select?: string; eq?: [string, unknown] },
}));

vi.mock('../../payments-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../payments-auth')>()),
  requireHonoPaymentsViewerToken: mocks.viewerAuth,
}));
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
  getServiceClientAs: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
}));

import { createPaymentsRoutes } from '../payments';

// The full universe of columns a `*` select + full recipient join would return.
const FULL_PAYMENT: Record<string, unknown> = {
  id: 'pay-1',
  recipient_id: 'user-1',
  payee_name: 'Acme Vendor',
  recipient_email: 'vendor@example.invalid',
  amount: 100,
  currency: 'USD',
  description: 'Contract work',
  status: 'paid',
  paid_at: '2026-07-01T00:00:00Z',
  created_at: '2026-07-01T00:00:00Z',
  created_by: 'admin-1',
  refund_amount: 0,
  refund_note: null,
  refunded_at: null,
};
const FULL_RECIPIENT: Record<string, unknown> = {
  id: 'user-1',
  display_name: 'Bob Contractor',
  avatar_url: null,
  department: 'Coding',
  paypal_email: 'bob@paypal.invalid',
};

function parseSelect(sel: string) {
  const relations: Record<string, string[]> = {};
  const re = /([a-zA-Z_]+)\s*:?[a-zA-Z_!]*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sel))) {
    relations[m[1]] = m[2].split(',').map((s) => s.trim()).filter(Boolean);
  }
  const topCols = sel.replace(re, '').split(',').map((s) => s.trim()).filter(Boolean);
  return { topCols, relations };
}

function projectPayment(sel: string) {
  const { topCols, relations } = parseSelect(sel);
  const row: Record<string, unknown> = {};
  if (topCols.includes('*')) Object.assign(row, FULL_PAYMENT);
  else for (const c of topCols) if (c in FULL_PAYMENT) row[c] = FULL_PAYMENT[c];

  if (relations.recipient) {
    const rec: Record<string, unknown> = {};
    if (relations.recipient.includes('*')) Object.assign(rec, FULL_RECIPIENT);
    else for (const c of relations.recipient) if (c in FULL_RECIPIENT) rec[c] = FULL_RECIPIENT[c];
    row.recipient = rec;
  }
  if (relations.items) row.items = [{ id: 'i1', payment_id: 'pay-1', task_id: null, label: 'Work', amount: 100 }];
  if (relations.adjustments) row.adjustments = [];
  return row;
}

function makeSupabase() {
  return {
    from: () => ({
      select: (sel: string) => {
        mocks.captured.select = sel;
        const result = { data: [projectPayment(sel)], error: null };
        const builder: Record<string, unknown> = {
          order: () => builder,
          eq: (col: string, val: unknown) => {
            mocks.captured.eq = [col, val];
            return builder;
          },
          then: (resolve: (value: unknown) => unknown) => resolve(result),
        };
        return builder;
      },
    }),
  };
}

function setViewer({ isAdmin, isInvestor }: { isAdmin: boolean; isInvestor: boolean }) {
  mocks.viewerAuth.mockImplementation(async () => ({
    ok: true,
    auth: {
      user: { id: isAdmin ? 'admin-1' : 'inv-1', email: 'viewer@example.invalid' },
      isAdmin,
      isInvestor,
      tokenValid: true,
      supabase: makeSupabase(),
    },
  }));
}

function requestPayments() {
  const app = new Hono().route('/api', createPaymentsRoutes());
  return app.request('/api/payments');
}

beforeEach(() => {
  mocks.viewerAuth.mockReset();
  mocks.captured = {};
});

describe('GET /api/payments — investor payout PII lockdown', () => {
  it('narrows the payload for an investor (no recipient_email / payee_name / recipient.paypal_email)', async () => {
    setViewer({ isAdmin: false, isInvestor: true });

    const res = await requestPayments();
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    const [row] = rows;

    // Payout PII must not be in the response body.
    expect(row).not.toHaveProperty('recipient_email');
    expect(row).not.toHaveProperty('payee_name');
    expect(row.recipient).not.toHaveProperty('paypal_email');

    // The investor still gets the safe recipient identity (mirrors loadInvestorPayments).
    expect(row.recipient).toMatchObject({ id: 'user-1', display_name: 'Bob Contractor', department: 'Coding' });

    // The select string itself enumerates columns (no top-level *) and names none of the PII columns.
    expect(mocks.captured.select?.trimStart().startsWith('*')).toBe(false);
    expect(mocks.captured.select).not.toContain('recipient_email');
    expect(mocks.captured.select).not.toContain('payee_name');
    expect(mocks.captured.select).not.toContain('paypal_email');

    // The pre-existing investor-only status filter is preserved.
    expect(mocks.captured.eq).toEqual(['status', 'paid']);
  });

  it('keeps the full payload for an admin (recipient_email, payee_name, recipient.paypal_email present)', async () => {
    setViewer({ isAdmin: true, isInvestor: false });

    const res = await requestPayments();
    expect(res.status).toBe(200);
    const [row] = (await res.json()) as Array<Record<string, unknown>>;

    expect(row.recipient_email).toBe('vendor@example.invalid');
    expect(row.payee_name).toBe('Acme Vendor');
    expect((row.recipient as Record<string, unknown>).paypal_email).toBe('bob@paypal.invalid');

    // Admins are not narrowed to status='paid'.
    expect(mocks.captured.eq).toBeUndefined();
  });
});
