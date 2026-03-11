import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const service = getServiceClient();

  interface InviteRow {
    id: string;
    recipient_email: string;
    status: string;
    expires_at: string;
    shared_doc_id: string;
  }

  const { data: invite } = await (service
    .from('external_signing_invites') as any)
    .select('id, recipient_email, status, expires_at, shared_doc_id')
    .eq('token', token)
    .eq('purpose', 'doc_share')
    .single() as { data: InviteRow | null };

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

  if (invite.status === 'expired' || invite.status === 'revoked') {
    return NextResponse.json({ status: invite.status });
  }

  // Get doc title and type
  const { data: doc } = await service
    .from('docs')
    .select('title, type')
    .eq('id', invite.shared_doc_id)
    .single();

  // Mask email: j***@example.com
  const [local, domain] = invite.recipient_email.split('@');
  const maskedEmail = `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;

  return NextResponse.json({
    status: invite.status,
    maskedEmail,
    docTitle: doc?.title || 'Document',
    docType: doc?.type || 'doc',
    expiresAt: invite.expires_at,
  });
}
