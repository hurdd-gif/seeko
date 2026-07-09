import { SignJWT } from 'jose';
import { createHmac, createPrivateKey, timingSafeEqual, type KeyObject } from 'node:crypto';
import { sanitizeEmailHtml } from './sanitize';

type Section = { number: number; title: string; content: string };

export type DocusignEnvelopeInput = {
  inviteId: string;
  recipientEmail: string;
  recipientName?: string | null;
  title: string;
  sections: Section[];
  personalNote?: string | null;
  isGuardianSigning?: boolean;
};

type DocusignConfig = {
  integrationKey: string;
  userId: string;
  accountId: string;
  privateKey: string;
  authBaseUri: string;
  restBaseUri: string;
};

type DocusignToken = {
  access_token: string;
};

type DocusignEnvelopeResponse = {
  envelopeId?: string;
  status?: string;
  completedDateTime?: string;
  message?: string;
};

export type DocusignConnectEvent = {
  envelopeId: string;
  status: string;
  completedAt?: string;
};

const DEFAULT_AUTH_BASE_URI = 'account-d.docusign.com';
const DEFAULT_REST_BASE_URI = 'https://demo.docusign.net/restapi';

export function getSigningProvider(): 'docusign' | 'internal' {
  return process.env.SIGNING_PROVIDER === 'internal' ? 'internal' : 'docusign';
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getConfig(): DocusignConfig {
  return {
    integrationKey: requiredEnv('DOCUSIGN_INTEGRATION_KEY'),
    userId: requiredEnv('DOCUSIGN_USER_ID'),
    accountId: requiredEnv('DOCUSIGN_ACCOUNT_ID'),
    privateKey: normalizePrivateKey(requiredEnv('DOCUSIGN_PRIVATE_KEY')),
    authBaseUri: process.env.DOCUSIGN_AUTH_BASE_URI || DEFAULT_AUTH_BASE_URI,
    restBaseUri: (process.env.DOCUSIGN_REST_BASE_URI || DEFAULT_REST_BASE_URI).replace(/\/$/, ''),
  };
}

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, '\n');
}

export function createDocusignPrivateKey(raw: string): KeyObject {
  const normalized = normalizePrivateKey(raw);
  if (!normalized.includes('BEGIN') || !normalized.includes('PRIVATE KEY')) {
    throw new Error('DOCUSIGN_PRIVATE_KEY must be the full private key block, not the RSA keypair ID.');
  }
  return createPrivateKey(normalized);
}

function stripTags(html: string): string {
  return sanitizeEmailHtml(html)
    .replace(/<\/?(p|div|br)\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '\n<li>')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function deriveRecipientName(email: string, explicit?: string | null): string {
  if (explicit?.trim()) return explicit.trim();
  const local = email.split('@')[0] || email;
  const name = local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return name || email;
}

function toBase64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function buildSigningHtml(input: DocusignEnvelopeInput): string {
  const anchor = (value: string) =>
    `<span style="color:#fff;font-size:1px;line-height:1px;">${value}</span>`;
  const sectionHtml = input.sections
    .map((section) => `
      <section>
        <h2>${section.number}. ${escapeHtml(section.title)}</h2>
        <div>${sanitizeEmailHtml(section.content)}</div>
      </section>
    `)
    .join('\n');

  const guardian = input.isGuardianSigning
    ? `<p><strong>Minor represented:</strong> ${anchor('[[seeko_minor_name]]')}<span class="line"></span></p>`
    : '';

  const note = input.personalNote
    ? `<p class="note">${escapeHtml(input.personalNote)}</p>`
    : '';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { color: #111; font-family: Inter, "Segoe UI", Arial, sans-serif; font-size: 12pt; font-weight: 500; line-height: 1.5; margin: 48px; }
    h1 { font-size: 20pt; margin: 0 0 8px; text-align: center; }
    h2 { font-size: 13pt; margin: 24px 0 8px; }
    .brand { font-weight: 500; letter-spacing: .08em; text-align: center; text-transform: uppercase; }
    .note { border-left: 3px solid #999; color: #444; margin: 24px 0; padding-left: 12px; }
    .signing { margin-top: 40px; page-break-inside: avoid; }
    .line { border-bottom: 1px solid #111; display: inline-block; min-width: 280px; padding: 3px 0; }
  </style>
</head>
<body>
  <p class="brand">SEEKO Studios, Inc.</p>
  <h1>${escapeHtml(input.title)}</h1>
  ${note}
  ${sectionHtml}
  <div class="signing">
    ${guardian}
    <p><strong>Signer address:</strong> ${anchor('[[seeko_signer_address]]')}<span class="line"></span></p>
    <p><strong>Signature:</strong> ${anchor('[[seeko_signature]]')}<span class="line"></span></p>
    <p><strong>Name:</strong> ${anchor('[[seeko_full_name]]')}<span class="line"></span></p>
    <p><strong>Date:</strong> ${anchor('[[seeko_date_signed]]')}<span class="line"></span></p>
  </div>
</body>
</html>`;
}

export function buildDocusignEnvelopeDefinition(input: DocusignEnvelopeInput) {
  const signerName = deriveRecipientName(input.recipientEmail, input.recipientName);
  const textTabs = [
    {
      anchorString: '[[seeko_signer_address]]',
      anchorUnits: 'pixels',
      anchorXOffset: '0',
      anchorYOffset: '-4',
      documentId: '1',
      pageNumber: '1',
      recipientId: '1',
      required: 'true',
      tabLabel: 'signer_address',
      width: '260',
    },
  ];

  if (input.isGuardianSigning) {
    textTabs.unshift({
      anchorString: '[[seeko_minor_name]]',
      anchorUnits: 'pixels',
      anchorXOffset: '0',
      anchorYOffset: '-4',
      documentId: '1',
      pageNumber: '1',
      recipientId: '1',
      required: 'true',
      tabLabel: 'minor_name',
      width: '260',
    });
  }

  return {
    emailSubject: `Please sign: ${input.title}`,
    status: 'sent',
    documents: [
      {
        documentBase64: toBase64(buildSigningHtml(input)),
        documentId: '1',
        fileExtension: 'html',
        name: input.title,
      },
    ],
    recipients: {
      signers: [
        {
          email: input.recipientEmail,
          name: signerName,
          recipientId: '1',
          routingOrder: '1',
          tabs: {
            signHereTabs: [
              {
                anchorString: '[[seeko_signature]]',
                anchorUnits: 'pixels',
                anchorXOffset: '0',
                anchorYOffset: '0',
                documentId: '1',
                pageNumber: '1',
                recipientId: '1',
              },
            ],
            fullNameTabs: [
              {
                anchorString: '[[seeko_full_name]]',
                anchorUnits: 'pixels',
                anchorXOffset: '0',
                anchorYOffset: '-4',
                documentId: '1',
                pageNumber: '1',
                recipientId: '1',
              },
            ],
            dateSignedTabs: [
              {
                anchorString: '[[seeko_date_signed]]',
                anchorUnits: 'pixels',
                anchorXOffset: '0',
                anchorYOffset: '-4',
                documentId: '1',
                pageNumber: '1',
                recipientId: '1',
              },
            ],
            textTabs,
          },
        },
      ],
    },
    customFields: {
      textCustomFields: [
        {
          name: 'seeko_invite_id',
          required: 'false',
          show: 'false',
          value: input.inviteId,
        },
      ],
    },
  };
}

async function getAccessToken(config: DocusignConfig): Promise<string> {
  const key = createDocusignPrivateKey(config.privateKey);
  const assertion = await new SignJWT({ scope: 'signature impersonation' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(config.integrationKey)
    .setSubject(config.userId)
    .setAudience(config.authBaseUri)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);

  const res = await fetch(`https://${config.authBaseUri}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DocuSign auth failed (${res.status}): ${text || res.statusText}`);
  }

  const token = await res.json() as DocusignToken;
  if (!token.access_token) throw new Error('DocuSign auth response did not include an access token');
  return token.access_token;
}

async function docusignFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const config = getConfig();
  const token = await getAccessToken(config);
  return fetch(`${config.restBaseUri}/v2.1/accounts/${config.accountId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
}

export async function createDocusignEnvelope(input: DocusignEnvelopeInput): Promise<{ envelopeId: string; status: string }> {
  const res = await docusignFetch('/envelopes', {
    method: 'POST',
    body: JSON.stringify(buildDocusignEnvelopeDefinition(input)),
  });

  const data = await res.json().catch(() => ({})) as DocusignEnvelopeResponse;
  if (!res.ok || !data.envelopeId) {
    throw new Error(`DocuSign envelope creation failed (${res.status}): ${data.message || res.statusText}`);
  }
  return { envelopeId: data.envelopeId, status: data.status || 'sent' };
}

export async function downloadDocusignCompletedPdf(envelopeId: string): Promise<Uint8Array> {
  const res = await docusignFetch(`/envelopes/${encodeURIComponent(envelopeId)}/documents/combined`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DocuSign document download failed (${res.status}): ${text || res.statusText}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function getDocusignEnvelopeStatus(envelopeId: string): Promise<{ status: string; completedAt?: string }> {
  const res = await docusignFetch(`/envelopes/${encodeURIComponent(envelopeId)}`, {
    method: 'GET',
  });
  const data = await res.json().catch(() => ({})) as DocusignEnvelopeResponse;
  if (!res.ok || !data.status) {
    throw new Error(`DocuSign envelope status failed (${res.status}): ${data.message || res.statusText}`);
  }
  return { status: data.status.toLowerCase(), completedAt: data.completedDateTime };
}

export function normalizeDocusignEnvelopeStatus(status: string): 'pending' | 'signed' | 'revoked' {
  const normalized = status.toLowerCase();
  if (normalized === 'completed') return 'signed';
  if (normalized === 'declined' || normalized === 'voided') return 'revoked';
  return 'pending';
}

export type DocusignLocalInviteStatus = 'pending' | 'verified' | 'signed' | 'expired' | 'revoked';

export type DocusignTransition =
  | { action: 'record' }
  | { action: 'sign' }
  | { action: 'revoke' }
  | { action: 'expire' }
  | { action: 'ignore'; reason: 'already_terminal' | 'non_active_status' };

export function resolveDocusignTransition(input: {
  currentStatus: DocusignLocalInviteStatus;
  expiresAt?: string | null;
  docusignStatus: string;
  now?: Date;
}): DocusignTransition {
  const localProviderStatus = normalizeDocusignEnvelopeStatus(input.docusignStatus);
  const active = input.currentStatus === 'pending' || input.currentStatus === 'verified';
  const expired = !!input.expiresAt && Date.parse(input.expiresAt) < (input.now ?? new Date()).getTime();

  if (localProviderStatus === 'pending') return active && expired ? { action: 'expire' } : { action: 'record' };

  if (localProviderStatus === 'signed') {
    if (!active) {
      return { action: 'ignore', reason: input.currentStatus === 'signed' ? 'already_terminal' : 'non_active_status' };
    }
    if (expired) return { action: 'expire' };
    return { action: 'sign' };
  }

  if (input.currentStatus === 'revoked') return { action: 'ignore', reason: 'already_terminal' };
  if (input.currentStatus === 'signed' || input.currentStatus === 'expired') {
    return { action: 'ignore', reason: 'non_active_status' };
  }
  return { action: 'revoke' };
}

export async function voidDocusignEnvelope(envelopeId: string, reason: string): Promise<void> {
  const res = await docusignFetch(`/envelopes/${encodeURIComponent(envelopeId)}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'voided', voidedReason: reason }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DocuSign envelope void failed (${res.status}): ${text || res.statusText}`);
  }
}

export async function resendDocusignEnvelope(envelopeId: string): Promise<void> {
  const res = await docusignFetch(`/envelopes/${encodeURIComponent(envelopeId)}?resend_envelope=true`, {
    method: 'PUT',
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DocuSign envelope resend failed (${res.status}): ${text || res.statusText}`);
  }
}

export function verifyDocusignConnectHmac(body: string, signature: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret) return false;
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(body).digest('base64');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function parseDocusignConnectPayload(body: string): DocusignConnectEvent {
  const data = JSON.parse(body) as any;
  const envelopeId =
    data?.data?.envelopeId ||
    data?.data?.envelopeSummary?.envelopeId ||
    data?.envelopeId ||
    data?.envelopeStatus?.envelopeID;
  const status = (
    data?.data?.envelopeSummary?.status ||
    data?.data?.status ||
    data?.status ||
    String(data?.event || '').replace(/^envelope-/i, '')
  ).toLowerCase();
  const completedAt =
    data?.data?.envelopeSummary?.completedDateTime ||
    data?.data?.completedDateTime ||
    data?.completedDateTime;

  if (!envelopeId || !status) throw new Error('DocuSign Connect payload is missing envelope status data');
  return { envelopeId, status, completedAt };
}

export function textFromSections(sections: Section[]): string {
  return sections.map((section) => `${section.number}. ${section.title}\n${stripTags(section.content)}`).join('\n\n');
}
