import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../supabase';
import { createTasksRoutes } from '../routes/tasks';

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
});
