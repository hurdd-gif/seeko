import { getServiceClient } from '@/lib/supabase/service';
import { getTemplateById } from '@/lib/external-agreement-templates';
import { SigningPageClient } from './client';
import type { ExternalSigningInvite } from '@/lib/types';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ExternalSignPage({ params }: Props) {
  const { token } = await params;

  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, recipient_email, status, expires_at, template_type, template_id, custom_title, custom_sections, personal_note')
    .eq('token', token)
    .single() as { data: ExternalSigningInvite | null };

  if (!invite) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">Link not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This signing link is invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  // Check expiration
  if (new Date(invite.expires_at) < new Date() && invite.status === 'pending') {
    await (service
      .from('external_signing_invites') as any)
      .update({ status: 'expired' })
      .eq('id', invite.id);

    return <SigningPageClient token={token} initialData={{ status: 'expired' }} />;
  }

  if (['revoked', 'expired', 'signed'].includes(invite.status)) {
    return <SigningPageClient token={token} initialData={{ status: invite.status }} />;
  }

  // Mask email: j***@example.com
  const [local, domain] = invite.recipient_email.split('@');
  const maskedEmail = `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;

  // Resolve template name + sections
  let templateName = invite.custom_title || 'Document';
  let sections = null;
  if (invite.template_type === 'preset' && invite.template_id) {
    const template = getTemplateById(invite.template_id);
    templateName = template?.name || 'Document';
    if (invite.status === 'verified' && template) {
      sections = template.sections;
    }
  } else if (invite.status === 'verified') {
    sections = invite.custom_sections || null;
  }

  return (
    <SigningPageClient
      token={token}
      initialData={{
        status: invite.status,
        maskedEmail,
        templateName,
        personalNote: invite.personal_note ?? undefined,
        ...(sections ? { sections } : {}),
      }}
    />
  );
}
