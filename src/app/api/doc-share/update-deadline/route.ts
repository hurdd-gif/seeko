import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { invite_id, expires_at } = await request.json();
  if (!invite_id) return NextResponse.json({ error: 'invite_id required' }, { status: 400 });
  if (!expires_at) return NextResponse.json({ error: 'expires_at required' }, { status: 400 });

  // Validate future date
  const newDate = new Date(expires_at);
  if (isNaN(newDate.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  if (newDate <= new Date()) return NextResponse.json({ error: 'Date must be in the future' }, { status: 400 });

  const service = getServiceClient();
  const { data: invite } = await (service
    .from('external_signing_invites') as any)
    .select('status, purpose')
    .eq('id', invite_id)
    .single() as { data: { status: string; purpose: string } | null };

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (invite.purpose !== 'doc_share') return NextResponse.json({ error: 'Not a doc share invite' }, { status: 400 });
  if (invite.status !== 'pending' && invite.status !== 'verified') {
    return NextResponse.json({ error: 'Can only update active invites' }, { status: 400 });
  }

  await (service.from('external_signing_invites') as any)
    .update({ expires_at: newDate.toISOString() })
    .eq('id', invite_id);

  return NextResponse.json({ success: true, expires_at: newDate.toISOString() });
}
