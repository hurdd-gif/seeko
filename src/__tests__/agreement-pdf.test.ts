import { describe, it, expect } from 'vitest';
import { generateAgreementPdf } from '@/lib/agreement-pdf';

describe('generateAgreementPdf', () => {
  it('returns a Uint8Array with valid PDF magic bytes', async () => {
    const pdf = await generateAgreementPdf({
      title: 'Non-Disclosure Agreement',
      sections: [{ number: 1, title: 'Confidentiality', content: '<p>Test content</p>' }],
      signer: {
        fullName: 'John Doe',
        address: '123 Main St, New York, NY 10001',
        email: 'john@seeko.gg',
        department: 'Coding',
        role: 'Engineer',
        engagementType: 'team_member',
        signedAt: new Date('2026-03-08T12:00:00Z'),
      },
    });

    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(100);
    // PDF magic bytes: %PDF
    expect(String.fromCharCode(pdf[0], pdf[1], pdf[2], pdf[3])).toBe('%PDF');
  });
});
