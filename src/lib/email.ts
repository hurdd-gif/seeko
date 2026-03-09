import { Resend } from 'resend';
import { AGREEMENT_SECTIONS, AGREEMENT_TITLE } from '@/lib/agreement-text';

let resend: Resend | null = null;

function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@seeko.gg';
const FROM_EMAIL = 'SEEKO Studio <noreply@seekostudios.com>';

interface SendAgreementEmailParams {
  recipientEmail: string;
  signerName: string;
  pdfBytes: Uint8Array;
}

interface SendInviteEmailParams {
  recipientEmail: string;
  inviteCode: string;
}

export async function sendInviteEmail({ recipientEmail, inviteCode }: SendInviteEmailParams) {
  const spaced = inviteCode.split('').join(' ');
  const r = getResend();
  await r.emails.send({
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: "You're invited to SEEKO Studio",
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f0f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;border:1px solid #e0e0e0;overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:28px 36px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#111;">SEEKO Studio</p>
        </td></tr>
        <tr><td style="padding:0;"><div style="height:1px;background:#e5e5e5;"></div></td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 36px 28px;">
          <h1 style="margin:0 0 12px;font-size:26px;font-weight:700;color:#111;">You've been invited</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#666;line-height:1.6;">You've been added to the SEEKO Studio team. Use the code below to complete your account setup.</p>
          <!-- Code box -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <div style="background:#f5f5f5;border:1px solid #e0e0e0;border-radius:10px;padding:24px 20px;text-align:center;">
                <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#888;letter-spacing:2px;text-transform:uppercase;">Your Invite Code</p>
                <p style="margin:0;font-size:36px;font-weight:700;color:#059669;letter-spacing:6px;font-family:'Courier New',monospace;">${spaced}</p>
              </div>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:14px;color:#888;line-height:1.6;">This code expires in 24 hours. Enter it on the SEEKO Studio login page under the <strong style="color:#555;">Join the team</strong> tab.</p>
        </td></tr>
        <tr><td style="padding:0;"><div style="height:1px;background:#e5e5e5;"></div></td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 36px;">
          <p style="margin:0;font-size:13px;color:#aaa;">If you didn't expect this invite, you can safely ignore it.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

function buildAgreementHtml(signerName: string, signedDate: string): string {
  const sectionRows = AGREEMENT_SECTIONS.map(
    (s) => `
      <tr><td style="padding:0 36px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="32" valign="top" style="padding-top:2px;">
              <div style="width:24px;height:24px;border-radius:4px;background:#f5f5f5;text-align:center;line-height:24px;font-size:11px;font-family:'Courier New',monospace;color:#888;">${s.number}</div>
            </td>
            <td style="padding-left:12px;">
              <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#111;">${s.title}</p>
              <div style="font-size:14px;color:#555;line-height:1.65;">${s.content}</div>
            </td>
          </tr>
        </table>
      </td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f0f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;border:1px solid #e0e0e0;overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:28px 36px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#111;">SEEKO Studio</p>
        </td></tr>
        <tr><td style="padding:0;"><div style="height:1px;background:#e5e5e5;"></div></td></tr>

        <!-- Intro -->
        <tr><td style="padding:36px 36px 12px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">${AGREEMENT_TITLE}</h1>
          <p style="margin:0 0 4px;font-size:14px;color:#888;">Signed copy for your records</p>
        </td></tr>

        <!-- Signer info -->
        <tr><td style="padding:16px 36px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #eee;border-radius:8px;">
            <tr>
              <td style="padding:16px 20px;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#888;letter-spacing:1px;text-transform:uppercase;">Signed by</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:#111;">${signerName}</p>
              </td>
              <td style="padding:16px 20px;text-align:right;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#888;letter-spacing:1px;text-transform:uppercase;">Date</p>
                <p style="margin:0;font-size:15px;color:#111;">${signedDate}</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 36px 24px;"><div style="height:1px;background:#e5e5e5;"></div></td></tr>

        <!-- Agreement sections -->
        ${sectionRows}

        <!-- Signature block -->
        <tr><td style="padding:8px 36px 32px;">
          <div style="border-top:1px solid #e5e5e5;padding-top:24px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#888;letter-spacing:1.5px;text-transform:uppercase;">Digital Signature</p>
            <p style="margin:0 0 8px;font-size:28px;font-family:'Caveat','Segoe Script','Brush Script MT',cursive;color:#111;">${signerName}</p>
            <div style="width:180px;height:1px;background:#ccc;margin-bottom:16px;"></div>
            <p style="margin:0;font-size:13px;color:#888;">Signed electronically via SEEKO Studio</p>
          </div>
        </td></tr>

        <tr><td style="padding:0;"><div style="height:1px;background:#e5e5e5;"></div></td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 36px;">
          <p style="margin:0;font-size:13px;color:#aaa;">A signed PDF copy is attached to this email. Please keep it for your records.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendAgreementEmail({
  recipientEmail,
  signerName,
  pdfBytes,
}: SendAgreementEmailParams) {
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
  const fileName = `SEEKO_Agreement_${signerName.replace(/\s+/g, '_')}.pdf`;
  const signedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const signerHtml = buildAgreementHtml(signerName, signedDate);

  const r = getResend();
  await Promise.all([
    r.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: 'Your SEEKO Onboarding Agreement — Signed Copy',
      html: signerHtml,
      attachments: [{ filename: fileName, content: pdfBase64 }],
    }),
    r.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `NDA Signed: ${signerName}`,
      text: `${signerName} (${recipientEmail}) has signed the SEEKO Onboarding Agreement on ${signedDate}.\n\nSigned copy is attached.`,
      attachments: [{ filename: fileName, content: pdfBase64 }],
    }),
  ]);
}
