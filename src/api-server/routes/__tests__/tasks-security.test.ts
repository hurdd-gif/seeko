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

function createQuery(table: string, isAdmin = false) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(async () => {
      if (table === 'profiles') return { data: { is_admin: false, display_name: 'Member Example' } };
      if (table === 'tasks') return { data: { id: 'task-1', assignee_id: 'user-1', name: 'Build task' } };
      if (table === 'task_comments') return { data: null };
      return { data: null };
    }),
    maybeSingle: vi.fn(async () => {
      if (table === 'profiles') return { data: { is_admin: isAdmin }, error: null };
      return { data: null, error: null };
    }),
    order: vi.fn(async () => ({ data: [], error: null })),
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

describe('task deliverables admin gate (requireAdminVia migration)', () => {
  function appWithAdminFlag(isAdmin: boolean) {
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn((table: string) => createQuery(table, isAdmin)),
      storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://example.invalid/file' } })) })) },
    });
    return new Hono().route('/api', createTasksRoutes({
      authResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    }));
  }

  it('rejects a non-admin with 403 Forbidden on GET deliverables', async () => {
    const app = appWithAdminFlag(false);
    const response = await app.request('/api/tasks/task-1/deliverables');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('allows an admin through on GET deliverables', async () => {
    const app = appWithAdminFlag(true);
    const response = await app.request('/api/tasks/task-1/deliverables');
    expect(response.status).toBe(200);
  });

  it('rejects a non-admin with 403 Forbidden on DELETE deliverables', async () => {
    const app = appWithAdminFlag(false);
    const response = await app.request('/api/tasks/task-1/deliverables/deliverable-1', { method: 'DELETE' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });
});

describe('task deliverables admin gate — fails closed when the admin check query errors', () => {
  function appWithAdminCheckError() {
    const erroringQuery = {
      select: vi.fn(() => erroringQuery),
      eq: vi.fn(() => erroringQuery),
      maybeSingle: vi.fn(async () => ({ data: null, error: { message: 'boom' } })),
      single: vi.fn(async () => ({ data: null, error: { message: 'boom' } })),
      order: vi.fn(async () => ({ data: [], error: null })),
      insert: vi.fn(() => erroringQuery),
    };
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn(() => erroringQuery),
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://example.invalid/file' } })),
        })),
      },
    });
    return new Hono().route('/api', createTasksRoutes({
      authResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    }));
  }

  it('returns 403 Forbidden (not 500) on GET deliverables when isAdminUser throws', async () => {
    const app = appWithAdminCheckError();
    const response = await app.request('/api/tasks/task-1/deliverables');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 Forbidden (not 500) on DELETE deliverables when isAdminUser throws', async () => {
    const app = appWithAdminCheckError();
    const response = await app.request('/api/tasks/task-1/deliverables/deliverable-1', { method: 'DELETE' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });
});
