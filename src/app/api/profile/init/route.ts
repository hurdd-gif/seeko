import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';

/**
 * Applies invite metadata only for must_set_password (trigger already set role on signup).
 * Call after first login so the client can force password setup; trigger is canonical for role.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getServiceClient();

  const { data: invite } = await admin
    .from('pending_invites')
    .select('department, is_contractor, is_investor')
    .eq('email', user.email.toLowerCase())
    .single();

  if (invite) {
    await admin
      .from('profiles')
      .update({
        department: invite.department,
        is_contractor: invite.is_contractor,
        is_investor: invite.is_investor ?? false,
        must_set_password: true,
      })
      .eq('id', user.id);

    await admin
      .from('pending_invites')
      .delete()
      .eq('email', user.email.toLowerCase());
  }

  return NextResponse.json({ success: true });
}
