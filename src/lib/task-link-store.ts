/* task-link-store — the client's ONLY door to connected-task mutations.
 *
 * Mirrors comment-store: every write goes through /api/tasks/:taskId/links*,
 * served by the service-role routes in src/api-server/routes/tasks.ts. public
 * .task_links grants no authenticated write policy at all, so a browser-Supabase
 * write wouldn't just no-op in dev — it has nowhere to land, ever.
 *
 * Both routes return the task's FULL link list after the write, so callers can
 * replace state wholesale instead of reconciling a delta. Links are symmetric:
 * unlinking from either side removes the one shared row.
 *
 * fetch() defaults to same-origin credentials, which is all these routes need
 * (cookie-based auth) — no explicit `credentials` option required.
 */
import type { LinkedTask } from '@/lib/types';

export type TaskLinkResult =
  | { ok: true; links: LinkedTask[] }
  | { ok: false; error: string };

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // Body wasn't JSON (or was empty) — fall through to statusText.
  }
  return res.statusText || `Request failed (${res.status})`;
}

export async function linkTask(taskId: string, linkedTaskId: string): Promise<TaskLinkResult> {
  try {
    const res = await fetch(`/api/tasks/${taskId}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedTaskId }),
    });
    if (!res.ok) return { ok: false, error: await parseErrorMessage(res) };
    const data = (await res.json()) as { links: LinkedTask[] };
    return { ok: true, links: data.links };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export async function unlinkTask(taskId: string, linkedTaskId: string): Promise<TaskLinkResult> {
  try {
    const res = await fetch(`/api/tasks/${taskId}/links/${linkedTaskId}`, {
      method: 'DELETE',
    });
    if (!res.ok) return { ok: false, error: await parseErrorMessage(res) };
    const data = (await res.json()) as { links: LinkedTask[] };
    return { ok: true, links: data.links };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}
