import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import bcrypt from 'bcryptjs';
import type { ExternalSigningInvite } from '@/lib/types';

export async function POST(request: NextRequest) {
  const { token, code } = await request.json();

  if (!token || !code) {
    return NextResponse.json({ error: 'Token and code required' }, { status: 400 });
  }

  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, token, status, expires_at, verification_code, verification_attempts, prefilled_items, personal_note')
    .eq('token', token)
    .eq('purpose', 'invoice')
    .single() as { data: (ExternalSigningInvite & { verification_code: string; prefilled_items: { label: string; amount: number }[] | null }) | null };

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });

  if (invite.status === 'verified' || invite.status === 'signed') {
    return NextResponse.json({ error: 'Invite has already been verified' }, { status: 409 });
  }

  if (invite.status !== 'pending') {
    return NextResponse.json({ error: 'Invite is no longer available' }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    await (service.from('external_signing_invites') as any).update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
  }

  if (invite.verification_attempts >= 3) {
    return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 });
  }

  // Increment attempts
  await (service
    .from('external_signing_invites') as any)
    .update({ verification_attempts: invite.verification_attempts + 1 })
    .eq('id', invite.id);

  // Verify code
  const valid = await bcrypt.compare(code, invite.verification_code);
  if (!valid) {
    const remaining = 2 - invite.verification_attempts;
    return NextResponse.json(
      { error: `Invalid code. ${Math.max(remaining, 0)} attempt${remaining !== 1 ? 's' : ''} remaining.` },
      { status: 400 }
    );
  }

  // Mark as verified
  await (service
    .from('external_signing_invites') as any)
    .update({ status: 'verified', verified_at: new Date().toISOString() })
    .eq('id', invite.id);

  return NextResponse.json({
    status: 'verified',
    prefilledItems: invite.prefilled_items,
    personalNote: invite.personal_note,
  });
}
