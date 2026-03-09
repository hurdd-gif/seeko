import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

async function getAuthenticatedUser() {
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
  return user;
}

/** PATCH: Approve or deny a deadline extension. Body: { action: 'approve' | 'deny', reason?: string } */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify admin
  const { data: profile } = await service
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body: { action: 'approve' | 'deny'; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action, reason } = body;
  if (action !== 'approve' && action !== 'deny') {
    return NextResponse.json({ error: 'action must be "approve" or "deny"' }, { status: 400 });
  }

  // Fetch the extension request with task name
  const { data: ext, error: extError } = await service
    .from('deadline_extensions')
    .select('id, task_id, requested_by, extra_hours, new_deadline, status, tasks(name)')
    .eq('id', id)
    .single();

  if (extError || !ext) {
    return NextResponse.json({ error: 'Extension request not found' }, { status: 404 });
  }

  if (ext.status !== 'pending') {
    return NextResponse.json({ error: 'Extension request is no longer pending' }, { status: 409 });
  }

  const taskName = (ext.tasks as unknown as { name: string })?.name ?? 'Unknown task';
  const newStatus = action === 'approve' ? 'approved' : 'denied';

  // Update the extension request
  const { error: updateError } = await service
    .from('deadline_extensions')
    .update({
      status: newStatus,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      ...(action === 'deny' && reason ? { denial_reason: reason } : {}),
    })
    .eq('id', id);

  if (updateError) {
    console.error('[deadline-extensions] update failed:', updateError);
    return NextResponse.json({ error: 'Failed to update extension request' }, { status: 500 });
  }

  // If approved, update the task deadline
  if (action === 'approve') {
    const { error: taskUpdateError } = await service
      .from('tasks')
      .update({ deadline: ext.new_deadline })
      .eq('id', ext.task_id);

    if (taskUpdateError) {
      console.error('[deadline-extensions] task deadline update failed:', taskUpdateError);
      // Roll back extension status since deadline wasn't updated
      await service.from('deadline_extensions').update({ status: 'pending', decided_by: null, decided_at: null }).eq('id', id);
      return NextResponse.json({ error: 'Failed to update task deadline' }, { status: 500 });
    }
  }

  // Log to activity_log
  await service.from('activity_log').insert({
    user_id: user.id,
    action: action === 'approve' ? 'Approved extension' : 'Denied extension',
    target: `task: ${taskName}`,
    task_id: ext.task_id,
  });

  // Notify the requester
  const notifKind = action === 'approve' ? 'deadline_extension_approved' : 'deadline_extension_denied';
  const notifTitle = action === 'approve'
    ? `Extension approved on "${taskName}"`
    : `Extension denied on "${taskName}"`;
  const notifBody = action === 'approve'
    ? `Deadline updated to ${new Date(ext.new_deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : reason || 'No reason provided';

  try {
    const notifyUrl = new URL('/api/notify/user', req.url);
    await fetch(notifyUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: req.headers.get('cookie') ?? '',
      },
      body: JSON.stringify({
        userId: ext.requested_by,
        kind: notifKind,
        title: notifTitle,
        body: notifBody,
        link: `/tasks?task=${ext.task_id}`,
      }),
    });
  } catch {
    console.error('[deadline-extensions] failed to notify requester');
  }

  return NextResponse.json({ success: true, status: newStatus });
}
