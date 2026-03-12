import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function POST(request: NextRequest) {
  const { token } = await request.json();

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  // Read session cookie
  const sessionCookie = request.cookies.get('doc_share_session')?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  }

  const service = getServiceClient();

  interface InviteRow {
    id: string;
    status: string;
    expires_at: string;
    session_token: string | null;
    shared_doc_id: string;
    view_count: number;
  }

  const { data: invite } = await (service
    .from('external_signing_invites') as any)
    .select('id, status, expires_at, session_token, shared_doc_id, view_count')
    .eq('token', token)
    .eq('purpose', 'doc_share')
    .single() as { data: InviteRow | null };

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });

  // Validate session
  if (invite.session_token !== sessionCookie) {
    return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  }

  if (invite.status !== 'verified') {
    return NextResponse.json({ error: 'Invite is no longer available' }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    await (service.from('external_signing_invites') as any).update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
  }

  // Fetch doc content
  const { data: doc } = await (service
    .from('docs') as any)
    .select('id, title, content, type, slides, deck_orientation')
    .eq('id', invite.shared_doc_id)
    .single() as { data: { id: string; title: string; content?: string; type?: string; slides?: any; deck_orientation?: string } | null };

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Increment view count
  await (service
    .from('external_signing_invites') as any)
    .update({ view_count: (invite.view_count || 0) + 1 })
    .eq('id', invite.id);

  return NextResponse.json({
    title: doc.title,
    content: doc.content,
    type: doc.type || 'doc',
    slides: doc.slides || null,
    deck_orientation: doc.deck_orientation || 'horizontal',
  });
}
