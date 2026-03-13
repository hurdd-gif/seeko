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
    const row = invite as { department: string | null; is_contractor: boolean; is_investor: boolean };
    await admin
      .from('profiles')
      .update({
        department: row.department,
        is_contractor: row.is_contractor,
        is_investor: row.is_investor ?? false,
        must_set_password: true,
      } as never)
      .eq('id', user.id);

    await admin
      .from('pending_invites')
      .delete()
      .eq('email', user.email.toLowerCase());

    // Notify admins that a new user joined
    const role = row.is_investor ? 'investor' : row.is_contractor ? 'contractor' : 'team member';
    const label = user.email;
    const { data: admins } = await admin
      .from('profiles')
      .select('id')
      .eq('is_admin', true);

    if (admins?.length) {
      await admin.from('notifications').insert(
        admins.map(({ id }) => ({
          user_id: id,
          kind: 'user_joined' as const,
          title: `${label} joined as ${role}`,
          body: row.department ? `Department: ${row.department}` : null,
          link: '/team',
          read: false,
        })) as never
      );
    }
  }

  return NextResponse.json({ success: true });
}
