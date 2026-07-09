import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { loadInviteByToken, maskEmail } from '../invites-repo';

function createService(invite: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = [];

  function builder() {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      single: vi.fn(async () => ({ data: invite })),
      update: vi.fn((values: Record<string, unknown>) => {
        updates.push(values);
        return query;
      }),
    };

    return query;
  }

  return {
    service: {
      from: vi.fn(() => builder()),
    },
    updates,
  };
}

const NOW = new Date('2026-06-18T00:00:00.000Z');

describe('loadInviteByToken — cross-product isolation', () => {
  it('returns not_found when no row exists for the token', async () => {
    const { service } = createService(null);

    const result = await loadInviteByToken({ token: 'missing', purpose: 'signing', service, now: NOW });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('treats a doc_share-purpose row as not_found when loaded under the signing purpose', async () => {
    const { service } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'pending',
      expires_at: '2026-06-20T00:00:00.000Z',
      purpose: 'doc_share',
      template_type: 'doc_share',
    });

    const result = await loadInviteByToken({ token: 'tok', purpose: 'signing', service, now: NOW });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('treats a signing-purpose row as not_found when loaded under the doc_share purpose', async () => {
    const { service } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'pending',
      expires_at: '2026-06-20T00:00:00.000Z',
      purpose: 'signing',
      template_type: 'custom',
    });

    const result = await loadInviteByToken({ token: 'tok', purpose: 'doc_share', service, now: NOW });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('treats a doc_share-purpose row as not_found when loaded under the invoice_request purpose', async () => {
    const { service } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'pending',
      expires_at: '2026-06-20T00:00:00.000Z',
      purpose: 'doc_share',
      template_type: 'doc_share',
    });

    const result = await loadInviteByToken({ token: 'tok', purpose: 'invoice_request', service, now: NOW });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('treats a DocuSign-backed row as not_found under the signing purpose (preserves loadExternalSigningInvite behavior)', async () => {
    const { service } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'pending',
      expires_at: '2026-06-20T00:00:00.000Z',
      purpose: 'signing',
      template_type: 'custom',
      signing_provider: 'docusign',
    });

    const result = await loadInviteByToken({ token: 'tok', purpose: 'signing', service, now: NOW });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('loadInviteByToken — expiry', () => {
  it('expires a pending invite whose expires_at is in the past and attempts the status write', async () => {
    const { service, updates } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'pending',
      expires_at: '2026-06-01T00:00:00.000Z',
      purpose: 'signing',
      template_type: 'custom',
    });

    const result = await loadInviteByToken({ token: 'tok', purpose: 'signing', service, now: NOW });

    expect(result).toEqual({ ok: false, reason: 'expired' });
    expect(updates).toEqual([{ status: 'expired' }]);
  });

  it('returns expired for a row already marked expired, without writing', async () => {
    const { service, updates } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'expired',
      expires_at: '2026-06-01T00:00:00.000Z',
      purpose: 'doc_share',
      template_type: 'doc_share',
    });

    const result = await loadInviteByToken({ token: 'tok', purpose: 'doc_share', service, now: NOW });

    expect(result).toEqual({ ok: false, reason: 'expired' });
    expect(updates).toEqual([]);
  });

  it('does not expire a non-pending row whose expires_at is in the past (e.g. verified)', async () => {
    const { service, updates } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'verified',
      expires_at: '2026-06-01T00:00:00.000Z',
      purpose: 'invoice',
      template_type: 'invoice',
    });

    const result = await loadInviteByToken({ token: 'tok', purpose: 'invoice_request', service, now: NOW });

    expect(result.ok).toBe(true);
    expect(updates).toEqual([]);
  });
});

describe('loadInviteByToken — revoked', () => {
  it('returns revoked without fetching further', async () => {
    const { service, updates } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'revoked',
      expires_at: '2026-06-20T00:00:00.000Z',
      purpose: 'invoice',
      template_type: 'invoice',
    });

    const result = await loadInviteByToken({ token: 'tok', purpose: 'invoice_request', service, now: NOW });

    expect(result).toEqual({ ok: false, reason: 'revoked' });
    expect(updates).toEqual([]);
  });
});

describe('loadInviteByToken — happy path', () => {
  it('returns the full row when the purpose matches and the invite is live', async () => {
    const row = {
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'pending',
      expires_at: '2026-06-20T00:00:00.000Z',
      purpose: 'signing',
      template_type: 'custom',
      custom_title: 'Contractor Agreement',
      custom_sections: null,
      personal_note: 'Please sign',
      is_guardian_signing: false,
    };
    const { service } = createService(row);

    const result = await loadInviteByToken({ token: 'tok', purpose: 'signing', service, now: NOW });

    expect(result).toEqual({ ok: true, invite: row });
  });
});

describe('maskEmail', () => {
  it('masks the local part and preserves the domain', () => {
    expect(maskEmail('jane@example.invalid')).toBe('j***@example.invalid');
  });

  it('pads short local parts to a minimum of two mask characters', () => {
    expect(maskEmail('a@example.com')).toBe('a**@example.com');
  });

  it('falls back for addresses with no @', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });
});
