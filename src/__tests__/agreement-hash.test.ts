import { describe, it, expect } from 'vitest';
import { computeAgreementHash } from '@/lib/agreement-hash';

const TITLE = 'Mutual Non-Disclosure Agreement';
const SECTIONS = [
  { number: 1, title: 'Confidentiality', content: '<p>Hold in strict confidence.</p>' },
  { number: 2, title: 'Term', content: '<p>Three years.</p>' },
];

describe('computeAgreementHash', () => {
  it('returns a 64-character lowercase hex string (SHA-256)', async () => {
    const hash = await computeAgreementHash(TITLE, SECTIONS);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — identical input yields an identical hash', async () => {
    const a = await computeAgreementHash(TITLE, SECTIONS);
    const b = await computeAgreementHash(TITLE, SECTIONS);
    expect(a).toBe(b);
  });

  it('is order-sensitive — reordering the sections changes the hash', async () => {
    const ordered = await computeAgreementHash(TITLE, SECTIONS);
    const reversed = await computeAgreementHash(TITLE, [SECTIONS[1], SECTIONS[0]]);
    expect(reversed).not.toBe(ordered);
  });

  it('is content-sensitive — changing one section body changes the hash', async () => {
    const original = await computeAgreementHash(TITLE, SECTIONS);
    const tampered = await computeAgreementHash(TITLE, [
      SECTIONS[0],
      { ...SECTIONS[1], content: '<p>Five years.</p>' },
    ]);
    expect(tampered).not.toBe(original);
  });

  it('is field-boundary safe — moving text across the title/content boundary changes the hash', async () => {
    // Guards against a naive concat (title+content) where "AB"+"" collides with "A"+"B".
    const a = await computeAgreementHash('AB', [{ number: 1, title: '', content: '' }]);
    const b = await computeAgreementHash('A', [{ number: 1, title: 'B', content: '' }]);
    expect(a).not.toBe(b);
  });
});
