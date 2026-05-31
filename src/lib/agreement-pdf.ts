import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';

interface PdfSigner {
  fullName: string;
  address: string;
  email: string;
  signedAt: Date;
  department?: string;
  role?: string;
  engagementType?: 'team_member' | 'contractor';
  minorName?: string;
}

interface PdfInput {
  title: string;
  sections: { number: number; title: string; content: string }[];
  signer: PdfSigner;
  /* ── Certificate of Completion (external signing only) ──────────────────
   * When `envelopeId` OR `integrityHash` is provided, a Certificate of
   * Completion page is appended documenting the electronic-execution audit
   * trail (ESIGN/UETA). Onboarding omits these → no certificate page, so the
   * onboarding PDF is byte-for-byte unchanged. `ip`/`userAgent` are optional
   * even when the certificate is rendered: legacy/missing-header signs print
   * "Not recorded" for the absent field rather than fabricating a value. */
  envelopeId?: string | null;
  integrityHash?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface CertificateFields {
  envelopeId?: string | null;
  integrityHash?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  signerName: string;
  signerEmail: string;
  signedAt: Date;
}

const NOT_RECORDED = 'Not recorded';

/** A field's value, or "Not recorded" when null/undefined/blank. Never fabricate
 * an audit value (a spoofed IP/UA would poison the legal record) — absence is
 * surfaced honestly. */
function orNotRecorded(v: string | null | undefined): string {
  return v && v.trim() ? v : NOT_RECORDED;
}

/** Pure builder for the Certificate of Completion's label/value rows. Extracted
 * so the formatting + "Not recorded" degradation is unit-testable without
 * parsing a PDF. The signed timestamp is stamped in UTC with an explicit
 * timezone label so the certificate is unambiguous and host-timezone-independent. */
export function buildCertificateRows(f: CertificateFields): { label: string; value: string }[] {
  const signedStr = f.signedAt.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
    timeZone: 'UTC',
  });
  return [
    { label: 'Envelope ID', value: orNotRecorded(f.envelopeId) },
    { label: 'Signer', value: orNotRecorded(f.signerName) },
    { label: 'Email', value: orNotRecorded(f.signerEmail) },
    { label: 'Signed', value: signedStr },
    { label: 'IP Address', value: orNotRecorded(f.ip) },
    { label: 'User Agent', value: orNotRecorded(f.userAgent) },
    { label: 'Document Hash (SHA-256)', value: orNotRecorded(f.integrityHash) },
  ];
}

/** Strip HTML tags for plain-text PDF rendering */
function stripHtml(html: string): string {
  return html
    .replace(/<\/?(p|div|br)\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '\n      (a) ')
    .replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&middot;/g, '\u00B7')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, ' -- ')
    .replace(/&ndash;/g, '-')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ── Layout ──────────────────────────────────────────────── */
const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 72; // 1 inch
const MAX_W = PAGE_W - 2 * MARGIN;
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.4, 0.4, 0.4);

export async function generateAgreementPdf(input: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const timesRoman = await doc.embedFont(StandardFonts.TimesRoman);
  const timesBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  let pageNum = 1;

  const dateStr = input.signer.signedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  /* ── Helpers ─────────────────────────────────────────── */

  function addFooter(p: PDFPage, num: number) {
    const text = `Page ${num}`;
    const w = timesRoman.widthOfTextAtSize(text, 9);
    p.drawText(text, {
      x: (PAGE_W - w) / 2,
      y: 36,
      size: 9,
      font: timesRoman,
      color: GRAY,
    });
  }

  function newPage() {
    addFooter(page, pageNum);
    page = doc.addPage([PAGE_W, PAGE_H]);
    pageNum++;
    y = PAGE_H - MARGIN;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      newPage();
    }
  }

  function wrapLines(text: string, size: number, f: PDFFont, maxW: number): string[] {
    const lines: string[] = [];
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(test, size) > maxW) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawWrapped(text: string, size: number, f: PDFFont, lineH: number, indent = 0) {
    const lines = wrapLines(text, size, f, MAX_W - indent);
    for (const line of lines) {
      ensureSpace(lineH);
      page.drawText(line, { x: MARGIN + indent, y, size, font: f, color: BLACK });
      y -= lineH;
    }
  }

  function drawCentered(text: string, size: number, f: PDFFont) {
    const w = f.widthOfTextAtSize(text, size);
    ensureSpace(size + 4);
    page.drawText(text, { x: (PAGE_W - w) / 2, y, size, font: f, color: BLACK });
    y -= size + 4;
  }

  function drawRule() {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: BLACK,
    });
    y -= 8;
  }

  /* ── Title block (centered, formal) ──────────────────── */

  drawCentered('SEEKO STUDIOS, INC.', 14, timesBold);
  y -= 8;
  drawCentered(input.title.toUpperCase(), 16, timesBold);
  y -= 12;
  drawRule();
  y -= 4;

  // Effective date
  drawWrapped(`Effective Date: ${dateStr}`, 10, timesRoman, 14);
  y -= 8;

  // Parties clause
  drawWrapped(
    `This ${input.title} ("Agreement") is entered into as of the date last signed below, by and between:`,
    10, timesRoman, 14
  );
  y -= 6;

  // Disclosing party
  drawWrapped(
    'SEEKO Studios, Inc., a Virginia company ("Company" or "Disclosing Party"); and',
    10, timesBold, 14, 24
  );
  y -= 6;

  // Receiving party
  const signerLabel = input.signer.engagementType === 'contractor'
    ? '"Contractor" or "Receiving Party"'
    : '"Receiving Party"';
  const isGuardian = !!input.signer.minorName;
  if (isGuardian) {
    drawWrapped(
      `${input.signer.fullName}, ${input.signer.address}, ${input.signer.email}, acting as parent/legal guardian on behalf of ${input.signer.minorName} (${signerLabel}).`,
      10, timesBold, 14, 24
    );
  } else {
    drawWrapped(
      `${input.signer.fullName}, ${input.signer.address}, ${input.signer.email} (${signerLabel}).`,
      10, timesBold, 14, 24
    );
  }
  y -= 6;

  drawWrapped(
    'Each a "Party" and collectively the "Parties."',
    10, timesItalic, 14
  );
  y -= 12;

  /* ── Agreement sections ──────────────────────────────── */

  for (const section of input.sections) {
    ensureSpace(40);

    // Section heading
    const heading = `${section.number}. ${section.title.toUpperCase()}`;
    drawWrapped(heading, 10.5, timesBold, 14);
    y -= 4;

    // Section body
    const plainText = stripHtml(section.content);
    // Re-label bullet list items with (a), (b), (c)
    let bulletIdx = 0;
    for (const paragraph of plainText.split('\n')) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('(a)')) {
        // Already labeled by stripHtml — replace generic (a) with proper letter
        const letter = String.fromCharCode(97 + bulletIdx);
        bulletIdx++;
        const content = trimmed.replace(/^\(a\)\s*/, '');
        drawWrapped(`(${letter})  ${content}`, 10, timesRoman, 14, 24);
      } else {
        bulletIdx = 0;
        drawWrapped(trimmed, 10, timesRoman, 14);
      }
      y -= 3;
    }
    y -= 6;
  }

  /* ── Signature block ─────────────────────────────────── */

  y -= 12;
  ensureSpace(160);

  drawWrapped('IN WITNESS WHEREOF, the undersigned has executed this Agreement as of the date set forth below.', 10, timesItalic, 14);
  y -= 24;

  // Signature
  page.drawText(input.signer.fullName, {
    x: MARGIN,
    y,
    size: 18,
    font: timesItalic,
    color: rgb(0.05, 0.05, 0.2),
  });
  y -= 6;

  // Signature line
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + 250, y },
    thickness: 0.75,
    color: BLACK,
  });
  y -= 16;

  // Name
  page.drawText(`Name:  ${input.signer.fullName}`, {
    x: MARGIN,
    y,
    size: 10,
    font: timesRoman,
    color: BLACK,
  });
  y -= 16;

  // Date
  page.drawText(`Date:  ${dateStr}`, {
    x: MARGIN,
    y,
    size: 10,
    font: timesRoman,
    color: BLACK,
  });
  y -= 16;

  // Email
  page.drawText(`Email:  ${input.signer.email}`, {
    x: MARGIN,
    y,
    size: 10,
    font: timesRoman,
    color: BLACK,
  });
  y -= 16;

  // Address
  page.drawText(`Address:  ${input.signer.address}`, {
    x: MARGIN,
    y,
    size: 10,
    font: timesRoman,
    color: BLACK,
  });
  y -= 24;

  // Minor's name (guardian signing)
  if (input.signer.minorName) {
    page.drawText(`Signing on behalf of:  ${input.signer.minorName}`, {
      x: MARGIN,
      y,
      size: 10,
      font: timesRoman,
      color: BLACK,
    });
    y -= 24;
  }

  // Electronic notice
  page.drawText('This document was signed electronically via SEEKO Studio.', {
    x: MARGIN,
    y,
    size: 8,
    font: timesItalic,
    color: GRAY,
  });

  /* ── Certificate of Completion ───────────────────────────
   * Appended only for audited e-signs (envelopeId/integrityHash present), on
   * its own page. `newPage()` foots the final agreement page and opens the
   * certificate page; the trailing addFooter then foots the certificate page. */
  if (input.envelopeId || input.integrityHash) {
    newPage();

    drawCentered('CERTIFICATE OF COMPLETION', 14, timesBold);
    y -= 8;
    drawRule();
    y -= 6;

    drawWrapped(
      'This certificate records the electronic execution of the agreement above, captured by SEEKO Studio in accordance with the U.S. ESIGN Act and the Uniform Electronic Transactions Act (UETA).',
      9.5, timesItalic, 13
    );
    y -= 14;

    const rows = buildCertificateRows({
      envelopeId: input.envelopeId,
      integrityHash: input.integrityHash,
      ip: input.ip,
      userAgent: input.userAgent,
      signerName: input.signer.fullName,
      signerEmail: input.signer.email,
      signedAt: input.signer.signedAt,
    });

    for (const { label, value } of rows) {
      ensureSpace(30);
      // Uppercase field label (matches this document's existing title/heading
      // convention; this is a formal legal certificate, not app UI chrome).
      page.drawText(label.toUpperCase(), { x: MARGIN, y, size: 8, font: timesBold, color: GRAY });
      y -= 13;
      drawWrapped(value, 10.5, timesRoman, 14);
      y -= 9;
    }

    y -= 6;
    drawWrapped(
      'The signer consented to transact electronically and to the use of electronic records and signatures for this agreement. The document hash above uniquely identifies the exact agreement content that was signed; any later modification of that content would produce a different hash.',
      8.5, timesItalic, 12
    );
  }

  // Add footer to the last page (agreement page, or certificate page if appended)
  addFooter(page, pageNum);

  return doc.save();
}
