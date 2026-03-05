import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Read pending invite metadata
  const { data: invite } = await admin
    .from('pending_invites')
    .select('department, is_contractor')
    .eq('email', user.email)
    .single();

  if (invite) {
    // Update profile with invite metadata
    await admin
      .from('profiles')
      .update({
        department: invite.department,
        is_contractor: invite.is_contractor,
        must_set_password: true,
      })
      .eq('id', user.id);

    // Clean up pending invite
    await admin
      .from('pending_invites')
      .delete()
      .eq('email', user.email);
  }

  return NextResponse.json({ success: true });
}
