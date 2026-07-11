import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTasksRoutes } from '../tasks';

const mocks = vi.hoisted(() => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: mocks.getServiceClient }));

type Step = { id: string; state: 'pending' | 'in_review' | 'done'; sort_order: number };

function serviceMock(opts: { isAdmin: boolean; assignee: string; steps: Step[]; onUpdate?: (patch: unknown) => void }) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: opts.isAdmin, display_name: 'X' } }) }) }) };
      }
      if (table === 'tasks') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'task-1', assignee_id: opts.assignee, name: 'T' } }) }) }) };
      }
      if (table === 'task_steps') {
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: opts.steps, error: null }) }) }),
          update: (patch: unknown) => ({ eq: async () => { opts.onUpdate?.(patch); return { error: null }; } }),
        };
      }
      return {};
    }),
  };
}

function app(assignee: string) {
  return new Hono().route('/api', createTasksRoutes({
    authResolver: async () => ({ id: assignee, email: 'x@example.invalid' }),
  }));
}

const STEPS: Step[] = [
  { id: 's1', state: 'done', sort_order: 0 },
  { id: 's2', state: 'pending', sort_order: 1 }, // focal
  { id: 's3', state: 'pending', sort_order: 2 },
];

describe('PATCH /tasks/:taskId/steps/:stepId', () => {
  it('lets the assignee advance the focal pending step to in_review', async () => {
    let patched: unknown;
    mocks.getServiceClient.mockReturnValue(serviceMock({ isAdmin: false, assignee: 'user-1', steps: STEPS, onUpdate: (p) => (patched = p) }));
    const res = await app('user-1').request('/api/tasks/task-1/steps/s2', { method: 'PATCH' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 's2', state: 'in_review' });
    expect(patched).toEqual({ state: 'in_review' });
  });

  it('rejects advancing a non-focal step', async () => {
    mocks.getServiceClient.mockReturnValue(serviceMock({ isAdmin: false, assignee: 'user-1', steps: STEPS }));
    const res = await app('user-1').request('/api/tasks/task-1/steps/s3', { method: 'PATCH' });
    expect(res.status).toBe(403);
  });

  it('rejects a non-admin trying to reach done', async () => {
    mocks.getServiceClient.mockReturnValue(serviceMock({ isAdmin: false, assignee: 'user-1', steps: STEPS }));
    const res = await app('user-1').request('/api/tasks/task-1/steps/s2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'done' }),
    });
    // non-admin path ignores the body and forces in_review
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 's2', state: 'in_review' });
  });

  it('rejects a task the caller does not own', async () => {
    mocks.getServiceClient.mockReturnValue(serviceMock({ isAdmin: false, assignee: 'someone-else', steps: STEPS }));
    const res = await app('user-1').request('/api/tasks/task-1/steps/s2', { method: 'PATCH' });
    expect(res.status).toBe(403);
  });

  it('404s an unknown step', async () => {
    mocks.getServiceClient.mockReturnValue(serviceMock({ isAdmin: false, assignee: 'user-1', steps: STEPS }));
    const res = await app('user-1').request('/api/tasks/task-1/steps/nope', { method: 'PATCH' });
    expect(res.status).toBe(404);
  });

  it('409s when the focal step is already in review', async () => {
    const submitted: Step[] = [{ id: 's2', state: 'in_review', sort_order: 0 }];
    mocks.getServiceClient.mockReturnValue(serviceMock({ isAdmin: false, assignee: 'user-1', steps: submitted }));
    const res = await app('user-1').request('/api/tasks/task-1/steps/s2', { method: 'PATCH' });
    expect(res.status).toBe(409);
  });

  it('lets an admin set any valid state via the body', async () => {
    let patched: unknown;
    mocks.getServiceClient.mockReturnValue(serviceMock({ isAdmin: true, assignee: 'someone-else', steps: [{ id: 's2', state: 'in_review', sort_order: 0 }], onUpdate: (p) => (patched = p) }));
    const res = await app('admin-1').request('/api/tasks/task-1/steps/s2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'done' }),
    });
    expect(res.status).toBe(200);
    expect(patched).toEqual({ state: 'done' });
  });
});
