import { describe, expect, it } from 'vitest';
import { termsOfUse } from '../terms';
import { developerTerms } from '../developer-terms';
import { privacyPolicy } from '../privacy';
import type { LegalDoc } from '../types';

// Structural guardrails for the legal content: the /legal/:slug page derives
// its switcher, contents list, and section anchors from this data, so a doc
// with a wrong slug, empty section, or blank heading breaks the page silently.
const DOCS: LegalDoc[] = [termsOfUse, developerTerms, privacyPolicy];

describe('legal documents', () => {
  it('cover the three slugs the login footer links to', () => {
    expect(DOCS.map(d => d.slug)).toEqual(['terms', 'developer-terms', 'privacy']);
  });

  it.each(DOCS.map(d => [d.slug, d] as const))('%s is fully populated', (_slug, doc) => {
    expect(doc.title).toBeTruthy();
    expect(doc.shortTitle).toBeTruthy();
    expect(doc.effectiveDate).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
    expect(doc.intro.length).toBeGreaterThan(50);
    expect(doc.sections.length).toBeGreaterThanOrEqual(5);

    for (const section of doc.sections) {
      expect(section.heading).toBeTruthy();
      expect(section.body.length).toBeGreaterThan(0);
      for (const block of section.body) {
        if (block.kind === 'p') expect(block.text).toBeTruthy();
        if (block.kind === 'list') expect(block.items.length).toBeGreaterThan(0);
        if (block.kind === 'defs') {
          expect(block.entries.length).toBeGreaterThan(0);
          for (const entry of block.entries) {
            expect(entry.term).toBeTruthy();
            expect(entry.def).toBeTruthy();
          }
        }
      }
    }
  });

  it('every document ends with a contact section reaching the studio inbox', () => {
    for (const doc of DOCS) {
      const last = doc.sections[doc.sections.length - 1];
      expect(last.heading.toLowerCase()).toContain('contact');
      expect(JSON.stringify(last.body)).toContain('legal@seekostudios.com');
    }
  });
});
