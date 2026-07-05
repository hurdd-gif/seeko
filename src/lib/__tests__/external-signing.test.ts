import { describe, expect, it, vi } from 'vitest';
import { loadExternalSigningInvite, maskEmail } from '../external-signing';

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

describe('external signing loader', () => {
  it('returns notfound for missing or non-signing rows', async () => {
    const { service } = createService(null);

    const result = await loadExternalSigningInvite('missing-token', { service });

    expect(result).toEqual({ found: false, initialData: { status: 'notfound' } });
  });

  it('returns pending signing data with masked email and template name', async () => {
    const { service } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'pending',
      expires_at: '2026-06-20T00:00:00.000Z',
      template_type: 'custom',
      custom_title: 'Contractor Agreement',
      custom_sections: null,
      personal_note: 'Please sign',
      is_guardian_signing: false,
    });

    const result = await loadExternalSigningInvite('pending-token', {
      service,
      now: new Date('2026-06-18T00:00:00.000Z'),
    });

    expect(result).toEqual({
      found: true,
      initialData: {
        status: 'pending',
        maskedEmail: 'r********@example.invalid',
        templateName: 'Contractor Agreement',
        personalNote: 'Please sign',
        isGuardianSigning: false,
      },
    });
  });

  it('hides DocuSign-backed rows from the legacy local signing loader', async () => {
    const { service } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'pending',
      expires_at: '2026-06-20T00:00:00.000Z',
      template_type: 'custom',
      custom_title: 'Contractor Agreement',
      custom_sections: null,
      personal_note: null,
      is_guardian_signing: false,
      signing_provider: 'docusign',
    });

    const result = await loadExternalSigningInvite('docusign-token', {
      service,
      now: new Date('2026-06-18T00:00:00.000Z'),
    });

    expect(result).toEqual({ found: false, initialData: { status: 'notfound' } });
  });

  it('expires pending signing invites when their expiry is in the past', async () => {
    const { service, updates } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'pending',
      expires_at: '2026-06-01T00:00:00.000Z',
      template_type: 'custom',
      custom_title: 'Agreement',
      custom_sections: null,
      personal_note: null,
      is_guardian_signing: false,
    });

    const result = await loadExternalSigningInvite('expired-token', {
      service,
      now: new Date('2026-06-18T00:00:00.000Z'),
    });

    expect(result).toEqual({ found: true, initialData: { status: 'expired' } });
    expect(updates).toEqual([{ status: 'expired' }]);
  });

  it('returns verified custom sections when available', async () => {
    const sections = [{ number: 1, title: 'Scope', content: '<p>Work</p>' }];
    const { service } = createService({
      id: 'invite-1',
      recipient_email: 'recipient@example.invalid',
      status: 'verified',
      expires_at: '2026-06-20T00:00:00.000Z',
      template_type: 'custom',
      custom_title: 'Custom Agreement',
      custom_sections: sections,
      personal_note: null,
      is_guardian_signing: true,
    });

    const result = await loadExternalSigningInvite('verified-token', { service });

    expect(result).toEqual({
      found: true,
      initialData: {
        status: 'verified',
        maskedEmail: 'r********@example.invalid',
        templateName: 'Custom Agreement',
        personalNote: undefined,
        sections,
        isGuardianSigning: true,
      },
    });
  });
});

describe('external signing maskEmail', () => {
  it('masks the local part and preserves the domain', () => {
    expect(maskEmail('jane@example.invalid')).toBe('j***@example.invalid');
  });

  it('falls back for malformed addresses', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });
});
