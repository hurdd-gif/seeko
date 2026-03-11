import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import bcrypt from 'bcryptjs';
import { sendDocShareEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { invite_id } = await request.json();
  if (!invite_id) return NextResponse.json({ error: 'invite_id required' }, { status: 400 });

  const service = getServiceClient();

  interface InviteRow {
    id: string;
    token: string;
    status: string;
    purpose: string;
    expires_at: string;
    recipient_email: string;
    personal_note: string | null;
    shared_doc_id: string;
  }

  const { data: invite } = await (service
    .from('external_signing_invites') as any)
    .select('id, token, status, purpose, expires_at, recipient_email, personal_note, shared_doc_id')
    .eq('id', invite_id)
    .single() as { data: InviteRow | null };

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (invite.purpose !== 'doc_share') return NextResponse.json({ error: 'Not a doc share invite' }, { status: 400 });
  if (invite.status === 'revoked') return NextResponse.json({ error: 'Invite is revoked' }, { status: 400 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Invite has expired — create a new one' }, { status: 400 });

  // Generate new verification code and reset status
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
      session_token: null,
    })
    .eq('id', invite_id);

  // Get doc title
  const { data: doc } = await service
    .from('docs')
    .select('title')
    .eq('id', invite.shared_doc_id)
    .single();

  // Resend email
  await sendDocShareEmail({
    recipientEmail: invite.recipient_email,
    token: invite.token,
    docTitle: doc?.title || 'Document',
    personalNote: invite.personal_note,
    expiresAt: new Date(invite.expires_at),
  });

  return NextResponse.json({ success: true });
}
