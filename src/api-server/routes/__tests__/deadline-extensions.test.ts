import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createWorkflowRoutes } from '../workflow';

const mocks = vi.hoisted(() => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: mocks.getServiceClient }));

// A Promise that also answers .eq() (chainably) — models `.update(...).eq(...).eq(...)`
// and `.update(...).eq(...)` both resolving to the same result.
function eqable(result: unknown): Promise<unknown> & { eq: () => Promise<unknown> } {
  const p = Promise.resolve(result) as Promise<unknown> & { eq: () => Promise<unknown> };
  p.eq = () => eqable(result);
  return p;
}

// ---- POST mock -------------------------------------------------------------
type PostOpts = {
  task?: { id: string; name: string; deadline: string | null; assignee_id: string } | null;
  existingPending?: { id: string } | null;
  onInsert?: (row: Record<string, unknown>) => void;
  insertError?: boolean;
};
function postServiceMock(opts: PostOpts) {
  return {
    from: (table: string) => {
      if (table === 'tasks') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: opts.task ?? null, error: null }) }) }) };
      }
      if (table === 'deadline_extensions') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: opts.existingPending ?? null, error: null }) }) }) }) }),
          insert: (row: Record<string, unknown>) => {
            opts.onInsert?.(row);
            return { select: () => ({ single: async () => ({
              data: opts.insertError ? null : { id: 'ext-1', requested_deadline: row.requested_deadline, reason: row.reason, status: 'pending' },
              error: opts.insertError ? { message: 'boom' } : null,
            }) }) };
          },
        };
      }
      if (table === 'activity_log') return { insert: async () => ({ error: null }) };
      if (table === 'profiles') return { select: () => ({ eq: async () => ({ data: [{ id: 'admin-1' }], error: null }) }) };
      if (table === 'notifications') return { insert: async () => ({ error: null }) };
      return {};
    },
  };
}
function postApp(userId: string) {
  return new Hono().route('/api', createWorkflowRoutes({
    userGuard: async () => ({ ok: true, user: { id: userId, email: 'x@example.invalid' }, isAdmin: false, isInvestor: false }),
  }));
}
function post(app: Hono, body: unknown) {
  return app.request('/api/deadline-extensions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

// ---- PATCH mock ------------------------------------------------------------
type PatchOpts = {
  ext?: { id: string; task_id: string; requested_by: string; requested_deadline: string; status: string; tasks: { name: string } } | null;
  onExtUpdate?: (patch: Record<string, unknown>) => void;
  onTaskUpdate?: (patch: Record<string, unknown>) => void;
  taskUpdateError?: boolean;
};
function patchServiceMock(opts: PatchOpts) {
  return {
    from: (table: string) => {
      if (table === 'deadline_extensions') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: opts.ext ?? null, error: null }) }) }),
          update: (patch: Record<string, unknown>) => { opts.onExtUpdate?.(patch); return eqable({ error: null }); },
        };
      }
      if (table === 'tasks') {
        return { update: (patch: Record<string, unknown>) => { opts.onTaskUpdate?.(patch); return eqable({ error: opts.taskUpdateError ? { message: 'boom' } : null }); } };
      }
      if (table === 'activity_log') return { insert: async () => ({ error: null }) };
      if (table === 'notifications') return { insert: async () => ({ error: null }) };
      return {};
    },
  };
}
function patchApp(isAdmin: boolean) {
  return new Hono().route('/api', createWorkflowRoutes({
    adminGuard: async () => isAdmin
      ? { ok: true, user: { id: 'admin-1', email: 'a@example.invalid' }, isAdmin: true, isInvestor: false }
      : { ok: false, status: 403, error: 'Forbidden' },
  }));
}
function patch(app: Hono, id: string, body: unknown) {
  return app.request(`/api/deadline-extensions/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

const TASK = { id: 'task-1', name: 'Main menu', deadline: '2026-07-18', assignee_id: 'user-1' };

describe('POST /api/deadline-extensions', () => {
  it('inserts a pending row snapshotting original_deadline', async () => {
    let inserted: Record<string, unknown> | undefined;
    mocks.getServiceClient.mockReturnValue(postServiceMock({ task: TASK, onInsert: (r) => (inserted = r) }));
    const res = await post(postApp('user-1'), { taskId: 'task-1', requestedDeadline: '2026-07-25', reason: '  need more time  ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, extension: { status: 'pending', requested_deadline: '2026-07-25' } });
    expect(inserted).toMatchObject({
      task_id: 'task-1', requested_by: 'user-1', original_deadline: '2026-07-18',
      requested_deadline: '2026-07-25', reason: 'need more time', status: 'pending',
    });
  });

  it('stores null reason when blank', async () => {
    let inserted: Record<string, unknown> | undefined;
    mocks.getServiceClient.mockReturnValue(postServiceMock({ task: TASK, onInsert: (r) => (inserted = r) }));
    await post(postApp('user-1'), { taskId: 'task-1', requestedDeadline: '2026-07-25', reason: '   ' });
    expect(inserted?.reason).toBeNull();
  });

  it('403s a non-assignee', async () => {
    mocks.getServiceClient.mockReturnValue(postServiceMock({ task: { ...TASK, assignee_id: 'someone-else' } }));
    const res = await post(postApp('user-1'), { taskId: 'task-1', requestedDeadline: '2026-07-25' });
    expect(res.status).toBe(403);
  });

  it('400s when the task has no deadline', async () => {
    mocks.getServiceClient.mockReturnValue(postServiceMock({ task: { ...TASK, deadline: null } }));
    const res = await post(postApp('user-1'), { taskId: 'task-1', requestedDeadline: '2026-07-25' });
    expect(res.status).toBe(400);
  });

  it('400s a malformed date', async () => {
    mocks.getServiceClient.mockReturnValue(postServiceMock({ task: TASK }));
    const res = await post(postApp('user-1'), { taskId: 'task-1', requestedDeadline: '07/25/2026' });
    expect(res.status).toBe(400);
  });

  it('400s a date not strictly after the current deadline', async () => {
    mocks.getServiceClient.mockReturnValue(postServiceMock({ task: TASK }));
    const res = await post(postApp('user-1'), { taskId: 'task-1', requestedDeadline: '2026-07-18' });
    expect(res.status).toBe(400);
  });

  it('409s when a pending request already exists', async () => {
    mocks.getServiceClient.mockReturnValue(postServiceMock({ task: TASK, existingPending: { id: 'ext-0' } }));
    const res = await post(postApp('user-1'), { taskId: 'task-1', requestedDeadline: '2026-07-25' });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/deadline-extensions/:id', () => {
  const EXT = { id: 'ext-1', task_id: 'task-1', requested_by: 'user-1', requested_deadline: '2026-07-25', status: 'pending', tasks: { name: 'Main menu' } };

  it('approve writes tasks.deadline = requested_deadline', async () => {
    let taskPatch: Record<string, unknown> | undefined;
    mocks.getServiceClient.mockReturnValue(patchServiceMock({ ext: EXT, onTaskUpdate: (p) => (taskPatch = p) }));
    const res = await patch(patchApp(true), 'ext-1', { action: 'approve' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, status: 'approved' });
    expect(taskPatch).toEqual({ deadline: '2026-07-25' });
  });

  it('deny stores denial_reason', async () => {
    let extPatch: Record<string, unknown> | undefined;
    mocks.getServiceClient.mockReturnValue(patchServiceMock({ ext: EXT, onExtUpdate: (p) => (extPatch = p) }));
    const res = await patch(patchApp(true), 'ext-1', { action: 'deny', reason: '  too soon  ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, status: 'denied' });
    expect(extPatch).toMatchObject({ status: 'denied', denial_reason: 'too soon' });
  });

  it('403s a non-admin', async () => {
    mocks.getServiceClient.mockReturnValue(patchServiceMock({ ext: EXT }));
    const res = await patch(patchApp(false), 'ext-1', { action: 'approve' });
    expect(res.status).toBe(403);
  });

  it('409s an already-decided request', async () => {
    mocks.getServiceClient.mockReturnValue(patchServiceMock({ ext: { ...EXT, status: 'approved' } }));
    const res = await patch(patchApp(true), 'ext-1', { action: 'approve' });
    expect(res.status).toBe(409);
  });

  it('rolls back and 500s when the task update fails', async () => {
    const extPatches: Record<string, unknown>[] = [];
    mocks.getServiceClient.mockReturnValue(patchServiceMock({ ext: EXT, taskUpdateError: true, onExtUpdate: (p) => extPatches.push(p) }));
    const res = await patch(patchApp(true), 'ext-1', { action: 'approve' });
    expect(res.status).toBe(500);
    // Second ext update is the rollback to pending.
    expect(extPatches.at(-1)).toMatchObject({ status: 'pending', decided_by: null, decided_at: null });
  });
});
