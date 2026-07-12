/* comment-store — the client's ONLY door to task-comment mutations.
 *
 * Mirrors task-store: every write goes through /api/tasks/:id/comments*,
 * served by the service-role routes in src/api-server/routes/tasks.ts.
 * The browser Supabase client silently no-ops in dev (no browser session),
 * so the full-page thread never writes through it.
 *
 * fetch() defaults to same-origin credentials, which is all these routes
 * need (cookie-based auth) — no explicit `credentials` option required.
 */
import type { TaskComment } from '@/lib/types';

export type CommentWriteResult<T = undefined> =
  | { ok: true; data: T }
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

export async function createComment(
  taskId: string,
  content: string,
  replyToId?: string | null,
): Promise<CommentWriteResult<{ comment: TaskComment }>> {
  try {
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, reply_to_id: replyToId ?? null }),
    });
    if (!res.ok) return { ok: false, error: await parseErrorMessage(res) };
    const data = (await res.json()) as { comment: TaskComment };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export async function updateComment(
  taskId: string,
  commentId: string,
  content: string,
): Promise<CommentWriteResult> {
  try {
    const res = await fetch(`/api/tasks/${taskId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) return { ok: false, error: await parseErrorMessage(res) };
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export async function deleteComment(
  taskId: string,
  commentId: string,
): Promise<CommentWriteResult> {
  try {
    const res = await fetch(`/api/tasks/${taskId}/comments/${commentId}`, {
      method: 'DELETE',
    });
    if (!res.ok) return { ok: false, error: await parseErrorMessage(res) };
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export async function toggleReaction(
  taskId: string,
  commentId: string,
  emoji: string,
): Promise<CommentWriteResult<{ toggled: 'on' | 'off' }>> {
  try {
    const res = await fetch(`/api/tasks/${taskId}/comments/${commentId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) return { ok: false, error: await parseErrorMessage(res) };
    const data = (await res.json()) as { toggled: 'on' | 'off' };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}
