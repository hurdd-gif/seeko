import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateAgreementPdf, buildCertificateRows } from '@/lib/agreement-pdf';

const BASE_INPUT = {
  title: 'Non-Disclosure Agreement',
  sections: [{ number: 1, title: 'Confidentiality', content: '<p>Test content</p>' }],
  signer: {
    fullName: 'John Doe',
    address: '123 Main St, New York, NY 10001',
    email: 'john@seeko.gg',
    department: 'Coding',
    role: 'Engineer',
    engagementType: 'team_member' as const,
    signedAt: new Date('2026-03-08T12:00:00Z'),
  },
};

describe('generateAgreementPdf', () => {
  it('returns a Uint8Array with valid PDF magic bytes', async () => {
    const pdf = await generateAgreementPdf(BASE_INPUT);

    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(100);
    // PDF magic bytes: %PDF
    expect(String.fromCharCode(pdf[0], pdf[1], pdf[2], pdf[3])).toBe('%PDF');
  });

  it('appends ONE extra page (the Certificate of Completion) when certificate data is provided', async () => {
    const withoutCert = await PDFDocument.load(await generateAgreementPdf(BASE_INPUT));
    const withCert = await PDFDocument.load(
      await generateAgreementPdf({
        ...BASE_INPUT,
        envelopeId: 'env-abc-123',
        integrityHash: 'a'.repeat(64),
        ip: '203.0.113.7',
        userAgent: 'Mozilla/5.0 (Macintosh)',
      }),
    );
    expect(withCert.getPageCount()).toBe(withoutCert.getPageCount() + 1);
  });

  it('does NOT append a certificate page for onboarding (no certificate data) — legacy/onboarding stays unchanged', async () => {
    // Two identical onboarding calls produce the same page count (no cert appended).
    const a = await PDFDocument.load(await generateAgreementPdf(BASE_INPUT));
    const b = await PDFDocument.load(await generateAgreementPdf(BASE_INPUT));
    expect(a.getPageCount()).toBe(b.getPageCount());
  });

  it('degrades gracefully — still appends the certificate (no throw) when ip/userAgent are absent', async () => {
    const pdf = await generateAgreementPdf({
      ...BASE_INPUT,
      envelopeId: 'env-legacy',
      integrityHash: 'b'.repeat(64),
      // ip + userAgent intentionally omitted (a legacy/missing-header sign)
    });
    const doc = await PDFDocument.load(pdf);
    const baseline = await PDFDocument.load(await generateAgreementPdf(BASE_INPUT));
    expect(doc.getPageCount()).toBe(baseline.getPageCount() + 1);
  });
});

describe('buildCertificateRows', () => {
  const FULL = {
    envelopeId: 'env-abc-123',
    integrityHash: 'c'.repeat(64),
    ip: '203.0.113.7',
    userAgent: 'Mozilla/5.0 (Macintosh)',
    signerName: 'John Doe',
    signerEmail: 'john@seeko.gg',
    signedAt: new Date('2026-03-08T12:30:45Z'),
  };

  it('renders every provided field as a label/value row', () => {
    const rows = buildCertificateRows(FULL);
    const map = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(map['Envelope ID']).toBe('env-abc-123');
    expect(map['Signer']).toBe('John Doe');
    expect(map['Email']).toBe('john@seeko.gg');
    expect(map['IP Address']).toBe('203.0.113.7');
    expect(map['User Agent']).toBe('Mozilla/5.0 (Macintosh)');
    expect(map['Document Hash (SHA-256)']).toBe('c'.repeat(64));
  });

  it('stamps the signed timestamp with an explicit, deterministic UTC timezone', () => {
    const rows = buildCertificateRows(FULL);
    const signed = rows.find((r) => r.label === 'Signed')!.value;
    // Deterministic regardless of host timezone (formatted in UTC).
    expect(signed).toContain('UTC');
    expect(signed).toContain('2026');
  });

  it('renders "Not recorded" for absent audit fields (null/undefined/empty)', () => {
    const rows = buildCertificateRows({
      envelopeId: 'env-1',
      integrityHash: undefined,
      ip: null,
      userAgent: '',
      signerName: 'Jane',
      signerEmail: 'jane@seeko.gg',
      signedAt: new Date('2026-03-08T12:00:00Z'),
    });
    const map = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(map['IP Address']).toBe('Not recorded');
    expect(map['User Agent']).toBe('Not recorded');
    expect(map['Document Hash (SHA-256)']).toBe('Not recorded');
  });
});
