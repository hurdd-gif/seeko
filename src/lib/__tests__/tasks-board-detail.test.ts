import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: mocks.getServiceClient }));

import { loadTaskDetailFull } from '../tasks-board';

const ADMIN_PROFILE = {
  id: 'admin-1',
  display_name: 'Admin',
  department: 'Coding',
  avatar_url: null,
  is_admin: true,
  is_investor: false,
};

const TASK_ROW = {
  id: 'task-1',
  task_number: 7,
  name: 'Ship banner',
  department: 'Coding',
  status: 'In Progress',
  priority: 'High',
  area_id: null,
  assignee_id: 'user-1',
  deadline: '2026-07-18',
  description: null,
  bounty: null,
  progress: 10,
  created_at: '2026-07-01T00:00:00.000Z',
  assignee: { id: 'user-1', display_name: 'Riley', avatar_url: null },
};

const TEAM = [
  {
    id: 'user-1',
    display_name: 'Riley',
    department: 'Coding',
    role: 'Engineer',
    avatar_url: null,
    is_admin: false,
    is_contractor: true,
    is_investor: false,
  },
];

const AREAS: unknown[] = [];
const MILESTONE_ROWS: unknown[] = [];
const ACTIVITY_ROWS: unknown[] = [];
const COMMENT_ROWS: Record<string, unknown>[] = [
  {
    id: 'comment-1',
    task_id: 'task-1',
    user_id: 'user-1',
    content: 'Looks good',
    created_at: '2026-07-02T00:00:00.000Z',
    profiles: { id: 'user-1', display_name: 'Riley', avatar_url: null },
    task_comment_reactions: [{ id: 'r-1', emoji: '👍', user_id: 'admin-1' }],
    task_comment_attachments: [],
  },
];

/** Mirrors the `vi.hoisted` + `vi.mock('@/lib/supabase/service')` service-mock
 * idiom already used by `contractor-index-steps.test.ts` — one literal chain
 * per query shape rather than a generic builder, matching this codebase's
 * established style for these mocks. */
function serviceMock(extRow: Record<string, unknown> | null) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            // Single-profile lookup: .select(...).eq('id', ...).maybeSingle()
            eq: () => ({ maybeSingle: async () => ({ data: ADMIN_PROFILE, error: null }) }),
            // Team fetch (inside Promise.all): .select(...).order('display_name', ...)
            order: () => ({
              then: (resolve: (v: unknown) => unknown) =>
                Promise.resolve({ data: TEAM, error: null }).then(resolve),
            }),
          }),
        };
      }
      if (table === 'tasks') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: TASK_ROW, error: null }) }) }),
        };
      }
      if (table === 'areas') {
        return {
          select: () => ({
            order: () => ({
              order: () => ({
                then: (resolve: (v: unknown) => unknown) =>
                  Promise.resolve({ data: AREAS, error: null }).then(resolve),
              }),
            }),
          }),
        };
      }
      if (table === 'task_milestone') {
        return {
          select: () => ({
            eq: () => ({
              then: (resolve: (v: unknown) => unknown) =>
                Promise.resolve({ data: MILESTONE_ROWS, error: null }).then(resolve),
            }),
          }),
        };
      }
      if (table === 'activity_log') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  then: (resolve: (v: unknown) => unknown) =>
                    Promise.resolve({ data: ACTIVITY_ROWS, error: null }).then(resolve),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'task_comments') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                then: (resolve: (v: unknown) => unknown) =>
                  Promise.resolve({ data: COMMENT_ROWS, error: null }).then(resolve),
              }),
            }),
          }),
        };
      }
      if (table === 'deadline_extensions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({ maybeSingle: async () => ({ data: extRow, error: null }) }),
              }),
            }),
          }),
        };
      }
      return {};
    }),
  };
}

describe('loadTaskDetailFull pendingExtension', () => {
  beforeEach(() => {
    mocks.getServiceClient.mockReset();
  });

  it('maps a pending deadline_extensions row to pendingExtension, with requesterName from the joined profile', async () => {
    mocks.getServiceClient.mockReturnValue(
      serviceMock({
        id: 'ext-1',
        requested_by: 'user-1',
        original_deadline: '2026-07-18',
        requested_deadline: '2026-07-25',
        reason: 'Scope grew',
        status: 'pending',
        profiles: { display_name: 'Riley' },
      }),
    );

    const data = await loadTaskDetailFull({ id: 'admin-1' }, 'task-1');

    expect(data.pendingExtension).toEqual({
      id: 'ext-1',
      requesterName: 'Riley',
      originalDeadline: '2026-07-18',
      requestedDeadline: '2026-07-25',
      reason: 'Scope grew',
    });
  });

  it('returns null when there is no pending row for the task', async () => {
    mocks.getServiceClient.mockReturnValue(serviceMock(null));

    const data = await loadTaskDetailFull({ id: 'admin-1' }, 'task-1');

    expect(data.pendingExtension).toBeNull();
  });

  it('loads comments (reactions/attachments normalized) and echoes currentUserId', async () => {
    mocks.getServiceClient.mockReturnValue(serviceMock(null));

    const data = await loadTaskDetailFull({ id: 'admin-1' }, 'task-1');

    expect(data.currentUserId).toBe('admin-1');
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0]).toMatchObject({
      id: 'comment-1',
      content: 'Looks good',
      reactions: [{ id: 'r-1', emoji: '👍', user_id: 'admin-1' }],
      attachments: [],
    });
  });
});
