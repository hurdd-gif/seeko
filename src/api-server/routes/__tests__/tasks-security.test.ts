import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTasksRoutes } from '../tasks';

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  getServiceClientAs: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
  // Records WHO the write was attributed to, then hands back the same fake as
  // getServiceClient — the actor rides in a request header the fake has no use
  // for, so the only thing worth asserting is the name it was called with.
  getServiceClientAs: (...args: unknown[]) => {
    mocks.getServiceClientAs(...args);
    return mocks.getServiceClient();
  },
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
    mocks.getServiceClientAs.mockReset();
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

describe('DELETE /tasks/:id admin gate (requireAdminVia)', () => {
  function appWithAdminFlag(isAdmin: boolean, deleteTaskFn = vi.fn(async () => ({ ok: true as const }))) {
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn((table: string) => createQuery(table, isAdmin)),
    });
    const app = new Hono().route('/api', createTasksRoutes({
      authResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      deleteTaskFn,
    }));
    return { app, deleteTaskFn };
  }

  it('rejects a non-admin with 403', async () => {
    const { app, deleteTaskFn } = appWithAdminFlag(false);
    const response = await app.request('/api/tasks/task-1', { method: 'DELETE' });

    expect(response.status).toBe(403);
    expect(deleteTaskFn).not.toHaveBeenCalled();
  });

  it('allows an admin through and calls the repo delete function', async () => {
    const { app, deleteTaskFn } = appWithAdminFlag(true);
    const response = await app.request('/api/tasks/task-1', { method: 'DELETE' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(deleteTaskFn).toHaveBeenCalledWith('task-1', expect.anything());
    // A delete is the one write the row itself can never account for afterwards:
    // once it is gone, only the request knew who did it. The client the route
    // hands the repo must therefore name the admin who asked.
    expect(mocks.getServiceClientAs).toHaveBeenCalledWith('user-1');
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
