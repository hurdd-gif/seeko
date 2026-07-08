import { getServiceClient } from '@/lib/supabase/service';

export type PendingActionStatus =
  | 'awaiting_approval'
  | 'executing'
  | 'executed'
  | 'rejected'
  | 'failed';

export type EkoPendingActionRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  tool_id: string;
  resolved_args: Record<string, unknown>;
  summary: string;
  status: PendingActionStatus;
  error: string | null;
  created_at: string;
  executed_at: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(): any {
  // eko_pending_actions is not in the generated Database types until the
  // migration is applied + types regenerated — same untyped cast the repo
  // uses for `milestones`/`task_milestone` (tasks-board.ts, context.ts).
  return (getServiceClient() as unknown as { from: (t: string) => unknown }).from(
    'eko_pending_actions',
  );
}

export function isExecutable(status: PendingActionStatus): boolean {
  return status === 'awaiting_approval';
}

export async function stagePendingAction(input: {
  conversationId: string;
  userId: string;
  toolId: string;
  resolvedArgs: Record<string, unknown>;
  summary: string;
}): Promise<string> {
  const { data, error } = await table()
    .insert({
      conversation_id: input.conversationId,
      user_id: input.userId,
      tool_id: input.toolId,
      resolved_args: input.resolvedArgs,
      summary: input.summary,
      status: 'awaiting_approval',
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function getPendingActionById(id: string): Promise<EkoPendingActionRow | null> {
  const { data, error } = await table().select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as EkoPendingActionRow | null) ?? null;
}

export async function markExecuting(id: string): Promise<void> {
  const { error } = await table().update({ status: 'executing' }).eq('id', id);
  if (error) throw error;
}

export async function markExecuted(id: string): Promise<void> {
  const { error } = await table()
    .update({ status: 'executed', executed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function markRejected(id: string): Promise<void> {
  const { error } = await table().update({ status: 'rejected' }).eq('id', id);
  if (error) throw error;
}

export async function markFailed(id: string, message: string): Promise<void> {
  const { error } = await table().update({ status: 'failed', error: message }).eq('id', id);
  if (error) throw error;
}

export async function listAwaitingByConversation(
  conversationId: string,
): Promise<EkoPendingActionRow[]> {
  const { data, error } = await table()
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('status', 'awaiting_approval')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as EkoPendingActionRow[] | null) ?? [];
}

/**
 * Writes this conversation has already approved AND committed. Fed back into the
 * model's context so EKO knows what it did — without this, the durable
 * `status = 'executed'` history is invisible to the model and it denies changes
 * that actually took effect (the "I didn't change anything" narration bug).
 */
export async function listExecutedByConversation(
  conversationId: string,
): Promise<EkoPendingActionRow[]> {
  const { data, error } = await table()
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('status', 'executed')
    .order('executed_at', { ascending: true });
  if (error) throw error;
  return (data as EkoPendingActionRow[] | null) ?? [];
}
