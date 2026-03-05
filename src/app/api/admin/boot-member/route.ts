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

  // Nullify task assignments
  await service.from('tasks').update({ assignee_id: null }).eq('assignee_id', userId);

  // Delete profile
  await service.from('profiles').delete().eq('id', userId);

  // Delete auth user
  const { error: deleteErr } = await service.auth.admin.deleteUser(userId);
  if (deleteErr) {
    // TODO: Replace with proper logging system
    // Failed to delete auth user during boot member operation
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  // TODO: Replace with proper logging system
  // User successfully removed by admin
  return NextResponse.json({ success: true });
}
