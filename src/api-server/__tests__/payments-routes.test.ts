import { describe, expect, it, vi } from 'vitest';
import { createPaymentsRoutes } from '../routes/payments';
import type { PaymentsAuthResult } from '../payments-auth';

const authState = vi.hoisted(() => ({
  result: null as PaymentsAuthResult | null,
}));

vi.mock('../payments-auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('../payments-auth')>();
  return {
    ...original,
    requireHonoPaymentsAdminToken: async () => authState.result ?? ({
      ok: false,
      status: 401,
      error: 'payments_token_required',
    }),
    requireHonoPaymentsViewerToken: async () => authState.result ?? ({
      ok: false,
      status: 401,
      error: 'payments_token_required',
    }),
  };
});

function authedSupabase(overrides: {
  current?: Record<string, unknown> | null;
  updated?: Record<string, unknown> | null;
  updateError?: unknown;
} = {}) {
  const current = overrides.current ?? {
    id: 'payment-1',
    status: 'paid',
    amount: 200,
    recipient_id: 'member-1',
  };
  const updated = overrides.updated ?? {
    id: 'payment-1',
    status: 'paid',
    amount: 200,
    refund_amount: 75,
    refund_note: 'Missed deadline',
  };
  const updates: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];

  const supabase = {
    updates,
    inserts,
    from(table: string) {
      if (table === 'payments') {
        return {
          insert(payload: Record<string, unknown>) {
            inserts.push(payload);
            return {
              select() {
                return {
                  single: async () => ({ data: { id: 'payment-new', ...payload }, error: null }),
                };
              },
            };
          },
          select() {
            return {
              eq() {
                return {
                  single: async () => ({ data: current, error: null }),
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return {
              eq() {
                return {
                  eq() {
                    return {
                      select() {
                        return {
                          single: async () => ({
                            data: updated,
                            error: overrides.updateError ?? null,
                          }),
                        };
                      },
                    };
                  },
                  select() {
                    return {
                      single: async () => ({
                        data: updated,
                        error: overrides.updateError ?? null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      }
      return {
        insert: async () => ({ data: null, error: null }),
      };
    },
  };

  const auth: PaymentsAuthResult = {
    ok: true,
    auth: {
      user: { id: 'admin-1', email: 'admin@example.invalid' },
      supabase: supabase as never,
      isAdmin: true,
      isInvestor: false,
      tokenValid: true,
    },
  };

  return { auth, supabase };
}

describe('payments routes', () => {
  it('stores a partial refund amount and note on a paid payment', async () => {
    const { auth, supabase } = authedSupabase();
    authState.result = auth;
    const app = createPaymentsRoutes();

    const response = await app.request('/payments/payment-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        refund_amount: 75,
        refund_note: 'Missed deadline',
      }),
    });

    expect(response.status).toBe(200);
    expect(supabase.updates).toContainEqual(expect.objectContaining({
      refund_amount: 75,
      refund_note: 'Missed deadline',
    }));
  });

  it('rejects refund amounts greater than the payment amount', async () => {
    const { auth } = authedSupabase();
    authState.result = auth;
    const app = createPaymentsRoutes();

    const response = await app.request('/payments/payment-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        refund_amount: 250,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Refund amount must be between $0.00 and the payment amount',
    });
  });

  it('creates a team payment from recipient_id', async () => {
    const { auth, supabase } = authedSupabase();
    authState.result = auth;
    const app = createPaymentsRoutes();

    const response = await app.request('/payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipient_id: 'member-1',
        amount: 120,
        status: 'paid',
        items: [{ label: 'Sprite sheet', amount: 120 }],
      }),
    });

    expect(response.status).toBe(201);
    expect(supabase.inserts).toContainEqual(expect.objectContaining({
      recipient_id: 'member-1',
      payee_name: null,
      amount: 120,
    }));
  });

  it('creates an external payment from a trimmed payee_name', async () => {
    const { auth, supabase } = authedSupabase();
    authState.result = auth;
    const app = createPaymentsRoutes();

    const response = await app.request('/payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        payee_name: '  Anthropic  ',
        amount: 200,
        status: 'paid',
        items: [{ label: 'Claude subscription', amount: 200 }],
      }),
    });

    expect(response.status).toBe(201);
    expect(supabase.inserts).toContainEqual(expect.objectContaining({
      recipient_id: null,
      payee_name: 'Anthropic',
      amount: 200,
    }));
  });

  it('rejects a payment that names both a recipient and a payee', async () => {
    const { auth } = authedSupabase();
    authState.result = auth;
    const app = createPaymentsRoutes();

    const response = await app.request('/payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipient_id: 'member-1',
        payee_name: 'Anthropic',
        amount: 200,
        items: [{ label: 'Claude subscription', amount: 200 }],
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Provide either recipient_id or payee_name (not both)',
    });
  });

  it('rejects a payment with neither a recipient nor a payee', async () => {
    const { auth } = authedSupabase();
    authState.result = auth;
    const app = createPaymentsRoutes();

    const response = await app.request('/payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        payee_name: '   ',
        amount: 200,
        items: [{ label: 'Claude subscription', amount: 200 }],
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Provide either recipient_id or payee_name (not both)',
    });
  });
});
