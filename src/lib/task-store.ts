/* task-store — the client's ONLY door to task mutations.
 *
 * Replaces ~13 direct `supabase.from('tasks')...` browser-client writes
 * across TaskDetail/TaskList/TasksBoard/InvestorAreaCard/TaskDetailPage/
 * PropertiesSection. The browser client silently no-ops in dev (no
 * browser session there); every write now goes through /api/tasks,
 * served by the service-role tasks-repo (src/lib/tasks-repo.ts), so
 * writes actually land regardless of environment.
 *
 * fetch() defaults to same-origin credentials, which is all these routes
 * need (cookie-based auth) — no explicit `credentials` option required.
 */
import type { Task } from '@/lib/types';

export type TaskWriteResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Widest row shape the create endpoint hands back — matches the tasks table 1:1. */
export type TaskRowLike = Task;

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // Body wasn't JSON (or was empty) — fall through to statusText.
  }
  return res.statusText || `Request failed (${res.status})`;
}

export async function createTask(
  fields: Record<string, unknown>
): Promise<TaskWriteResult<{ task: TaskRowLike }>> {
  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) return { ok: false, error: await parseErrorMessage(res) };
    const data = (await res.json()) as { task: TaskRowLike };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export async function updateTask(
  id: string,
  patch: Record<string, unknown>
): Promise<TaskWriteResult> {
  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return { ok: false, error: await parseErrorMessage(res) };
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export async function deleteTask(id: string): Promise<TaskWriteResult> {
  try {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (!res.ok) return { ok: false, error: await parseErrorMessage(res) };
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}
