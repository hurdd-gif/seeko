import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createRateLimiter } from '@/lib/rate-limiter';

// 3 boot attempts per admin per 15 minutes
const isRateLimited = createRateLimiter(3, 15 * 60 * 1000, 50);

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

  if (isRateLimited(user.id)) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
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

  // Prevent booting yourself
  if (userId === user.id) {
    return NextResponse.json({ error: 'Cannot boot yourself' }, { status: 400 });
  }

  // Verify admin's password using a separate service-client sign-in
  // to avoid mutating the current session cookies
  const email = adminProfile.email ?? user.email;
  if (!email) {
    return NextResponse.json({ error: 'Could not determine admin email' }, { status: 500 });
  }

  const verifier = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error: authError } = await verifier.auth.signInWithPassword({ email, password });
  if (authError) {
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

  // 8c. Delete user's storage files (avatars)
  const { data: avatarFiles } = await service.storage.from('avatars').list(userId);
  if (avatarFiles && avatarFiles.length > 0) {
    await service.storage.from('avatars').remove(avatarFiles.map(f => `${userId}/${f.name}`));
  }

  // 8d. Delete user's storage files (signed agreements)
  const { data: agreementFiles } = await service.storage.from('agreements').list(userId);
  if (agreementFiles && agreementFiles.length > 0) {
    await service.storage.from('agreements').remove(agreementFiles.map(f => `${userId}/${f.name}`));
  }

  // 8e. Remove user from granted_user_ids in docs
  const { data: grantedDocs } = await service
    .from('docs')
    .select('id, granted_user_ids')
    .contains('granted_user_ids', [userId]);
  if (grantedDocs && grantedDocs.length > 0) {
    for (const doc of grantedDocs) {
      const updated = (doc.granted_user_ids as string[]).filter((id: string) => id !== userId);
      await service.from('docs').update({ granted_user_ids: updated } as never).eq('id', doc.id);
    }
  }

  // 8f. Clean up pending invite (get email before profile deletion)
  const { data: bootedProfile } = await service.from('profiles').select('email').eq('id', userId).single();
  if (bootedProfile?.email) {
    await service.from('pending_invites').delete().eq('email', bootedProfile.email.toLowerCase());
  }

  // 9. Delete profile
  const { error: profileErr } = await service.from('profiles').delete().eq('id', userId);
  if (profileErr) {
    return NextResponse.json({ error: 'Database error deleting user' }, { status: 500 });
  }

  // 10. Delete auth user
  const { error: deleteErr } = await service.auth.admin.deleteUser(userId);
  if (deleteErr) {
    console.error('Auth user delete error:', deleteErr);
    return NextResponse.json({ error: 'Failed to remove user account' }, { status: 500 });
  }

  // TODO: Replace with proper logging system
  // User successfully removed by admin
  return NextResponse.json({ success: true });
}
