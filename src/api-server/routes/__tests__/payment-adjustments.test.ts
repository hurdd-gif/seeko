import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// PATCH /payments/:id calls requireHonoPaymentsAdminToken directly (it does not
// go through the injectable paymentsAuthResolver), so the guard module is what
// gets mocked here.
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rpc: vi.fn(),
  payment: null as Record<string, unknown> | null,
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

function patch(body: unknown) {
  const app = new Hono().route('/api', createPaymentsRoutes());
  return app.request('/api/payments/pay-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.payment = { id: 'pay-1', status: 'paid', amount: 56, recipient_id: 'user-1', refund_amount: 0 };
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: { id: 'pay-1', status: 'paid', amount: 70 }, error: null });
  mocks.auth.mockReset();
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
