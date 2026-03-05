/**
 * Fallback PDF generator using pdf-lib when @react-pdf/renderer fails (e.g. in Next.js dev).
 * Produces a simple text-based PDF with the same content as InvestorSummaryPDF.
 * When logoPngBytes is provided, draws a black header bar and the logo (e.g. white SEEKO) on it.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { InvestorSummaryPDFData } from '@/lib/investor-summary-pdf-data';

const MARGIN = 50;
const HEADER_HEIGHT = 44;
const LOGO_HEIGHT = 24;
const LINE_HEIGHT = 14;
const TITLE_SIZE = 18;
const SECTION_SIZE = 12;
const BODY_SIZE = 10;

export async function buildFallbackPDF(
  data: InvestorSummaryPDFData,
  logoPngBytes?: Uint8Array
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  let y = height - MARGIN;

  // Black header bar + logo or SEEKO text (same as React-PDF version)
  page.drawRectangle({
    x: 0,
    y: height - HEADER_HEIGHT,
    width,
    height: HEADER_HEIGHT,
    color: rgb(0, 0, 0),
  });
  let logoDrawn = false;
  if (logoPngBytes && logoPngBytes.length > 0) {
    try {
      const image = await doc.embedPng(logoPngBytes);
      const scale = LOGO_HEIGHT / image.height;
      const logoWidth = image.width * scale;
      page.drawImage(image, {
        x: MARGIN,
        y: height - HEADER_HEIGHT + (HEADER_HEIGHT - LOGO_HEIGHT) / 2,
        width: logoWidth,
        height: LOGO_HEIGHT,
      });
      logoDrawn = true;
    } catch {
      // Fall through to text fallback
    }
  }
  if (!logoDrawn) {
    page.drawText('SEEKO', {
      x: MARGIN,
      y: height - HEADER_HEIGHT + (HEADER_HEIGHT - 18) / 2,
      size: 18,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
  }

  // Content starts below header
  y = height - HEADER_HEIGHT - MARGIN;

  function drawText(text: string, opts: { size?: number; bold?: boolean; x?: number } = {}) {
    const size = opts.size ?? BODY_SIZE;
    const f = opts.bold ? fontBold : font;
    const x = opts.x ?? MARGIN;
    page.drawText(text, { x, y, size, font: f, color: rgb(0, 0, 0) });
    y -= size + 2;
  }

  const dateStr = new Date(data.generatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' });

  drawText('Investor Summary', { size: TITLE_SIZE, bold: true });
  drawText(`Current state of SEEKO — ${dateStr}`, { size: 11 });
  y -= 4;

  if (data.lastUpdated) drawText(`Updated ${data.lastUpdated}`);
  if (data.atAGlance) drawText(data.atAGlance);
  if (data.teamCount > 0) drawText(`Team: ${data.teamCount} ${data.teamCount === 1 ? 'person' : 'people'}`);
  if (data.phaseSummary) drawText(`Phases: ${data.phaseSummary}`);
  y -= LINE_HEIGHT;

  drawText('Game Areas', { size: SECTION_SIZE, bold: true });
  y -= 4;
  if (data.areas.length === 0) {
    drawText('No game areas yet.');
  } else {
    for (const area of data.areas) {
      const meta = [area.phase, area.status].filter(Boolean).join(' · ');
      drawText(`${area.name} — ${meta} — ${area.progress}%`);
    }
  }
  y -= LINE_HEIGHT;

  drawText('Recent Tasks', { size: SECTION_SIZE, bold: true });
  y -= 4;
  if (data.recentTasks.length === 0) {
    drawText('No tasks yet.');
  } else {
    for (const task of data.recentTasks) {
      const parts = [task.status, task.assignee, task.due].filter(Boolean).join(' · ');
      drawText(`${task.name} — ${parts}`);
    }
  }
  y -= LINE_HEIGHT;

  drawText('This Week', { size: SECTION_SIZE, bold: true });
  y -= 4;
  if (data.updates.length === 0) {
    drawText('No updates yet.');
  } else {
    for (const bullet of data.updates) {
      drawText(`• ${bullet}`, { x: MARGIN + 8 });
    }
  }

  if (data.blocked > 0) {
    y -= LINE_HEIGHT;
    drawText(`${data.blocked} task(s) blocked. The team is actively working to unblock progress.`);
  }
  if (data.overdueCount > 0) {
    drawText(`${data.overdueCount} task(s) past due. The team is reprioritising and updating deadlines.`);
  }

  return doc.save();
}
