import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import bcrypt from 'bcryptjs';
import { sendExternalInviteEmail } from '@/lib/email';
import { getTemplateById } from '@/lib/external-agreement-templates';
import type { ExternalSigningInvite } from '@/lib/types';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { invite_id } = await request.json();
  if (!invite_id) return NextResponse.json({ error: 'invite_id required' }, { status: 400 });

  const service = getServiceClient();
  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, token, status, expires_at, recipient_email, template_type, template_id, custom_title, personal_note')
    .eq('id', invite_id)
    .single() as { data: ExternalSigningInvite | null };

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (invite.status === 'signed') return NextResponse.json({ error: 'Already signed' }, { status: 400 });
  if (invite.status === 'revoked') return NextResponse.json({ error: 'Invite is revoked' }, { status: 400 });

  // Generate new verification code
  const { randomInt } = await import('crypto');
  const code = String(randomInt(100000, 1000000));
  const hashedCode = await bcrypt.hash(code, 10);

  await (service
    .from('external_signing_invites') as any)
    .update({
      verification_code: hashedCode,
      verification_attempts: 0,
      status: 'pending',
      verified_at: null,
    })
    .eq('id', invite_id);

  // Get template name
  let templateName = invite.custom_title || 'Document';
  if (invite.template_type === 'preset' && invite.template_id) {
    const template = getTemplateById(invite.template_id);
    templateName = template?.name || 'Document';
  }

  await sendExternalInviteEmail({
    recipientEmail: invite.recipient_email,
    token: invite.token,
    personalNote: invite.personal_note,
    templateName,
    expiresAt: new Date(invite.expires_at),
  });

  return NextResponse.json({ success: true });
}
