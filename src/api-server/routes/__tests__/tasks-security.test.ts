import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTasksRoutes } from '../tasks';

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
}));

function createQuery(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(async () => {
      if (table === 'profiles') return { data: { is_admin: false, display_name: 'Member Example' } };
      if (table === 'tasks') return { data: { id: 'task-1', assignee_id: 'user-1', name: 'Build task' } };
      if (table === 'task_comments') return { data: null };
      return { data: null };
    }),
    insert: vi.fn(() => query),
  };
  return query;
}

describe('task attachment security', () => {
  beforeEach(() => {
    mocks.upload.mockReset();
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn((table: string) => createQuery(table)),
      storage: {
        from: vi.fn(() => ({
          upload: mocks.upload,
          createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://example.invalid/file.txt' } })),
        })),
      },
    });
  });

  it('rejects attachments when the comment does not belong to the task', async () => {
    const formData = new FormData();
    formData.set('comment_id', 'comment-from-another-task');
    formData.set('file', new File(['hello'], 'note.txt', { type: 'text/plain' }));
    const app = new Hono().route('/api', createTasksRoutes({
      authResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      formDataParser: async () => formData,
    }));

    const response = await app.request('/api/tasks/task-1/comments/attachments', {
      method: 'POST',
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Comment not found for this task' });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
