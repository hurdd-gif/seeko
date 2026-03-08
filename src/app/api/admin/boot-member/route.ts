import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify caller is admin
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('is_admin, email')
    .eq('id', user.id)
    .single();

  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let body: { userId: string; password: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { userId, password } = body;
  if (!userId || !password) {
    return NextResponse.json({ error: 'userId and password required' }, { status: 400 });
  }
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
  }

  // Prevent booting yourself
  if (userId === user.id) {
    return NextResponse.json({ error: 'Cannot boot yourself' }, { status: 400 });
  }

  // Verify admin's password by re-authenticating
  const email = adminProfile.email ?? user.email;
  if (!email) {
    return NextResponse.json({ error: 'Could not determine admin email' }, { status: 500 });
  }

  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    // TODO: Replace with proper logging system
    // Admin password verification failed for boot member operation
    return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Clean up all data referencing this user before deleting profile/auth
  // Order matters: children first, then profile, then auth user

  // 1. Nullify task assignments
  await service.from('tasks').update({ assignee_id: null }).eq('assignee_id', userId);

  // 2. Delete task comment reactions by this user
  await service.from('task_comment_reactions').delete().eq('user_id', userId);

  // 3. Delete task comments by this user
  await service.from('task_comments').delete().eq('user_id', userId);

  // 4. Delete task handoffs involving this user
  await service.from('task_handoffs').delete().eq('from_user_id', userId);
  await service.from('task_handoffs').delete().eq('to_user_id', userId);

  // 5. Delete task deliverables uploaded by this user
  await service.from('task_deliverables').delete().eq('uploaded_by', userId);

  // 6. Delete payment items for payments created by or for this user
  const { data: userPayments } = await service
    .from('payments')
    .select('id')
    .or(`recipient_id.eq.${userId},created_by.eq.${userId}`);
  if (userPayments && userPayments.length > 0) {
    const paymentIds = userPayments.map(p => p.id);
    await service.from('payment_items').delete().in('payment_id', paymentIds);
  }

  // 7. Delete payments referencing this user
  await service.from('payments').delete().or(`recipient_id.eq.${userId},created_by.eq.${userId}`);

  // 8. Notifications (should cascade, but be safe)
  await service.from('notifications').delete().eq('user_id', userId);

  // 8b. Activity log entries
  await service.from('activity_log').delete().eq('user_id', userId);

  // 9. Delete profile
  const { error: profileErr } = await service.from('profiles').delete().eq('id', userId);
  if (profileErr) {
    return NextResponse.json({ error: 'Database error deleting user' }, { status: 500 });
  }

  // 10. Delete auth user
  const { error: deleteErr } = await service.auth.admin.deleteUser(userId);
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  // TODO: Replace with proper logging system
  // User successfully removed by admin
  return NextResponse.json({ success: true });
}
