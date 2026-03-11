import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';

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
    .select('status, purpose')
    .eq('id', invite_id)
    .single() as { data: { status: string; purpose: string } | null };

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (invite.purpose !== 'invoice') return NextResponse.json({ error: 'Not an invoice request' }, { status: 400 });
  if (invite.status === 'signed') return NextResponse.json({ error: 'Cannot revoke a submitted invoice' }, { status: 400 });

  await (service.from('external_signing_invites') as any).update({ status: 'revoked' }).eq('id', invite_id);
  return NextResponse.json({ success: true });
}
