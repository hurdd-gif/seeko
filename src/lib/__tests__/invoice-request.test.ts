import { describe, expect, it, vi } from 'vitest';
import { loadInvoiceRequest, maskEmail } from '../invoice-request';

function createService(invite: Record<string, unknown> | null, payment: Record<string, unknown> | null = null) {
  const updates: Record<string, unknown>[] = [];

  function builder(table: string) {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      single: vi.fn(async () => ({ data: table === 'payments' ? payment : invite })),
      update: vi.fn((values: Record<string, unknown>) => {
        updates.push(values);
        return query;
      }),
    };

    return query;
  }

  return {
    service: {
      from: vi.fn((table: string) => builder(table)),
    },
    updates,
  };
}

describe('invoice request loader', () => {
  it('returns not_found when no invoice invite exists', async () => {
    const { service } = createService(null);

    const result = await loadInvoiceRequest('missing-token', { service });

    expect(result).toEqual({ found: false, initialData: { status: 'not_found' } });
  });

  it('returns pending data with a masked email', async () => {
    const { service } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'pending',
      expires_at: '2026-06-20T00:00:00.000Z',
      personal_note: 'Hidden until verified',
      prefilled_items: [{ label: 'Animation', amount: 250 }],
      submitted_payment_id: null,
    });

    const result = await loadInvoiceRequest('pending-token', {
      service,
      now: new Date('2026-06-18T00:00:00.000Z'),
    });

    expect(result).toEqual({
      found: true,
      initialData: {
        status: 'pending',
        maskedEmail: 'r********@example.invalid',
        expiresAt: '2026-06-20T00:00:00.000Z',
      },
    });
  });

  it('expires a pending invite when its expiry is in the past', async () => {
    const { service, updates } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'pending',
      expires_at: '2026-06-01T00:00:00.000Z',
      personal_note: null,
      prefilled_items: null,
      submitted_payment_id: null,
    });

    const result = await loadInvoiceRequest('expired-token', {
      service,
      now: new Date('2026-06-18T00:00:00.000Z'),
    });

    expect(result).toEqual({ found: true, initialData: { status: 'expired' } });
    expect(updates).toEqual([{ status: 'expired' }]);
  });

  it('returns submitted payment status and amount for signed invoices', async () => {
    const { service } = createService(
      {
        id: 'invite-1',
        recipient_email: 'recipient@example.invalid',
        status: 'signed',
        expires_at: '2026-06-20T00:00:00.000Z',
        personal_note: null,
        prefilled_items: null,
        submitted_payment_id: 'payment-1',
      },
      { status: 'paid', amount: 700 }
    );

    const result = await loadInvoiceRequest('submitted-token', { service });

    expect(result).toEqual({
      found: true,
      initialData: {
        status: 'submitted',
        paymentStatus: 'paid',
        paymentAmount: 700,
      },
    });
  });

  it('does not expose verified invoice details without a matching session token', async () => {
    const { service } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'verified',
      expires_at: '2026-06-20T00:00:00.000Z',
      personal_note: 'Only shown after verification',
      prefilled_items: [{ label: 'Animation', amount: 250 }],
      session_token: 'verified-session',
      submitted_payment_id: null,
    });

    const result = await loadInvoiceRequest('verified-token', {
      service,
      sessionToken: 'wrong-session',
    });

    expect(result).toEqual({
      found: true,
      initialData: {
        status: 'pending',
        maskedEmail: 'r********@example.invalid',
        expiresAt: '2026-06-20T00:00:00.000Z',
      },
    });
  });

  it('returns verified invoice details when the session token matches', async () => {
    const { service } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'verified',
      expires_at: '2026-06-20T00:00:00.000Z',
      personal_note: 'Shown after verification',
      prefilled_items: [{ label: 'Animation', amount: 250 }],
      session_token: 'verified-session',
      submitted_payment_id: null,
    });

    const result = await loadInvoiceRequest('verified-token', {
      service,
      sessionToken: 'verified-session',
    });

    expect(result).toEqual({
      found: true,
      initialData: {
        status: 'verified',
        maskedEmail: 'r********@example.invalid',
        personalNote: 'Shown after verification',
        prefilledItems: [{ label: 'Animation', amount: 250 }],
        expiresAt: '2026-06-20T00:00:00.000Z',
      },
    });
  });
});

describe('maskEmail', () => {
  it('masks the local part and preserves the domain', () => {
    expect(maskEmail('jane@example.invalid')).toBe('j***@example.invalid');
  });

  it('falls back for malformed addresses', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });
});
