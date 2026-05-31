import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { isSigningInvite } from '@/lib/invite-filters';
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
    .select('status, template_type')
    .eq('id', invite_id)
    .single() as { data: { status: string; template_type: ExternalSigningInvite['template_type'] } | null };

  // Even an admin acts only on signing rows here — invoice / doc-share share this
  // table and have their own management surfaces. Not-found and wrong-product → 404.
  if (!isSigningInvite(invite)) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (invite.status === 'signed') {
    return NextResponse.json({ error: 'Cannot revoke a signed invite' }, { status: 400 });
  }

  await (service.from('external_signing_invites') as any).update({ status: 'revoked' }).eq('id', invite_id);
  return NextResponse.json({ success: true });
}
