import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../supabase';
import { createTasksRoutes } from '../routes/tasks';

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
}));

function createQuery(
  table: string,
  profile: { is_admin: boolean } | null,
  task: { id: string; assignee_id: string } | null
) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(async () => {
      if (table === 'profiles') return { data: profile };
      if (table === 'tasks') return { data: task };
      return { data: null };
    }),
    update: vi.fn(() => query),
  };
  return query;
}

function mockServiceClient(
  profile: { is_admin: boolean } | null,
  task: { id: string; assignee_id: string } | null
) {
  mocks.getServiceClient.mockReturnValue({
    from: vi.fn((table: string) => createQuery(table, profile, task)),
  });
}

function appWith(authResolver: (c: unknown) => Promise<AuthenticatedUser | null>) {
  // Pass through whatever other options createTasksRoutes requires with test doubles;
  // only authResolver + the validation branch are exercised here.
  return new Hono().route('/api', createTasksRoutes({ authResolver } as never));
}

async function patch(app: Hono, id: string, body: unknown) {
  return app.request(`/api/tasks/${id}/progress`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/tasks/:id/progress', () => {
  beforeEach(() => {
    mocks.getServiceClient.mockReset();
  });

  it('401 when unauthenticated', async () => {
    const app = appWith(async () => null);
    const res = await patch(app, 't1', { progress: 50 });
    expect(res.status).toBe(401);
  });

  it('400 when progress is out of range', async () => {
    const app = appWith(async () => ({ id: 'u1', email: 'x' }) as AuthenticatedUser);
    expect((await patch(app, 't1', { progress: 150 })).status).toBe(400);
    expect((await patch(app, 't1', { progress: -1 })).status).toBe(400);
    expect((await patch(app, 't1', { progress: 'nope' })).status).toBe(400);
    expect((await patch(app, 't1', {})).status).toBe(400);
  });

  it('400 when body is a literal JSON null', async () => {
    const app = appWith(async () => ({ id: 'u1', email: 'x' }) as AuthenticatedUser);
    const res = await patch(app, 't1', null);
    expect(res.status).toBe(400);
  });

  it('403 when caller is neither the assignee nor an admin', async () => {
    mockServiceClient({ is_admin: false }, { id: 't1', assignee_id: 'someone-else' });
    const app = appWith(async () => ({ id: 'u1', email: 'x' }) as AuthenticatedUser);
    const res = await patch(app, 't1', { progress: 50 });
    expect(res.status).toBe(403);
  });

  it('404 when task is not found', async () => {
    mockServiceClient({ is_admin: false }, null);
    const app = appWith(async () => ({ id: 'u1', email: 'x' }) as AuthenticatedUser);
    const res = await patch(app, 't1', { progress: 50 });
    expect(res.status).toBe(404);
  });
});
