import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import type { ExternalSigningInvite } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, recipient_email, status, expires_at, template_type, template_id, custom_title, personal_note')
    .eq('token', token)
    .single() as { data: ExternalSigningInvite | null };

  if (!invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  // Check expiration
  if (new Date(invite.expires_at) < new Date() && invite.status === 'pending') {
    await (service
      .from('external_signing_invites') as any)
      .update({ status: 'expired' })
      .eq('id', invite.id);
    return NextResponse.json({ status: 'expired' });
  }

  if (['revoked', 'expired', 'signed'].includes(invite.status)) {
    return NextResponse.json({ status: invite.status });
  }

  // Mask email: j***@example.com
  const [local, domain] = invite.recipient_email.split('@');
  const maskedEmail = `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;

  // Get template name + sections
  let templateName = invite.custom_title || 'Document';
  let sections = null;
  if (invite.template_type === 'preset' && invite.template_id) {
    const { getTemplateById } = await import('@/lib/external-agreement-templates');
    const template = getTemplateById(invite.template_id);
    templateName = template?.name || 'Document';
    if (invite.status === 'verified' && template) {
      sections = template.sections;
    }
  } else if (invite.status === 'verified') {
    sections = (invite as any).custom_sections;
  }

  return NextResponse.json({
    status: invite.status,
    maskedEmail,
    templateName,
    personalNote: invite.personal_note,
    ...(sections ? { sections } : {}),
  });
}
