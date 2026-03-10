import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import bcrypt from 'bcryptjs';
import { sendVerificationCodeEmail } from '@/lib/email';
import type { ExternalSigningInvite } from '@/lib/types';

// Rate limiter: max 3 send-code requests per token per hour
const RATE_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 };
const tokenHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(token: string): boolean {
  const now = Date.now();
  // Prune expired entries to prevent memory growth
  if (tokenHits.size > 100) {
    for (const [key, entry] of tokenHits) { if (now > entry.resetAt) tokenHits.delete(key); }
  }
  const entry = tokenHits.get(token);
  if (!entry || now > entry.resetAt) {
    tokenHits.set(token, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  if (entry.count >= RATE_LIMIT.max) return true;
  entry.count++;
  return false;
}

export async function POST(request: NextRequest) {
  const { token } = await request.json();

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  if (isRateLimited(token)) {
    return NextResponse.json({ error: 'Too many code requests. Try again later.' }, { status: 429 });
  }

  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, recipient_email, status, expires_at')
    .eq('token', token)
    .single() as { data: ExternalSigningInvite | null };

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });

  if (invite.status !== 'pending') {
    return NextResponse.json({ error: 'Invite is no longer available' }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    await (service.from('external_signing_invites') as any).update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
  }

  // Generate new code, reset attempts
  const { randomInt } = await import('crypto');
  const code = String(randomInt(100000, 1000000));
  const hashedCode = await bcrypt.hash(code, 10);

  await (service
    .from('external_signing_invites') as any)
    .update({ verification_code: hashedCode, verification_attempts: 0 })
    .eq('id', invite.id);

  // Send email
  await sendVerificationCodeEmail({
    recipientEmail: invite.recipient_email,
    code,
  });

  return NextResponse.json({ success: true });
}
