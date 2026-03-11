import { Resend } from 'resend';

let resend: Resend | null = null;

/** Escape HTML special characters to prevent injection in email templates */
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@seeko.gg';
const FROM_EMAIL = 'SEEKO Studio <noreply@seekostudios.com>';

/* ── Shared HTML helpers ─────────────────────────────────── */

const FONT_STACK = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif`;

/** Minimal shell: no background, centered content, max-width constraint */
function shell(inner: string, width = 540): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:${FONT_STACK};">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="${width}" cellpadding="0" cellspacing="0" style="text-align:left;">
        ${inner}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Bold "SEEKO" brand mark — large text, like SCRL reference */
function brandHeader(): string {
  return `<tr><td style="padding:0 0 32px;">
  <p style="margin:0;font-size:32px;font-weight:800;color:#111;letter-spacing:-0.5px;">SEEKO</p>
</td></tr>`;
}

/** Thin divider */
function divider(): string {
  return `<tr><td style="padding:0;"><div style="height:1px;background:#e5e5e5;margin:0;"></div></td></tr>`;
}

/** Footer disclaimer */
function footer(text: string): string {
  return `<tr><td style="padding:24px 0 0;">
  <p style="margin:0;font-size:13px;color:#999;line-height:1.5;">${text}</p>
</td></tr>`;
}

/** Individual digit boxes for codes — like SCRL.
 *  Uses padding on cells for spacing (no spacer cells or invisible chars). */
function codeDigits(code: string): string {
  const cells = code
    .split('')
    .map(
      (d, i) => {
        const pl = i === 0 ? '0' : '4px';
        const pr = i === code.length - 1 ? '0' : '4px';
        return `<td style="padding:0 ${pr} 0 ${pl};"><div style="width:44px;height:52px;background:#f3f3f3;border-radius:8px;text-align:center;line-height:52px;font-size:24px;font-weight:700;color:#111;font-family:'SF Mono','Fira Code','Courier New',monospace;">${d}</div></td>`;
      }
    )
    .join('');

  return `<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>${cells}</tr></table>`;
}

/* ── 1. Team Invite Email ────────────────────────────────── */

export interface SendAgreementEmailParams {
  recipientEmail: string;
  signerName: string;
  pdfBytes: Uint8Array;
  title: string;
  sections: { number: number; title: string; content: string }[];
}

interface SendInviteEmailParams {
  recipientEmail: string;
  inviteCode: string;
}

export async function sendInviteEmail({ recipientEmail, inviteCode }: SendInviteEmailParams) {
  const r = getResend();
  await r.emails.send({
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: "You're invited to SEEKO Studio",
    html: shell(`
      ${brandHeader()}
      ${divider()}
      <tr><td style="padding:32px 0;">
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111;">Join the team.</h1>
        <p style="margin:0 0 32px;font-size:15px;color:#666;line-height:1.6;">You've been added to SEEKO Studio. Use the code below to complete your account setup.</p>
        <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#999;letter-spacing:1px;text-transform:uppercase;text-align:center;">Invite Code:</p>
        ${codeDigits(inviteCode)}
        <p style="margin:28px 0 0;font-size:14px;color:#999;line-height:1.6;">This code expires in 24 hours. Enter it on the login page under <strong style="color:#666;">Join the team</strong>.</p>
      </td></tr>
      ${divider()}
      ${footer("If you didn't expect this invite, you can safely ignore it.")}
    `),
  });
}

/* ── 2. Agreement Signed Copy ────────────────────────────── */

function buildAgreementHtml(
  title: string,
  sections: { number: number; title: string; content: string }[],
  signerName: string,
  signedDate: string
): string {
  const sectionRows = sections.map(
    (s) => `
      <tr><td style="padding:0 0 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="28" valign="top" style="padding-top:2px;">
              <div style="width:24px;height:24px;border-radius:6px;background:#f3f3f3;text-align:center;line-height:24px;font-size:11px;font-family:'Courier New',monospace;color:#999;">${s.number}</div>
            </td>
            <td style="padding-left:12px;">
              <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#111;">${esc(s.title)}</p>
              <div style="font-size:14px;color:#555;line-height:1.65;">${s.content}</div>
            </td>
          </tr>
        </table>
      </td></tr>`
  ).join('');

  return shell(`
    ${brandHeader()}
    ${divider()}
    <!-- Intro -->
    <tr><td style="padding:32px 0 16px;">
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">${esc(title)}</h1>
      <p style="margin:0;font-size:14px;color:#999;">Signed copy for your records</p>
    </td></tr>
    <!-- Signer info -->
    <tr><td style="padding:0 0 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#999;letter-spacing:1px;text-transform:uppercase;">Signed by</p>
            <p style="margin:0;font-size:15px;font-weight:600;color:#111;">${esc(signerName)}</p>
          </td>
          <td style="padding:16px 20px;text-align:right;">
            <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#999;letter-spacing:1px;text-transform:uppercase;">Date</p>
            <p style="margin:0;font-size:15px;color:#111;">${esc(signedDate)}</p>
          </td>
        </tr>
      </table>
    </td></tr>
    ${divider()}
    <!-- Sections -->
    <tr><td style="height:24px;"></td></tr>
    ${sectionRows}
    <!-- Signature -->
    <tr><td style="padding:8px 0 32px;">
      <div style="border-top:1px solid #e5e5e5;padding-top:24px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#999;letter-spacing:1.5px;text-transform:uppercase;">Digital Signature</p>
        <p style="margin:0 0 8px;font-size:28px;font-family:'Caveat','Segoe Script','Brush Script MT',cursive;color:#111;">${esc(signerName)}</p>
        <div style="width:180px;height:1px;background:#ccc;margin-bottom:16px;"></div>
        <p style="margin:0;font-size:13px;color:#999;">Signed electronically via SEEKO Studio</p>
      </div>
    </td></tr>
    ${divider()}
    ${footer("A signed PDF copy is attached to this email. Please keep it for your records.")}
  `, 600);
}

export async function sendAgreementEmail({
  recipientEmail,
  signerName,
  pdfBytes,
  title,
  sections,
}: SendAgreementEmailParams) {
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
  const fileName = `SEEKO_Agreement_${signerName.replace(/\s+/g, '_')}.pdf`;
  const signedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const signerHtml = buildAgreementHtml(title, sections, signerName, signedDate);

  const r = getResend();
  await Promise.all([
    r.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: `Your ${title} — Signed Copy`,
      html: signerHtml,
      attachments: [{ filename: fileName, content: pdfBase64 }],
    }),
    r.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `${title} Signed: ${signerName}`,
      text: `${signerName} (${recipientEmail}) has signed the ${title} on ${signedDate}.\n\nSigned copy is attached.`,
      attachments: [{ filename: fileName, content: pdfBase64 }],
    }),
  ]);
}

/* ── 3. External Signing Invite ──────────────────────────── */

export interface SendExternalInviteEmailParams {
  recipientEmail: string;
  token: string;
  personalNote?: string;
  templateName: string;
  expiresAt: Date;
}

export async function sendExternalInviteEmail({
  recipientEmail,
  token,
  personalNote,
  templateName,
  expiresAt,
}: SendExternalInviteEmailParams): Promise<void> {
  const signUrl = `${process.env.NEXT_PUBLIC_APP_URL}/sign/${token}`;
  const expiresFormatted = expiresAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const noteBlock = personalNote
    ? `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;">
        <tr>
          <td width="28" valign="top" style="padding-top:2px;font-size:24px;color:#ccc;font-family:Georgia,serif;">&ldquo;</td>
          <td style="padding:0 0 0 4px;">
            <p style="margin:0 0 6px;font-size:15px;color:#333;line-height:1.5;font-style:italic;">${esc(personalNote)}</p>
            <p style="margin:0;font-size:12px;color:#aaa;">&mdash; the sender</p>
          </td>
        </tr>
      </table>`
    : '';

  const r = getResend();
  await r.emails.send({
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: `You've been invited to sign: ${templateName}`,
    html: shell(`
      ${brandHeader()}
      ${divider()}
      <tr><td style="padding:32px 0;">
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111;">${esc(templateName)}</h1>
        <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">You've been invited to review and sign this document. Click below to get started.</p>
        ${noteBlock}
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr><td align="center">
            <a href="${signUrl}" style="display:inline-block;background:#111;color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Review &amp; Sign Document</a>
          </td></tr>
        </table>
        <p style="margin:24px 0 0;font-size:13px;color:#999;line-height:1.6;text-align:center;">This link expires on ${expiresFormatted}</p>
      </td></tr>
      ${divider()}
      ${footer("If you didn't expect this email, you can safely ignore it.")}
    `),
  });
}

/* ── 4. Invoice Request ──────────────────────────────────── */

export interface SendInvoiceRequestEmailParams {
  recipientEmail: string;
  token: string;
  personalNote: string | null;
  expiresAt: Date;
}

export async function sendInvoiceRequestEmail({
  recipientEmail,
  token,
  personalNote,
  expiresAt,
}: SendInvoiceRequestEmailParams): Promise<void> {
  const invoiceUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invoice/${token}`;
  const expiresFormatted = expiresAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const noteBlock = personalNote
    ? `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;">
        <tr>
          <td width="28" valign="top" style="padding-top:2px;font-size:24px;color:#ccc;font-family:Georgia,serif;">&ldquo;</td>
          <td style="padding:0 0 0 4px;">
            <p style="margin:0 0 6px;font-size:15px;color:#333;line-height:1.5;font-style:italic;">${esc(personalNote)}</p>
            <p style="margin:0;font-size:12px;color:#aaa;">&mdash; the sender</p>
          </td>
        </tr>
      </table>`
    : '';

  const r = getResend();
  await r.emails.send({
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: 'Invoice Request — SEEKO Studio',
    html: shell(`
      ${brandHeader()}
      ${divider()}
      <tr><td style="padding:32px 0;">
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111;">Invoice Request</h1>
        <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">You've been asked to submit an invoice. Click below to fill in your line items and payment details.</p>
        ${noteBlock}
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr><td align="center">
            <a href="${invoiceUrl}" style="display:inline-block;background:#111;color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Submit Invoice</a>
          </td></tr>
        </table>
        <p style="margin:24px 0 0;font-size:13px;color:#999;line-height:1.6;text-align:center;">This link expires on ${expiresFormatted}</p>
      </td></tr>
      ${divider()}
      ${footer("If you didn't expect this email, you can safely ignore it.")}
    `),
  });
}

/* ── 5. Doc Share ────────────────────────────────────────── */

export interface SendDocShareEmailParams {
  recipientEmail: string;
  token: string;
  docTitle: string;
  personalNote?: string | null;
  expiresAt: Date;
}

export async function sendDocShareEmail({
  recipientEmail,
  token,
  docTitle,
  personalNote,
  expiresAt,
}: SendDocShareEmailParams): Promise<void> {
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/shared/${token}`;
  const expiresFormatted = expiresAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const noteBlock = personalNote
    ? `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;">
        <tr>
          <td width="28" valign="top" style="padding-top:2px;font-size:24px;color:#ccc;font-family:Georgia,serif;">&ldquo;</td>
          <td style="padding:0 0 0 4px;">
            <p style="margin:0 0 6px;font-size:15px;color:#333;line-height:1.5;font-style:italic;">${esc(personalNote)}</p>
            <p style="margin:0;font-size:12px;color:#aaa;">&mdash; the sender</p>
          </td>
        </tr>
      </table>`
    : '';

  const r = getResend();
  await r.emails.send({
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: `Shared Document — ${esc(docTitle)}`,
    html: shell(`
      ${brandHeader()}
      ${divider()}
      <tr><td style="padding:32px 0;">
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111;">Document Shared With You</h1>
        <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">You've been given access to <strong>${esc(docTitle)}</strong>. Click below to verify your identity and view the document.</p>
        ${noteBlock}
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr><td align="center">
            <a href="${shareUrl}" style="display:inline-block;background:#111;color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">View Document</a>
          </td></tr>
        </table>
        <p style="margin:24px 0 0;font-size:13px;color:#999;line-height:1.6;text-align:center;">This link expires on ${expiresFormatted}</p>
      </td></tr>
      ${divider()}
      ${footer("If you didn't expect this email, you can safely ignore it.")}
    `),
  });
}

/* ── 6. Verification Code ────────────────────────────────── */

export interface SendVerificationCodeEmailParams {
  recipientEmail: string;
  code: string;
}

export async function sendVerificationCodeEmail({
  recipientEmail,
  code,
}: SendVerificationCodeEmailParams): Promise<void> {
  const r = getResend();
  await r.emails.send({
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: 'Your verification code — SEEKO Studio',
    html: shell(`
      ${brandHeader()}
      ${divider()}
      <tr><td style="padding:32px 0;">
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111;">Verification Code.</h1>
        <p style="margin:0 0 32px;font-size:15px;color:#666;line-height:1.6;">Enter this code to verify your identity and access the document.</p>
        <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#999;letter-spacing:1px;text-transform:uppercase;text-align:center;">One-Time Password:</p>
        ${codeDigits(code)}
        <p style="margin:28px 0 0;font-size:14px;color:#999;line-height:1.6;text-align:center;">This code expires in 10 minutes. Do not share it with anyone.</p>
      </td></tr>
      ${divider()}
      ${footer("If you didn't request this code, you can safely ignore this email.")}
    `),
  });
}

/* ── Bug Report Email ────────────────────────────────────── */

interface SendBugReportEmailParams {
  description: string;
  pageUrl: string;
  screenshotUrl?: string;
  userAgent: string;
  screenSize: string;
  isPwa: boolean;
  reporterName: string;
  reporterEmail: string;
}

export async function sendBugReportEmail(params: SendBugReportEmailParams) {
  const r = getResend();

  const screenshotRow = params.screenshotUrl
    ? `<tr><td style="padding:16px 0 0;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#111;">Screenshot</p>
        <img src="${esc(params.screenshotUrl)}" alt="Bug screenshot" style="max-width:100%;border-radius:8px;border:1px solid #e5e5e5;" />
      </td></tr>`
    : '';

  const html = shell(`
    ${brandHeader()}
    <tr><td style="padding:0 0 24px;">
      <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111;">Bug Report</p>
      <p style="margin:0;font-size:14px;color:#666;">From ${esc(params.reporterName)} (${esc(params.reporterEmail)})</p>
    </td></tr>
    ${divider()}
    <tr><td style="padding:16px 0 0;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#111;">Description</p>
      <p style="margin:0;font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap;">${esc(params.description)}</p>
    </td></tr>
    ${screenshotRow}
    ${divider()}
    <tr><td style="padding:16px 0 0;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#111;">Context</p>
      <table cellpadding="0" cellspacing="0" style="font-size:13px;color:#666;line-height:1.8;">
        <tr><td style="padding-right:12px;font-weight:600;color:#444;">Page</td><td>${esc(params.pageUrl)}</td></tr>
        <tr><td style="padding-right:12px;font-weight:600;color:#444;">Screen</td><td>${esc(params.screenSize)}</td></tr>
        <tr><td style="padding-right:12px;font-weight:600;color:#444;">PWA</td><td>${params.isPwa ? 'Yes' : 'No'}</td></tr>
        <tr><td style="padding-right:12px;font-weight:600;color:#444;">Browser</td><td style="word-break:break-all;">${esc(params.userAgent)}</td></tr>
      </table>
    </td></tr>
    ${footer('This bug report was submitted from the SEEKO Studio dashboard.')}
  `);

  const subject = `[Bug Report] ${params.description.slice(0, 50)}${params.description.length > 50 ? '…' : ''}`;

  await r.emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    replyTo: params.reporterEmail,
    subject,
    html,
  });
}
