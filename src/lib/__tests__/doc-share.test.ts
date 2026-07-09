import { describe, expect, it, vi } from 'vitest';
import { loadDocShare, maskEmail } from '../doc-share';

function createService(invite: Record<string, unknown> | null, doc: Record<string, unknown> | null = null) {
  const updates: Record<string, unknown>[] = [];

  function builder(table: string) {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      single: vi.fn(async () => ({ data: table === 'docs' ? doc : invite })),
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

describe('doc-share loader', () => {
  it('returns not_found when no doc-share invite exists', async () => {
    const { service } = createService(null);

    const result = await loadDocShare('missing-token', { service });

    expect(result).toEqual({ found: false, initialData: { status: 'not_found' } });
  });

  it('returns pending data with masked email and doc metadata', async () => {
    const { service } = createService(
      {
        id: 'invite-1',
        recipient_email: 'recipient@example.invalid',
        status: 'pending',
        expires_at: '2026-06-20T00:00:00.000Z',
        shared_doc_id: 'doc-1',
        purpose: 'doc_share',
      },
      { title: 'Pitch Deck', type: 'deck' }
    );

    const result = await loadDocShare('pending-token', {
      service,
      now: new Date('2026-06-18T00:00:00.000Z'),
    });

    expect(result).toEqual({
      found: true,
      initialData: {
        status: 'pending',
        maskedEmail: 'r********@example.invalid',
        docTitle: 'Pitch Deck',
        docType: 'deck',
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
      shared_doc_id: 'doc-1',
      purpose: 'doc_share',
    });

    const result = await loadDocShare('expired-token', {
      service,
      now: new Date('2026-06-18T00:00:00.000Z'),
    });

    expect(result).toEqual({ found: true, initialData: { status: 'expired' } });
    expect(updates).toEqual([{ status: 'expired' }]);
  });

  it('returns revoked terminal state without fetching doc metadata', async () => {
    const { service } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'revoked',
      expires_at: '2026-06-20T00:00:00.000Z',
      shared_doc_id: 'doc-1',
      purpose: 'doc_share',
    });

    const result = await loadDocShare('revoked-token', { service });

    expect(result).toEqual({ found: true, initialData: { status: 'revoked' } });
  });
});

describe('doc-share maskEmail', () => {
  it('masks the local part and preserves the domain', () => {
    expect(maskEmail('jane@example.invalid')).toBe('j***@example.invalid');
  });

  it('falls back for malformed addresses', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });
});
