import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { randomBytes, randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { getTemplateById } from '@/lib/external-agreement-templates';
import { sendExternalInviteEmail, sendReissueNotificationEmail } from '@/lib/email';
import { isSigningInvite } from '@/lib/invite-filters';
import type { ExternalSigningInvite } from '@/lib/types';

// Public, token-gated self-service: a signer whose link has EXPIRED can request a
// fresh one. Mints a new token + expiry and re-sends the signing email. Only ever
// acts on `expired` invites — never `revoked` (admin killed it on purpose), `signed`
// (already done), or still-live links — and never non-signing rows on the shared
// `external_signing_invites` table. Rate-limited per IP because each call emails the
// recipient (anti email-bombing).
const RATE_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 };
const REISSUE_DAYS = 7; // mirrors the admin SendInviteForm default window
const ipHits = new Map<string, { count: number; resetAt: number }>();

function isReissueRateLimited(ip: string): boolean {
  const now = Date.now();
  if (ipHits.size > 100) {
    for (const [key, entry] of ipHits) { if (now > entry.resetAt) ipHits.delete(key); }
  }
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  if (entry.count >= RATE_LIMIT.max) return true;
  entry.count++;
  return false;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token } = body;
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const clientIp = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  if (isReissueRateLimited(clientIp)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const service = getServiceClient();
  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, token, status, expires_at, recipient_email, template_type, template_id, custom_title, personal_note')
    .eq('token', token)
    .single() as { data: ExternalSigningInvite | null };

  // Unknown tokens AND non-signing rows return an identical 404 — never confirm the
  // existence of an invoice / doc-share token through the signing surface.
  if (!isSigningInvite(invite)) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  if (invite.status === 'signed') {
    return NextResponse.json({ error: 'This agreement has already been signed' }, { status: 409 });
  }
  if (invite.status === 'revoked') {
    return NextResponse.json(
      { error: 'This link was revoked. Contact the sender for a new one.' },
      { status: 403 },
    );
  }
  if (invite.status !== 'expired') {
    // pending / verified — the link is still usable, so there is nothing to reissue.
    return NextResponse.json({ error: 'This link is still active.' }, { status: 409 });
  }

  // Mint a fresh token + end-of-day expiry. Resolve the email's template name exactly
  // as the invite / resend routes do.
  const newToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REISSUE_DAYS);
  expiresAt.setHours(23, 59, 59, 999);

  const verificationCode = String(randomInt(100000, 1000000));
  const hashedCode = await bcrypt.hash(verificationCode, 10);

  let templateName = invite.custom_title || 'Document';
  if (invite.template_type === 'preset' && invite.template_id) {
    const template = getTemplateById(invite.template_id);
    templateName = template?.name || 'Document';
  }

  // Send the fresh link FIRST. If the email fails we surface a 502 and leave the invite
  // untouched (still `expired`) so the signer can retry — never a committed `pending`
  // row whose link was never delivered.
  try {
    await sendExternalInviteEmail({
      recipientEmail: invite.recipient_email,
      token: newToken,
      personalNote: invite.personal_note,
      templateName,
      expiresAt,
    });
  } catch (err) {
    console.error('Reissue email failed:', err);
    return NextResponse.json(
      { error: 'Could not send a new link. Please try again.' },
      { status: 502 },
    );
  }

  await (service.from('external_signing_invites') as any)
    .update({
      token: newToken,
      expires_at: expiresAt.toISOString(),
      verification_code: hashedCode,
      verification_attempts: 0,
      verified_at: null,
      status: 'pending',
    })
    .eq('id', invite.id);

  // Let the admin know a signer self-served a fresh link (non-blocking — a notify
  // failure must not fail the reissue the signer already received).
  sendReissueNotificationEmail({ recipientEmail: invite.recipient_email, templateName }).catch(console.error);

  return NextResponse.json({ success: true });
}
