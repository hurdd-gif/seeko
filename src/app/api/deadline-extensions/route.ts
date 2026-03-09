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

/** POST: Request a deadline extension. Body: { taskId, extraHours } */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { taskId: string; extraHours: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { taskId, extraHours } = body;
  if (!taskId || typeof taskId !== 'string') {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }
  if (!Number.isFinite(extraHours) || extraHours < 1 || extraHours > 720) {
    return NextResponse.json({ error: 'extraHours must be between 1 and 720' }, { status: 400 });
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch the task
  const { data: task, error: taskError } = await service
    .from('tasks')
    .select('id, name, deadline, assignee_id')
    .eq('id', taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Verify the user is the assignee
  if (task.assignee_id !== user.id) {
    return NextResponse.json({ error: 'Only the assignee can request an extension' }, { status: 403 });
  }

  // Verify the task has a deadline
  if (!task.deadline) {
    return NextResponse.json({ error: 'Task has no deadline' }, { status: 400 });
  }

  // Check for existing pending request
  const { data: existing } = await service
    .from('deadline_extensions')
    .select('id')
    .eq('task_id', taskId)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'A pending extension request already exists for this task' }, { status: 409 });
  }

  // Compute new deadline
  const originalDeadline = task.deadline; // date string e.g. "2026-03-15"
  const newDeadlineDate = new Date(originalDeadline + 'T00:00:00');
  newDeadlineDate.setTime(newDeadlineDate.getTime() + extraHours * 3600000);
  const newDeadline = newDeadlineDate.toISOString().split('T')[0]; // back to date string

  // Insert the extension request
  const { data: extension, error: insertError } = await service
    .from('deadline_extensions')
    .insert({
      task_id: taskId,
      requested_by: user.id,
      extra_hours: extraHours,
      original_deadline: originalDeadline,
      new_deadline: newDeadline,
      status: 'pending',
    })
    .select('id, extra_hours, new_deadline, status')
    .single();

  if (insertError) {
    console.error('[deadline-extensions] insert failed:', insertError);
    return NextResponse.json({ error: 'Failed to create extension request' }, { status: 500 });
  }

  // Log to activity_log
  await service.from('activity_log').insert({
    user_id: user.id,
    action: 'Requested extension',
    target: `task: ${task.name}`,
    task_id: taskId,
  });

  // Notify admins
  const amount = extraHours >= 24
    ? `+${Math.round(extraHours / 24)} day${Math.round(extraHours / 24) !== 1 ? 's' : ''}`
    : `+${extraHours} hour${extraHours !== 1 ? 's' : ''}`;

  const newDeadlineFormatted = new Date(newDeadline + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  try {
    const notifyUrl = new URL('/api/notify/admins', req.url);
    await fetch(notifyUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: req.headers.get('cookie') ?? '',
      },
      body: JSON.stringify({
        kind: 'deadline_extension_requested',
        title: `Extension requested on "${task.name}"`,
        body: `${amount} \u2014 new deadline would be ${newDeadlineFormatted}`,
        link: `/tasks?task=${taskId}`,
      }),
    });
  } catch {
    // Non-critical: notification failure shouldn't block the request
    console.error('[deadline-extensions] failed to notify admins');
  }

  return NextResponse.json({ success: true, extension });
}
