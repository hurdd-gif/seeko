import { getServiceClient } from '@/lib/supabase/service';
import { isAdminUser } from '../auth-utils';
import { AgentActionError } from './errors';

/**
 * Admin gate for the EKO write-approval path. This is the hard stop between
 * a staged pending action and a committed write (see executeById in
 * routes/agent.ts) — it MUST throw for any non-admin. profiles.is_admin
 * itself is read by the single shared isAdminUser query in auth-utils.ts.
 */
export async function assertAdmin(userId: string): Promise<void> {
  let admin: boolean;
  try {
    admin = await isAdminUser(userId);
  } catch {
    throw new AgentActionError('EKO could not verify your permissions.', 500);
  }
  if (!admin) throw new AgentActionError('Only admins can approve EKO writes.', 403);
}

/** Normalize a due-date token to an ISO date or null (verbatim from agent.ts). */
export function normalizeDueDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (/tomorrow/i.test(value)) date.setDate(date.getDate() + 1);
  if (/next week/i.test(value)) date.setDate(date.getDate() + 7);
  if (/no date/i.test(value)) return null;
  return date.toISOString().slice(0, 10);
}

export async function markLatestTaskActivityAsEko({
  taskId,
  userId,
  kind,
  action,
}: {
  taskId: string;
  userId: string;
  kind?: string;
  action?: string;
}): Promise<void> {
  const service = getServiceClient();
  let query = service
    .from('activity_log')
    .select('id')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (kind) query = query.eq('kind', kind);
  if (action) query = query.eq('action', action);

  const { data } = await query;
  const id = (data as Array<{ id: string }> | null)?.[0]?.id;
  if (!id) return;
  await service.from('activity_log').update({ source: 'eko', user_id: userId } as never).eq('id', id);
}

export async function hideLatestHumanAssignedEcho({
  taskId,
  taskName,
  userId,
}: {
  taskId: string;
  taskName: string;
  userId: string;
}): Promise<void> {
  const service = getServiceClient();
  const { data } = await service
    .from('activity_log')
    .select('id')
    .eq('task_id', taskId)
    .eq('action', 'Assigned')
    .like('target', `task: ${taskName}%`)
    .order('created_at', { ascending: false })
    .limit(1);
  const id = (data as Array<{ id: string }> | null)?.[0]?.id;
  if (!id) return;
  await service.from('activity_log').delete().eq('id', id).eq('user_id', userId);
}

export async function markLatestDeletedTaskActivityAsEko({
  taskName,
  userId,
}: {
  taskName: string;
  userId: string;
}): Promise<void> {
  const service = getServiceClient();
  const { data } = await service
    .from('activity_log')
    .select('id')
    .eq('action', 'Deleted')
    .eq('target', `task: ${taskName}`)
    .is('task_id', null)
    .order('created_at', { ascending: false })
    .limit(1);
  const id = (data as Array<{ id: string }> | null)?.[0]?.id;
  if (id) {
    await service
      .from('activity_log')
      .update({ action: 'deleted this task', target: '', source: 'eko', user_id: userId } as never)
      .eq('id', id);
    return;
  }
  await service.from('activity_log').insert({
    user_id: userId,
    action: 'deleted this task',
    target: '',
    task_id: null,
    source: 'eko',
  } as never);
}
