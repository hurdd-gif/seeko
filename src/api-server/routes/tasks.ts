import { Hono, type Context } from 'hono';
import {
  loadTaskDetail,
  loadTasksIndex,
  TaskDetailAccessError,
  TasksIndexAccessError,
  type TaskDetailData,
  type TasksIndexData,
} from '@/lib/tasks-index';
import {
  loadTasksBoard,
  loadTaskDetailFull,
  TasksBoardAccessError,
  type TasksBoardData,
  type TaskDetailFullData,
} from '@/lib/tasks-board';
import { fetchMilestones, fetchTaskActivity } from '@/lib/supabase/data';
import { getServiceClient } from '@/lib/supabase/service';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';
import { isRateLimited } from '../auth-utils';

type TasksIndexLoader = (user: AuthenticatedUser) => Promise<TasksIndexData>;
type TaskDetailLoader = (user: AuthenticatedUser, taskId: string) => Promise<TaskDetailData>;
type TaskDetailFullLoader = (user: AuthenticatedUser, taskId: string) => Promise<TaskDetailFullData>;
type TasksBoardLoader = (user: AuthenticatedUser) => Promise<TasksBoardData>;
type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;

type TasksRoutesOptions = {
  authResolver?: AuthResolver;
  formDataParser?: (c: Context) => Promise<FormData | null>;
  taskDetailLoader?: TaskDetailLoader;
  taskDetailFullLoader?: TaskDetailFullLoader;
  tasksIndexLoader?: TasksIndexLoader;
  tasksBoardLoader?: TasksBoardLoader;
};

const attachmentHits = new Map<string, { count: number; resetAt: number }>();
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

  return new Hono()
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
        if (error instanceof TaskDetailAccessError) {
          if (error.code === 'forbidden' || error.code === 'investor_forbidden') {
            return c.json({ error: error.code }, 403);
          }
          return c.json({ error: error.code }, 404);
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
        if (error instanceof TasksBoardAccessError) {
          return c.json({ error: error.code }, error.code === 'investor_forbidden' ? 403 : 404);
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
      if (error instanceof TasksIndexAccessError) {
        return c.json({ error: error.code }, error.code === 'investor_forbidden' ? 403 : 404);
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
        if (error instanceof TaskDetailAccessError) {
          if (error.code === 'forbidden' || error.code === 'investor_forbidden') {
            return c.json({ error: error.code }, 403);
          }
          return c.json({ error: error.code }, 404);
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
    .get('/tasks/:id/deliverables', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Forbidden' }, 403);
      const service = getServiceClient();
      const { data: profile } = await service.from('profiles').select('is_admin').eq('id', user.id).single();
      if (!profile?.is_admin) return c.json({ error: 'Forbidden' }, 403);

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
    .delete('/tasks/:id/deliverables/:deliverableId', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Forbidden' }, 403);
      const service = getServiceClient();
      const { data: profile } = await service.from('profiles').select('is_admin').eq('id', user.id).single();
      if (!profile?.is_admin) return c.json({ error: 'Forbidden' }, 403);

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
