import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import bcrypt from 'bcryptjs';
import { getTemplateById } from '@/lib/external-agreement-templates';
import type { ExternalSigningInvite } from '@/lib/types';

export async function POST(request: NextRequest) {
  const { token, code } = await request.json();

  if (!token || !code) {
    return NextResponse.json({ error: 'Token and code required' }, { status: 400 });
  }

  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('*')
    .eq('token', token)
    .single() as { data: (ExternalSigningInvite & { verification_code: string }) | null };

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });

  if (invite.status !== 'pending') {
    return NextResponse.json({ error: `Invite is ${invite.status}` }, { status: 400 });
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

  // Return sections
  let sections;
  let title;
  if (invite.template_type === 'preset') {
    const template = getTemplateById(invite.template_id!);
    sections = template!.sections;
    title = template!.name;
  } else {
    sections = invite.custom_sections;
    title = invite.custom_title || 'Agreement';
  }

  return NextResponse.json({
    status: 'verified',
    sections,
    title,
    personalNote: invite.personal_note,
  });
}
