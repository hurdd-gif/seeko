/* tasks-repo — the server-side door to public.tasks for the task store
 * (src/lib/task-store.ts) and the EKO agent's write tools.
 *
 * The ~13 direct browser-client writes across TaskDetail/TaskList/
 * TasksBoard/InvestorAreaCard/TaskDetailPage/PropertiesSection now go
 * through createTask/updateTask/deleteTask here. Three server routes
 * still write `tasks` directly, bypassing this module (admin.ts's
 * user-delete unassign, workflow.ts's deadline-extension approval,
 * tasks.ts's handoff reassign) — see CONTEXT.md and the Follow-ups
 * section of docs/plans/2026-07-09-architecture-deepening-1-6.md.
 * The whitelist below
 * is the superset of every column any of those call sites actually sends
 * (enumerated in the Task 6 commit message); `name`, `progress`, and
 * `bounty` are included even though no current write site sends them
 * today — they are ordinary mutable task columns (not audit/computed
 * columns like task_number/created_at/id), kept for a generic rename/
 * progress-edit/bounty-edit PATCH the whitelist already supports.
 *
 * Write rule preserved exactly (mirrors live RLS): any authenticated user
 * may create/patch (whitelisted fields only); only admins may delete —
 * enforced by the HTTP layer (routes/tasks.ts), not here. This module is
 * pure data access with no auth opinion of its own.
 */
import { getServiceClient } from '@/lib/supabase/service';
import type { Task } from '@/lib/types';

export const TASK_PATCH_COLUMNS = [
  'name',
  'status',
  'priority',
  'department',
  'assignee_id',
  'deadline',
  'area_id',
  'description',
  'progress',
  'bounty',
] as const;

export type TaskPatch = Partial<Record<(typeof TASK_PATCH_COLUMNS)[number], unknown>>;

/** Widest row shape a write site needs back — matches the tasks table 1:1. */
export type TaskRow = Task;

/**
 * Minimal chainable shape this module needs from a Supabase client —
 * narrow enough to fake in tests, wide enough that the real service
 * client (cast, same pattern as invites-repo.ts) satisfies it structurally.
 */
export type ServiceClient = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => {
      select: (columns?: string) => {
        single: () => Promise<{ data: unknown; error?: unknown }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: unknown) => Promise<{ error?: unknown }>;
    };
    delete: () => {
      eq: (column: string, value: unknown) => {
        select: (columns?: string) => Promise<{ data: unknown; error?: unknown }>;
      };
    };
  };
};

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return 'Unknown error';
}

/** Drops any key not in TASK_PATCH_COLUMNS. Returns {} if nothing survives. */
export function sanitizeTaskPatch(input: Record<string, unknown>): TaskPatch {
  const out: Record<string, unknown> = {};
  for (const column of TASK_PATCH_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(input, column)) {
      out[column] = input[column];
    }
  }
  return out as TaskPatch;
}

export async function createTask(
  fields: TaskPatch & { name: string },
  service?: ServiceClient
): Promise<{ task: TaskRow } | { error: string }> {
  const client = service ?? (getServiceClient() as unknown as ServiceClient);
  const { data, error } = await client
    .from('tasks')
    .insert(fields as Record<string, unknown>)
    .select()
    .single();
  if (error) return { error: errorMessage(error) };
  return { task: data as TaskRow };
}

export async function updateTask(
  id: string,
  patch: TaskPatch,
  service?: ServiceClient
): Promise<{ ok: true } | { error: string }> {
  const client = service ?? (getServiceClient() as unknown as ServiceClient);
  const { error } = await client
    .from('tasks')
    .update(patch as Record<string, unknown>)
    .eq('id', id);
  if (error) return { error: errorMessage(error) };
  return { ok: true };
}

/**
 * `deleted` (beyond the brief's `{ok:true}`) lets callers distinguish
 * "deleted a row" from "no row matched" — the EKO delete_task tool needs
 * this to keep its existing "already removed, no changes made" reply
 * instead of always claiming a delete happened. Additive; every existing
 * consumer (the DELETE route) only checks `'error' in result`.
 */
export type DeleteTaskResult = { ok: true; deleted: boolean } | { error: string };

export async function deleteTask(id: string, service?: ServiceClient): Promise<DeleteTaskResult> {
  const client = service ?? (getServiceClient() as unknown as ServiceClient);
  const { data, error } = await client.from('tasks').delete().eq('id', id).select('id');
  if (error) return { error: errorMessage(error) };
  return { ok: true, deleted: Array.isArray(data) ? data.length > 0 : Boolean(data) };
}
