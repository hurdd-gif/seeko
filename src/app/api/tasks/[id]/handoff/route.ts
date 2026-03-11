import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getSupabaseAndUser() {
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
  return { supabase, user };
}

/** POST: Hand off a task to a new assignee. Caller must be task assignee or admin. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: taskId } = await params;

  let body: { toUserId: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { toUserId, note } = body;
  if (!toUserId) {
    return NextResponse.json({ error: 'toUserId is required' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, display_name')
    .eq('id', user.id)
    .single();

  const { data: task } = await supabase
    .from('tasks')
    .select('id, assignee_id, name')
    .eq('id', taskId)
    .single();

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const isAdmin = profile?.is_admin ?? false;
  const isAssignee = task.assignee_id === user.id;
  if (!isAdmin && !isAssignee) {
    return NextResponse.json({ error: 'Only the assignee or an admin can hand off this task' }, { status: 403 });
  }

  // Validate target user exists
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', toUserId)
    .single();

  if (!targetProfile) {
    return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
  }

  // Record the handoff
  const { data: handoffData, error: insertError } = await supabase
    .from('task_handoffs')
    .insert({
      task_id: taskId,
      from_user_id: user.id,
      to_user_id: toUserId,
      note: note?.trim() || null,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Handoff insert error:', insertError);
    return NextResponse.json({ error: 'Failed to record handoff' }, { status: 500 });
  }

  // Reassign the task
  const { error: updateError } = await supabase
    .from('tasks')
    .update({ assignee_id: toUserId })
    .eq('id', taskId);

  if (updateError) {
    console.error('Task reassign error:', updateError);
    // Roll back the handoff record so it doesn't become orphaned
    if (handoffData?.id) {
      await supabase.from('task_handoffs').delete().eq('id', handoffData.id);
    }
    return NextResponse.json({ error: 'Failed to reassign task' }, { status: 500 });
  }

  // Notify the new assignee
  const handoffNote = note?.trim();
  const notifBody = handoffNote
    ? `${profile?.display_name ?? 'Someone'} handed off "${task.name}" with a note: ${handoffNote.slice(0, 100)}${handoffNote.length > 100 ? '…' : ''}`
    : `${profile?.display_name ?? 'Someone'} handed off "${task.name}" to you`;

  await supabase.from('notifications').insert({
    user_id: toUserId,
    kind: 'task_handoff',
    title: 'Task handed off to you',
    body: notifBody,
    link: `/tasks?task=${taskId}`,
    read: false,
  });

  return NextResponse.json({ success: true });
}
