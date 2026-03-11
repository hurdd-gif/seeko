import type { Metadata } from 'next';
import { getServiceClient } from '@/lib/supabase/service';
import { SharedDocClient } from './client';

export const metadata: Metadata = {
  referrer: 'no-referrer',
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function SharedDocPage({ params }: Props) {
  const { token } = await params;
  const service = getServiceClient();

  const { data: invite } = await (service.from('external_signing_invites') as any)
    .select('id, recipient_email, status, expires_at, shared_doc_id')
    .eq('token', token)
    .eq('purpose', 'doc_share')
    .single();

  if (!invite) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">Link not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This document link is invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  // Check expiration
  if (new Date(invite.expires_at) < new Date() && invite.status === 'pending') {
    await (service.from('external_signing_invites') as any)
      .update({ status: 'expired' })
      .eq('id', invite.id);
    return <SharedDocClient token={token} initialData={{ status: 'expired' }} />;
  }

  if (['revoked', 'expired'].includes(invite.status)) {
    return <SharedDocClient token={token} initialData={{ status: invite.status }} />;
  }

  // Get doc title + type
  const { data: doc } = await service.from('docs').select('title, type').eq('id', invite.shared_doc_id).single();

  // Mask email
  const [local, domain] = invite.recipient_email.split('@');
  const maskedEmail = `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;

  return (
    <SharedDocClient
      token={token}
      initialData={{
        status: invite.status,
        maskedEmail,
        docTitle: doc?.title || 'Document',
        docType: doc?.type || 'doc',
        expiresAt: invite.expires_at,
      }}
    />
  );
}
