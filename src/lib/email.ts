import { Resend } from 'resend';

let resend: Resend | null = null;

function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@seeko.gg';
const FROM_EMAIL = 'SEEKO Studio <noreply@seeko.gg>';

interface SendAgreementEmailParams {
  recipientEmail: string;
  signerName: string;
  pdfBytes: Uint8Array;
}

export async function sendAgreementEmail({
  recipientEmail,
  signerName,
  pdfBytes,
}: SendAgreementEmailParams) {
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
  const fileName = `SEEKO_Agreement_${signerName.replace(/\s+/g, '_')}.pdf`;

  // Send to both the signer and admin
  const r = getResend();
  await Promise.all([
    r.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: 'Your SEEKO Onboarding Agreement — Signed Copy',
      text: `Hi ${signerName},\n\nAttached is your signed copy of the SEEKO Onboarding Agreement.\n\nPlease keep this for your records.\n\n— SEEKO Team`,
      attachments: [{ filename: fileName, content: pdfBase64 }],
    }),
    r.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `NDA Signed: ${signerName}`,
      text: `${signerName} (${recipientEmail}) has signed the SEEKO Onboarding Agreement.\n\nSigned copy is attached.`,
      attachments: [{ filename: fileName, content: pdfBase64 }],
    }),
  ]);
}
