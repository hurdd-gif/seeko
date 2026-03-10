import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import bcrypt from 'bcryptjs';
import { sendVerificationCodeEmail } from '@/lib/email';
import type { ExternalSigningInvite } from '@/lib/types';

export async function POST(request: NextRequest) {
  const { token } = await request.json();

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, recipient_email, status, expires_at')
    .eq('token', token)
    .single() as { data: ExternalSigningInvite | null };

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });

  if (invite.status !== 'pending') {
    return NextResponse.json({ error: `Invite is ${invite.status}` }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    await (service.from('external_signing_invites') as any).update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
  }

  // Generate new code, reset attempts
  const code = String(Math.floor(100000 + Math.random() * 900000));
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
