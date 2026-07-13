/**
 * Structured legal-document content. Documents are authored as data (not
 * markdown) so the legal pages can typeset them deliberately — numbered
 * sections, definition lists, contact blocks — without a markdown renderer.
 */

export type LegalBlock =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  /** Term–definition pairs (e.g. data categories in the privacy policy). */
  | { kind: 'defs'; entries: { term: string; def: string }[] };

export type LegalSection = {
  heading: string;
  body: LegalBlock[];
};

export type LegalDoc = {
  slug: 'terms' | 'developer-terms' | 'privacy';
  /** Full document title, e.g. "Terms of Use". */
  title: string;
  /** Short name used in cross-links and the footer, e.g. "Terms". */
  shortTitle: string;
  /** Human-readable effective date, e.g. "July 4, 2026". */
  effectiveDate: string;
  /** One-paragraph plain-language summary shown under the title. */
  intro: string;
  sections: LegalSection[];
};
