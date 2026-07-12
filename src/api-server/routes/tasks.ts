import { Hono, type Context } from 'hono';
import {
  loadTaskDetail,
  loadTasksIndex,
  type TaskDetailData,
  type TasksIndexData,
} from '@/lib/tasks-index';
import {
  loadTasksBoard,
  loadTaskDetailFull,
  type TasksBoardData,
  type TaskDetailFullData,
} from '@/lib/tasks-board';
import { AccessError, accessErrorStatus } from '@/lib/access-error';
import { fetchMilestones, fetchTaskActivity } from '@/lib/supabase/data';
import { getServiceClient } from '@/lib/supabase/service';
import {
  createTask as createTaskRepo,
  updateTask as updateTaskRepo,
  deleteTask as deleteTaskRepo,
  sanitizeTaskPatch,
  type TaskPatch,
  type TaskRow,
} from '@/lib/tasks-repo';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';
import { isAdminUser, isRateLimited, requireAdminVia } from '../auth-utils';

type TasksIndexLoader = (user: AuthenticatedUser) => Promise<TasksIndexData>;
type TaskDetailLoader = (user: AuthenticatedUser, taskId: string) => Promise<TaskDetailData>;
type TaskDetailFullLoader = (user: AuthenticatedUser, taskId: string) => Promise<TaskDetailFullData>;
type TasksBoardLoader = (user: AuthenticatedUser) => Promise<TasksBoardData>;
type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;
type CreateTaskFn = (fields: TaskPatch & { name: string }) => Promise<{ task: TaskRow } | { error: string }>;
type UpdateTaskFn = (id: string, patch: TaskPatch) => Promise<{ ok: true } | { error: string }>;
type DeleteTaskFn = (id: string) => Promise<{ ok: true; deleted?: boolean } | { error: string }>;

type TasksRoutesOptions = {
  authResolver?: AuthResolver;
  formDataParser?: (c: Context) => Promise<FormData | null>;
  taskDetailLoader?: TaskDetailLoader;
  taskDetailFullLoader?: TaskDetailFullLoader;
  tasksIndexLoader?: TasksIndexLoader;
  tasksBoardLoader?: TasksBoardLoader;
  createTaskFn?: CreateTaskFn;
  updateTaskFn?: UpdateTaskFn;
  deleteTaskFn?: DeleteTaskFn;
};

const attachmentHits = new Map<string, { count: number; resetAt: number }>();
const commentHits = new Map<string, { count: number; resetAt: number }>();
const deliverableHits = new Map<string, { count: number; resetAt: number }>();
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'application/pdf', 'application/zip', 'application/x-zip', 'text/plain', 'application/octet-stream'];
const BLOCKED_EXTENSIONS = ['.html', '.htm', '.svg', '.js', '.exe', '.bat', '.sh', '.cmd', '.msi', '.php'];
const LONG_SIGNED_URL_EXPIRY_SEC = 365 * 24 * 60 * 60;

export function createTasksRoutes(options: TasksRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const parseFormData = options.formDataParser ?? ((c: Context) => c.req.formData().catch(() => null));
  const taskDetailLoader = options.taskDetailLoader ?? loadTaskDetail;
  const taskDetailFullLoader = options.taskDetailFullLoader ?? loadTaskDetailFull;
  const tasksIndexLoader = options.tasksIndexLoader ?? loadTasksIndex;
  const tasksBoardLoader = options.tasksBoardLoader ?? loadTasksBoard;
  const createTaskFn = options.createTaskFn ?? createTaskRepo;
  const updateTaskFn = options.updateTaskFn ?? updateTaskRepo;
  const deleteTaskFn = options.deleteTaskFn ?? deleteTaskRepo;

  return new Hono()
    // The one write seam for tasks — any authenticated user may create/patch
    // (whitelisted fields only, sanitizeTaskPatch drops the rest); delete is
    // admin-only. Mirrors the live RLS write rule exactly.
    .post('/tasks', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'unauthorized' }, 401);

      const body = await c.req.json().catch(() => null);
      if (!body || typeof body.name !== 'string' || !body.name.trim()) {
        return c.json({ error: 'invalid_body' }, 400);
      }

      const fields = { ...sanitizeTaskPatch(body), name: body.name.trim() };
      const result = await createTaskFn(fields);
      if ('error' in result) return c.json({ error: result.error }, 500);
      return c.json({ task: result.task });
    })
    .patch('/tasks/:id', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'unauthorized' }, 401);

      const body = await c.req.json().catch(() => null);
      const patch = body ? sanitizeTaskPatch(body) : {};
      if (!Object.keys(patch).length) return c.json({ error: 'empty_patch' }, 400);

      const result = await updateTaskFn(c.req.param('id'), patch);
      if ('error' in result) return c.json({ error: result.error }, 500);
      return c.json({ ok: true });
    })
    .delete('/tasks/:id', async (c) => {
      const guard = await requireAdminVia(c, authResolver);
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);

      const result = await deleteTaskFn(c.req.param('id'));
      if ('error' in result) return c.json({ error: result.error }, 500);
      return c.json({ ok: true });
    })
    // Rich loaders for the faithful Paper pages (LinearBoard + full task detail).
    .get('/task-detail/:id', async (c) => {
      const user = await authResolver(c);

      if (!user) {
        return c.json({ error: 'unauthorized' }, 401);
      }

      try {
        const data = await taskDetailFullLoader(user, c.req.param('id'));
        return c.json(data);
      } catch (error) {
        if (error instanceof AccessError) {
          return c.json({ error: error.message }, accessErrorStatus(error.reason));
        }

        console.error('[hono task-detail/:id] load failed:', error);
        return c.json({ error: 'Failed to load task.' }, 500);
      }
    })
    .get('/tasks-board', async (c) => {
      const user = await authResolver(c);

      if (!user) {
        return c.json({ error: 'unauthorized' }, 401);
      }

      try {
        const data = await tasksBoardLoader(user);
        return c.json(data);
      } catch (error) {
        if (error instanceof AccessError) {
          return c.json({ error: error.message }, accessErrorStatus(error.reason));
        }

        console.error('[hono tasks-board] load failed:', error);
        return c.json({ error: 'Failed to load tasks.' }, 500);
      }
    })
    .get('/tasks-index', async (c) => {
    const user = await authResolver(c);

    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    try {
      const data = await tasksIndexLoader(user);
      return c.json(data);
    } catch (error) {
      if (error instanceof AccessError) {
        return c.json({ error: error.message }, accessErrorStatus(error.reason));
      }

      console.error('[hono tasks-index] load failed:', error);
      return c.json({ error: 'Failed to load tasks.' }, 500);
    }
  })
    .get('/tasks-index/:id', async (c) => {
      const user = await authResolver(c);

      if (!user) {
        return c.json({ error: 'unauthorized' }, 401);
      }

      try {
        const data = await taskDetailLoader(user, c.req.param('id'));
        return c.json(data);
      } catch (error) {
        if (error instanceof AccessError) {
          return c.json({ error: error.message }, accessErrorStatus(error.reason));
        }

        console.error('[hono tasks-index/:id] load failed:', error);
        return c.json({ error: 'Failed to load task.' }, 500);
      }
    })
    .get('/tasks/:id/rail', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'unauthorized' }, 401);
      const id = c.req.param('id');
      const [milestones, activity] = await Promise.all([
        fetchMilestones(id).catch(() => []),
        fetchTaskActivity(id, 25).catch(() => []),
      ]);
      return c.json({ milestones, activity });
    })
    .post('/tasks/:id/comments/attachments', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);
      if (isRateLimited(attachmentHits, user.id, { max: 20, windowMs: 60 * 60 * 1000 })) {
        return c.json({ error: 'Too many uploads. Try again later.' }, 429);
      }

      const taskId = c.req.param('id');
      const service = getServiceClient();
      const access = await canAccessTask(user.id, taskId);
      if (!access.found) return c.json({ error: 'Task not found' }, 404);
      if (!access.allowed) return c.json({ error: 'You do not have access to this task' }, 403);

      const formData = await parseFormData(c);
      if (!formData) return c.json({ error: 'Invalid multipart form data' }, 400);
      const file = formData.get('file');
      const commentId = formData.get('comment_id');
      if (!(file instanceof File)) return c.json({ error: 'No file provided' }, 400);
      if (typeof commentId !== 'string' || !commentId) return c.json({ error: 'No comment_id provided' }, 400);
      if (file.size > 10 * 1024 * 1024) return c.json({ error: 'File too large (max 10 MB)' }, 400);
      if (!isAllowedFile(file)) return c.json({ error: 'File type not allowed' }, 400);
      const { data: comment } = await service
        .from('task_comments')
        .select('id')
        .eq('id', commentId)
        .eq('task_id', taskId)
        .single();
      if (!comment) return c.json({ error: 'Comment not found for this task' }, 404);

      const storagePath = `${taskId}/${commentId}/${Date.now()}-${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await service.storage
        .from('chat-attachments')
        .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
      if (uploadError) return c.json({ error: 'Failed to upload file' }, 500);

      const { data: signedUrlData } = await service.storage.from('chat-attachments').createSignedUrl(storagePath, LONG_SIGNED_URL_EXPIRY_SEC);
      const { data: inserted, error: insertError } = await service
        .from('task_comment_attachments')
        .insert({
          comment_id: commentId,
          file_url: signedUrlData?.signedUrl ?? '',
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
          storage_path: storagePath,
        } as never)
        .select()
        .single();
      if (insertError) return c.json({ error: 'Failed to save attachment record' }, 500);
      return c.json(inserted, 201);
    })
    // Comment writes ride the same seam as task writes: browser → API →
    // service client. The legacy sheet's direct browser-Supabase inserts
    // silently no-op in dev (no browser session), so the full-page thread
    // posts here instead.
    .post('/tasks/:id/comments', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);
      if (isRateLimited(commentHits, user.id, { max: 60, windowMs: 60 * 60 * 1000 })) {
        return c.json({ error: 'Too many comments. Try again later.' }, 429);
      }

      const taskId = c.req.param('id');
      const access = await canAccessTask(user.id, taskId);
      if (!access.found) return c.json({ error: 'Task not found' }, 404);
      if (!access.allowed) return c.json({ error: 'You do not have access to this task' }, 403);

      const body = await c.req.json().catch(() => null);
      const content = typeof body?.content === 'string' ? body.content.trim() : '';
      const replyToId =
        typeof body?.reply_to_id === 'string' && body.reply_to_id ? body.reply_to_id : null;
      if (!content) return c.json({ error: 'Comment cannot be empty' }, 400);
      if (content.length > 10_000) return c.json({ error: 'Comment too long' }, 400);

      const service = getServiceClient();
      const { data: inserted, error } = await service
        .from('task_comments')
        .insert({
          task_id: taskId,
          user_id: user.id,
          content,
          reply_to_id: replyToId,
        } as never)
        .select('*, profiles(id, display_name, avatar_url)')
        .single();
      if (error || !inserted) return c.json({ error: 'Failed to post comment' }, 500);

      // Notifications are best-effort — a failed insert must not fail the comment.
      await notifyCommentTargets({
        senderId: user.id,
        senderName: access.profile?.display_name ?? 'Someone',
        taskId,
        taskName: access.task?.name ?? 'Task',
        commentId: (inserted as { id: string }).id,
        content,
      }).catch(() => {});

      return c.json({ comment: inserted }, 201);
    })
    .patch('/tasks/:id/comments/:commentId', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const taskId = c.req.param('id');
      const commentId = c.req.param('commentId');
      const body = await c.req.json().catch(() => null);
      const content = typeof body?.content === 'string' ? body.content.trim() : '';
      if (!content) return c.json({ error: 'Comment cannot be empty' }, 400);
      if (content.length > 10_000) return c.json({ error: 'Comment too long' }, 400);

      const service = getServiceClient();
      const { data: existing } = await service
        .from('task_comments')
        .select('id, user_id')
        .eq('id', commentId)
        .eq('task_id', taskId)
        .maybeSingle();
      if (!existing) return c.json({ error: 'Comment not found' }, 404);
      if ((existing as { user_id: string }).user_id !== user.id) {
        return c.json({ error: 'You can only edit your own comments' }, 403);
      }

      const { error } = await service
        .from('task_comments')
        .update({ content, updated_at: new Date().toISOString() } as never)
        .eq('id', commentId);
      if (error) return c.json({ error: 'Failed to update comment' }, 500);
      return c.json({ ok: true });
    })
    .delete('/tasks/:id/comments/:commentId', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const taskId = c.req.param('id');
      const commentId = c.req.param('commentId');
      const service = getServiceClient();
      const { data: existing } = await service
        .from('task_comments')
        .select('id, user_id')
        .eq('id', commentId)
        .eq('task_id', taskId)
        .maybeSingle();
      if (!existing) return c.json({ error: 'Comment not found' }, 404);

      const own = (existing as { user_id: string }).user_id === user.id;
      if (!own && !(await isAdminSafe(user.id))) {
        return c.json({ error: 'You can only delete your own comments' }, 403);
      }

      const { error } = await service.from('task_comments').delete().eq('id', commentId);
      if (error) return c.json({ error: 'Failed to delete comment' }, 500);
      return c.json({ ok: true });
    })
    .post('/tasks/:id/comments/:commentId/reactions', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const taskId = c.req.param('id');
      const commentId = c.req.param('commentId');
      const access = await canAccessTask(user.id, taskId);
      if (!access.found) return c.json({ error: 'Task not found' }, 404);
      if (!access.allowed) return c.json({ error: 'You do not have access to this task' }, 403);

      const body = await c.req.json().catch(() => null);
      const emoji = typeof body?.emoji === 'string' ? body.emoji : '';
      // Reactions come from the fixed picker; the length cap just keeps
      // arbitrary payloads out of the table.
      if (!emoji || emoji.length > 8) return c.json({ error: 'Invalid emoji' }, 400);

      const service = getServiceClient();
      const { data: comment } = await service
        .from('task_comments')
        .select('id')
        .eq('id', commentId)
        .eq('task_id', taskId)
        .maybeSingle();
      if (!comment) return c.json({ error: 'Comment not found' }, 404);

      const { data: existing } = await service
        .from('task_comment_reactions')
        .select('id')
        .eq('comment_id', commentId)
        .eq('user_id', user.id)
        .eq('emoji', emoji)
        .maybeSingle();

      if (existing) {
        const { error } = await service
          .from('task_comment_reactions')
          .delete()
          .eq('id', (existing as { id: string }).id);
        if (error) return c.json({ error: 'Failed to remove reaction' }, 500);
        return c.json({ ok: true, toggled: 'off' });
      }

      const { error } = await service
        .from('task_comment_reactions')
        .insert({ comment_id: commentId, user_id: user.id, emoji } as never);
      if (error) return c.json({ error: 'Failed to add reaction' }, 500);
      return c.json({ ok: true, toggled: 'on' });
    })
    .get('/tasks/:id/deliverables', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Forbidden' }, 403);
      if (!(await isAdminSafe(user.id))) return c.json({ error: 'Forbidden' }, 403);
      const service = getServiceClient();

      const { data: rows, error } = await service
        .from('task_deliverables')
        .select('id, task_id, file_name, storage_path, uploaded_by, created_at')
        .eq('task_id', c.req.param('id'))
        .order('created_at', { ascending: true });
      if (error) return c.json({ error: 'Failed to fetch deliverables' }, 500);

      const withUrls = await Promise.all((rows ?? []).map(async (row: Record<string, unknown>) => {
        const { data: signed } = await service.storage.from('task-deliverables').createSignedUrl(row.storage_path as string, LONG_SIGNED_URL_EXPIRY_SEC);
        return { ...row, download_url: signed?.signedUrl ?? null };
      }));
      return c.json(withUrls);
    })
    .post('/tasks/:id/deliverables', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);
      if (isRateLimited(deliverableHits, user.id, { max: 10, windowMs: 60 * 60 * 1000 })) {
        return c.json({ error: 'Too many uploads. Try again later.' }, 429);
      }

      const taskId = c.req.param('id');
      const service = getServiceClient();
      const access = await canAccessTask(user.id, taskId);
      if (!access.found) return c.json({ error: 'Task not found' }, 404);
      if (!access.allowed) return c.json({ error: 'Only the assignee or an admin can upload deliverables for this task' }, 403);

      const formData = await parseFormData(c);
      if (!formData) return c.json({ error: 'Invalid multipart form data' }, 400);
      const file = formData.get('file');
      if (!(file instanceof File)) return c.json({ error: 'No file provided' }, 400);
      if (file.size > 25 * 1024 * 1024) return c.json({ error: 'File too large (max 25 MB)' }, 400);
      if (!isAllowedFile(file)) return c.json({ error: 'File type not allowed' }, 400);

      const storagePath = `${taskId}/${Date.now()}-${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await service.storage
        .from('task-deliverables')
        .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
      if (uploadError) return c.json({ error: 'Failed to upload deliverable' }, 500);

      const { data: inserted, error: insertError } = await service
        .from('task_deliverables')
        .insert({ task_id: taskId, file_name: file.name, storage_path: storagePath, uploaded_by: user.id } as never)
        .select('id, task_id, file_name, storage_path, uploaded_by, created_at')
        .single();
      if (insertError) return c.json({ error: 'Failed to save deliverable record' }, 500);

      await notifyAdminsOfDeliverable(user.id, taskId);
      return c.json(inserted, 201);
    })
    .patch('/tasks/:id/progress', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Invalid JSON' }, 400);
      }
      const progress = (body as { progress?: unknown } | null)?.progress;
      if (
        typeof progress !== 'number' ||
        !Number.isFinite(progress) ||
        progress < 0 ||
        progress > 100
      ) {
        return c.json({ error: 'progress must be a number between 0 and 100' }, 400);
      }

      const taskId = c.req.param('id');
      const access = await canAccessTask(user.id, taskId);
      if (!access.found) return c.json({ error: 'Task not found' }, 404);
      if (!access.allowed) {
        return c.json({ error: 'Only the assignee or an admin can update this task' }, 403);
      }

      const service = getServiceClient();
      const rounded = Math.round(progress);
      const { error } = await service
        .from('tasks')
        .update({ progress: rounded } as never)
        .eq('id', taskId);
      if (error) return c.json({ error: 'Failed to update progress' }, 500);

      return c.json({ id: taskId, progress: rounded });
    })
    .patch('/tasks/:taskId/steps/:stepId', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const taskId = c.req.param('taskId');
      const stepId = c.req.param('stepId');

      const access = await canAccessTask(user.id, taskId);
      if (!access.found) return c.json({ error: 'Task not found' }, 404);
      if (!access.allowed) {
        return c.json({ error: 'Only the assignee or an admin can update this task' }, 403);
      }

      const service = getServiceClient();
      const { data: steps, error } = await service
        .from('task_steps')
        .select('id, state, sort_order')
        .eq('task_id', taskId)
        .order('sort_order', { ascending: true });
      if (error) return c.json({ error: 'Failed to load steps' }, 500);

      const rows = (steps ?? []) as { id: string; state: 'pending' | 'in_review' | 'done'; sort_order: number }[];
      const step = rows.find((s) => s.id === stepId);
      if (!step) return c.json({ error: 'Step not found' }, 404);

      let target: 'pending' | 'in_review' | 'done';
      if (access.isAdmin) {
        // Admin may set any valid state (completes the review loop without an
        // authoring UI yet — see design §10). Defaults to in_review.
        const body = (await c.req.json().catch(() => null)) as { state?: unknown } | null;
        const requested = body?.state;
        target =
          requested === 'pending' || requested === 'in_review' || requested === 'done'
            ? requested
            : 'in_review';
      } else {
        // Contractor: only the focal pending step advances to in_review.
        const focal = rows.find((s) => s.state !== 'done');
        if (!focal || focal.id !== stepId) {
          return c.json({ error: 'Only the current step can be advanced' }, 403);
        }
        if (step.state !== 'pending') {
          return c.json({ error: 'Step is not awaiting submission' }, 409);
        }
        target = 'in_review';
      }

      const { error: updateError } = await service
        .from('task_steps')
        .update({ state: target } as never)
        .eq('id', stepId);
      if (updateError) return c.json({ error: 'Failed to update step' }, 500);

      return c.json({ id: stepId, state: target });
    })
    .delete('/tasks/:id/deliverables/:deliverableId', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Forbidden' }, 403);
      if (!(await isAdminSafe(user.id))) return c.json({ error: 'Forbidden' }, 403);
      const service = getServiceClient();

      const taskId = c.req.param('id');
      const deliverableId = c.req.param('deliverableId');
      const { data: row } = await service
        .from('task_deliverables')
        .select('id, task_id, storage_path')
        .eq('id', deliverableId)
        .eq('task_id', taskId)
        .single();
      if (!row) return c.json({ error: 'Deliverable not found' }, 404);

      const { error: storageError } = await service.storage.from('task-deliverables').remove([row.storage_path as string]);
      if (storageError) return c.json({ error: 'Failed to delete file from storage' }, 500);
      const { error } = await service.from('task_deliverables').delete().eq('id', deliverableId).eq('task_id', taskId);
      if (error) return c.json({ error: 'Failed to delete deliverable record' }, 500);
      return c.body(null, 204);
    })
    .post('/tasks/:id/handoff', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);
      const body = await c.req.json().catch(() => null) as { toUserId?: string; note?: string } | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);
      if (!body.toUserId) return c.json({ error: 'toUserId is required' }, 400);

      const taskId = c.req.param('id');
      const service = getServiceClient();
      const access = await canAccessTask(user.id, taskId);
      if (!access.found) return c.json({ error: 'Task not found' }, 404);
      if (!access.allowed) return c.json({ error: 'Only the assignee or an admin can hand off this task' }, 403);
      const { data: targetProfile } = await service.from('profiles').select('id').eq('id', body.toUserId).single();
      if (!targetProfile) return c.json({ error: 'Target user not found' }, 404);

      const { error: insertError } = await service.from('task_handoffs').insert({
        task_id: taskId,
        from_user_id: user.id,
        to_user_id: body.toUserId,
        note: body.note?.trim() || null,
      } as never);
      if (insertError) return c.json({ error: 'Failed to record handoff' }, 500);
      const { error: updateError } = await service.from('tasks').update({ assignee_id: body.toUserId } as never).eq('id', taskId);
      if (updateError) return c.json({ error: 'Failed to reassign task' }, 500);

      await service.from('notifications').insert({
        user_id: body.toUserId,
        kind: 'task_handoff',
        title: 'Task handed off to you',
        body: `A task was handed off to you`,
        link: `/tasks?task=${taskId}`,
        read: false,
      } as never);
      return c.json({ success: true });
    });
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isAllowedFile(file: File): boolean {
  const ext = `.${(file.name.split('.').pop() ?? '').toLowerCase()}`;
  if (BLOCKED_EXTENSIONS.includes(ext)) return false;
  const mime = (file.type || 'application/octet-stream').toLowerCase();
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

/**
 * Deliverables' admin gate wants "could not verify" to fail closed (403), not
 * bubble to a 500 — the pre-refactor inline query ignored its error the same
 * way. isAdminUser itself must keep throwing (eko-activity's assertAdmin
 * relies on that to distinguish "verify failed" from "verified: not admin"),
 * so this is a thin local catch rather than a change to the shared gate.
 */
async function isAdminSafe(userId: string): Promise<boolean> {
  try {
    return await isAdminUser(userId);
  } catch {
    return false;
  }
}

async function canAccessTask(userId: string, taskId: string) {
  const service = getServiceClient();
  const [{ data: profile }, { data: task }] = await Promise.all([
    service.from('profiles').select('is_admin, display_name').eq('id', userId).single(),
    service.from('tasks').select('id, assignee_id, name').eq('id', taskId).single(),
  ]);
  if (!task) return { found: false, allowed: false, isAdmin: false, task: null, profile };
  const isAdmin = !!profile?.is_admin;
  return { found: true, allowed: isAdmin || task.assignee_id === userId, isAdmin, task, profile };
}

/**
 * Same fan-out the legacy sheet did client-side: @mentioned teammates get a
 * 'mentioned' notification, every other prior commenter gets 'comment_reply'.
 * Links go to the full-page detail (/tasks/:id), not the retired sheet URL.
 */
async function notifyCommentTargets({
  senderId,
  senderName,
  taskId,
  taskName,
  commentId,
  content,
}: {
  senderId: string;
  senderName: string;
  taskId: string;
  taskName: string;
  commentId: string;
  content: string;
}) {
  const service = getServiceClient();
  const [{ data: team }, { data: priorComments }] = await Promise.all([
    service.from('profiles').select('id, display_name'),
    service.from('task_comments').select('user_id').eq('task_id', taskId).neq('id', commentId),
  ]);

  const lower = content.toLowerCase();
  const notifs: { user_id: string; kind: string; title: string; body: string; link: string; read: boolean }[] = [];

  for (const member of (team ?? []) as { id: string; display_name?: string | null }[]) {
    const dn = member.display_name;
    if (!dn || member.id === senderId) continue;
    if (!lower.includes(`@${dn.toLowerCase()}`)) continue;
    notifs.push({
      user_id: member.id,
      kind: 'mentioned',
      title: 'You were mentioned',
      body: `${senderName} mentioned you in "${taskName}"`,
      link: `/tasks/${taskId}`,
      read: false,
    });
  }

  const mentionedIds = new Set(notifs.map((n) => n.user_id));
  const otherCommenters = new Set(
    ((priorComments ?? []) as { user_id: string }[])
      .map((row) => row.user_id)
      .filter((uid) => uid && uid !== senderId && !mentionedIds.has(uid)),
  );
  for (const uid of otherCommenters) {
    notifs.push({
      user_id: uid,
      kind: 'comment_reply',
      title: 'New reply',
      body: `${senderName} replied in "${taskName}"`,
      link: `/tasks/${taskId}`,
      read: false,
    });
  }

  if (notifs.length > 0) {
    await service.from('notifications').insert(notifs as never[]);
  }
}

async function notifyAdminsOfDeliverable(userId: string, taskId: string) {
  const service = getServiceClient();
  const [{ data: profile }, { data: task }, { data: admins }] = await Promise.all([
    service.from('profiles').select('display_name').eq('id', userId).single(),
    service.from('tasks').select('name').eq('id', taskId).single(),
    service.from('profiles').select('id').eq('is_admin', true),
  ]);
  if (!admins?.length) return;
  await service.from('notifications').insert(
    admins.map(({ id }) => ({
      user_id: id,
      kind: 'deliverable_uploaded',
      title: 'Deliverable uploaded',
      body: `${profile?.display_name ?? 'Someone'} uploaded a deliverable for "${task?.name ?? 'Task'}"`,
      link: `/tasks?task=${taskId}`,
      read: false,
    })) as never[]
  );
}
