import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { AGREEMENT_SECTIONS, AGREEMENT_TITLE } from './agreement-text';

interface PdfInput {
  fullName: string;
  address: string;
  email: string;
  department: string;
  role: string;
  engagementType: 'team_member' | 'contractor';
  signedAt: Date;
}

/** Strip HTML tags for plain-text PDF rendering */
function stripHtml(html: string): string {
  return html
    .replace(/<\/?(p|div|br)\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '\n  • ')
    .replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function generateAgreementPdf(input: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 612; // US Letter
  const PAGE_H = 792;
  const MARGIN = 60;
  const LINE_H = 14;
  const MAX_W = PAGE_W - 2 * MARGIN;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }

  function drawText(text: string, size: number, useBold = false) {
    const f = useBold ? fontBold : font;
    const words = text.split(' ');
    let line = '';

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(test, size) > MAX_W) {
        ensureSpace(LINE_H);
        page.drawText(line, { x: MARGIN, y, size, font: f, color: rgb(0, 0, 0) });
        y -= LINE_H;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      ensureSpace(LINE_H);
      page.drawText(line, { x: MARGIN, y, size, font: f, color: rgb(0, 0, 0) });
      y -= LINE_H;
    }
  }

  // Title
  drawText(AGREEMENT_TITLE.toUpperCase(), 16, true);
  y -= 10;

  // Signer info block
  drawText(`Name: ${input.fullName}`, 10);
  drawText(`Email: ${input.email}`, 10);
  drawText(`Department: ${input.department || 'N/A'}`, 10);
  drawText(`Role: ${input.role || 'N/A'}`, 10);
  drawText(`Engagement: ${input.engagementType === 'contractor' ? 'Independent Contractor' : 'Team Member'}`, 10);
  drawText(`Address: ${input.address}`, 10);
  y -= 10;

  // Agreement sections
  for (const section of AGREEMENT_SECTIONS) {
    y -= 8;
    drawText(`${section.number}. ${section.title}`, 11, true);
    y -= 4;

    const plainText = stripHtml(section.content);
    for (const paragraph of plainText.split('\n')) {
      if (paragraph.trim()) {
        drawText(paragraph.trim(), 9);
        y -= 4;
      }
    }
  }

  // Signature block
  y -= 20;
  ensureSpace(80);
  drawText('SIGNATURE', 12, true);
  y -= 10;
  drawText(`Printed Name: ${input.fullName}`, 10);
  drawText(`Date: ${input.signedAt.toISOString().split('T')[0]}`, 10);
  drawText(`Signed electronically via SEEKO Studio`, 9);

  return doc.save();
}
