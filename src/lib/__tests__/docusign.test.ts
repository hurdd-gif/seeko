// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  buildDocusignEnvelopeDefinition,
  createDocusignPrivateKey,
  normalizeDocusignEnvelopeStatus,
  parseDocusignConnectPayload,
  resolveDocusignTransition,
  verifyDocusignConnectHmac,
} from '../docusign';
import { createHmac } from 'node:crypto';

const sections = [
  { number: 1, title: 'Confidentiality', content: '<p>Keep project details private.</p>' },
  { number: 2, title: 'Ownership', content: '<p>Work product belongs to SEEKO.</p>' },
];

describe('buildDocusignEnvelopeDefinition', () => {
  it('builds a sent envelope with signer tabs anchored in the generated document', () => {
    const envelope = buildDocusignEnvelopeDefinition({
      inviteId: 'invite-123',
      recipientEmail: 'signer@example.invalid',
      title: 'Contractor NDA',
      sections,
      isGuardianSigning: false,
    });

    expect(envelope.status).toBe('sent');
    expect(envelope.emailSubject).toBe('Please sign: Contractor NDA');
    expect(envelope.recipients.signers[0].email).toBe('signer@example.invalid');
    expect(envelope.recipients.signers[0].tabs.signHereTabs[0].anchorString).toBe('[[seeko_signature]]');
    expect(envelope.recipients.signers[0].tabs.textTabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tabLabel: 'signer_address', required: 'true' }),
      ]),
    );
    expect(envelope.customFields.textCustomFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'seeko_invite_id', value: 'invite-123' }),
      ]),
    );
  });

  it('keeps DocuSign anchor markers hidden in the generated HTML document', () => {
    const envelope = buildDocusignEnvelopeDefinition({
      inviteId: 'invite-123',
      recipientEmail: 'signer@example.invalid',
      title: 'Contractor NDA',
      sections,
      isGuardianSigning: false,
    });
    const html = Buffer.from(envelope.documents[0].documentBase64, 'base64').toString('utf8');

    expect(html).toContain('color:#fff');
    expect(html).toContain('font-size:1px');
    expect(html).toContain('>[[seeko_signature]]</span>');
    expect(html).toContain('>[[seeko_full_name]]</span>');
    expect(html).toContain('>[[seeko_date_signed]]</span>');
    expect(html).toContain('>[[seeko_signer_address]]</span>');
    expect(html).not.toContain('<span class="line">[[seeko_signature]]</span>');
    expect(html).not.toContain('<span class="line">[[seeko_full_name]]</span>');
    expect(html).not.toContain('<span class="line">[[seeko_date_signed]]</span>');
    expect(html).not.toContain('<strong>Signer address:</strong> [[seeko_signer_address]]');
  });

  it('adds a required minor-name tab for guardian signing', () => {
    const envelope = buildDocusignEnvelopeDefinition({
      inviteId: 'invite-guardian',
      recipientEmail: 'guardian@example.invalid',
      title: 'Minor Agreement',
      sections,
      isGuardianSigning: true,
    });

    expect(envelope.recipients.signers[0].tabs.textTabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tabLabel: 'minor_name', required: 'true' }),
      ]),
    );
  });
});

describe('DocuSign Connect helpers', () => {
  it('parses JSON Connect envelope completion payloads', () => {
    const parsed = parseDocusignConnectPayload(JSON.stringify({
      event: 'envelope-completed',
      data: {
        envelopeId: 'env-123',
        envelopeSummary: {
          status: 'completed',
          completedDateTime: '2026-06-18T12:00:00Z',
        },
      },
    }));

    expect(parsed).toEqual({
      envelopeId: 'env-123',
      status: 'completed',
      completedAt: '2026-06-18T12:00:00Z',
    });
  });

  it('verifies DocuSign HMAC signatures without accepting altered payloads', () => {
    const body = '{"event":"envelope-completed"}';
    const secret = 'connect-secret';
    const signature = createHmac('sha256', secret).update(body).digest('base64');

    expect(verifyDocusignConnectHmac(body, signature, secret)).toBe(true);
    expect(verifyDocusignConnectHmac(body + ' ', signature, secret)).toBe(false);
  });

  it('fails closed when the Connect HMAC secret is missing or blank', () => {
    const body = '{"event":"envelope-completed"}';

    expect(verifyDocusignConnectHmac(body, null, undefined)).toBe(false);
    expect(verifyDocusignConnectHmac(body, null, '')).toBe(false);
  });
});

describe('normalizeDocusignEnvelopeStatus', () => {
  it('maps completed envelopes to SEEKO signed status', () => {
    expect(normalizeDocusignEnvelopeStatus('completed')).toBe('signed');
  });

  it('keeps sent/delivered envelopes pending locally', () => {
    expect(normalizeDocusignEnvelopeStatus('sent')).toBe('pending');
    expect(normalizeDocusignEnvelopeStatus('delivered')).toBe('pending');
  });
});

describe('resolveDocusignTransition', () => {
  it('accepts completed envelopes only for active, unexpired local invites', () => {
    expect(resolveDocusignTransition({
      currentStatus: 'pending',
      expiresAt: '2026-06-20T00:00:00.000Z',
      docusignStatus: 'completed',
      now: new Date('2026-06-19T00:00:00.000Z'),
    })).toEqual({ action: 'sign' });
  });

  it('expires active local invites instead of signing after local expiry', () => {
    expect(resolveDocusignTransition({
      currentStatus: 'pending',
      expiresAt: '2026-06-18T00:00:00.000Z',
      docusignStatus: 'completed',
      now: new Date('2026-06-19T00:00:00.000Z'),
    })).toEqual({ action: 'expire' });
  });

  it('expires active local invites while the remote envelope is still pending', () => {
    expect(resolveDocusignTransition({
      currentStatus: 'pending',
      expiresAt: '2026-06-18T00:00:00.000Z',
      docusignStatus: 'sent',
      now: new Date('2026-06-19T00:00:00.000Z'),
    })).toEqual({ action: 'expire' });
  });

  it('does not let stale terminal events overwrite signed invites', () => {
    expect(resolveDocusignTransition({
      currentStatus: 'signed',
      expiresAt: '2026-06-20T00:00:00.000Z',
      docusignStatus: 'voided',
      now: new Date('2026-06-19T00:00:00.000Z'),
    })).toEqual({ action: 'ignore', reason: 'non_active_status' });
  });
});

describe('createDocusignPrivateKey', () => {
  it('rejects keypair IDs instead of treating them as private keys', () => {
    expect(() => createDocusignPrivateKey('123e4567-e89b-12d3-a456-426614174000')).toThrow(/private key/i);
  });
});
