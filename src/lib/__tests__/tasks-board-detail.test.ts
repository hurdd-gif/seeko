import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
  getServiceClientAs: mocks.getServiceClient,
}));

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

// Connected tasks. TASK_ROW ('task-1') is linked to 'task-2'; 'task-3' is the
// only remaining candidate for the picker.
const LINKED_TASK_2 = { id: 'task-2', task_number: 8, name: 'Wire the API', status: 'Todo' };
const LINKED_TASK_3 = { id: 'task-3', task_number: 9, name: 'Write the docs', status: 'Backlog' };
// task_links rows arrive in canonical storage order (smaller uuid in task_a) with
// both sides joined — fetchTaskLinks picks whichever side ISN'T the task we asked about.
const LINK_ROWS = [
  { task_a: { id: 'task-1', task_number: 7, name: 'Ship banner', status: 'In Progress' }, task_b: LINKED_TASK_2 },
];
// The candidates query is `tasks.select(...).neq('id', taskId)` — every task but
// this one. The already-linked exclusion happens in memory, so task-2 is here.
const CANDIDATE_ROWS = [LINKED_TASK_3, LINKED_TASK_2];
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
function serviceMock(
  extRow: Record<string, unknown> | null,
  opts: {
    profile?: Record<string, unknown>;
    /** What an UNSCOPED candidate query surfaces (admin path). */
    fullCandidates?: unknown[];
    /** What the DB returns once the loader appends .eq('assignee_id', id) (non-admin path). */
    scopedCandidates?: unknown[];
    /** Spy invoked with the (column, value) the non-admin scope .eq() actually receives. */
    captureScopeEq?: (column: unknown, value: unknown) => void;
  } = {},
) {
  const profile = opts.profile ?? ADMIN_PROFILE;
  const fullCandidates = opts.fullCandidates ?? CANDIDATE_ROWS;
  const scopedCandidates = opts.scopedCandidates ?? CANDIDATE_ROWS;
  return {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            // Single-profile lookup: .select(...).eq('id', ...).maybeSingle()
            eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }),
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
          select: () => ({
            // The task itself: .select(...).eq('id', ...).maybeSingle()
            eq: () => ({ maybeSingle: async () => ({ data: TASK_ROW, error: null }) }),
            // Link-picker candidates. Admin chain ends at
            //   .neq('id', taskId).order('task_number', ...)                → full list.
            // Non-admin chain appends the assignee scope
            //   .neq('id', taskId).order('task_number', ...).eq('assignee_id', id) → scoped.
            neq: () => ({
              order: () => ({
                then: (resolve: (v: unknown) => unknown) =>
                  Promise.resolve({ data: fullCandidates, error: null }).then(resolve),
                eq: (column: unknown, value: unknown) => {
                  opts.captureScopeEq?.(column, value);
                  return {
                    then: (resolve: (v: unknown) => unknown) =>
                      Promise.resolve({ data: scopedCandidates, error: null }).then(resolve),
                  };
                },
              }),
            }),
          }),
        };
      }
      if (table === 'task_links') {
        // Symmetric read: .select(<both sides joined>).or('task_a.eq.X,task_b.eq.X')
        return {
          select: () => ({ or: async () => ({ data: LINK_ROWS, error: null }) }),
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
            // .not() is attributedOnly (lib/activity-log.ts) — the feed only
            // renders events it can attribute to a person.
            eq: () => ({
              not: () => ({
                order: () => ({
                  limit: () => ({
                    then: (resolve: (v: unknown) => unknown) =>
                      Promise.resolve({ data: ACTIVITY_ROWS, error: null }).then(resolve),
                  }),
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

  it('resolves each link row to the OTHER task, and excludes self + linked from the picker', async () => {
    mocks.getServiceClient.mockReturnValue(serviceMock(null));

    const data = await loadTaskDetailFull({ id: 'admin-1' }, 'task-1');

    // The link row holds task-1 on one side and task-2 on the other; the list is
    // "what task-1 is connected to", so only task-2 comes back.
    expect(data.links).toEqual([
      { id: 'task-2', task_number: 8, name: 'Wire the API', status: 'Todo' },
    ]);
    // task-1 is excluded by the query, task-2 by the already-linked filter.
    expect(data.linkCandidates).toEqual([
      { id: 'task-3', task_number: 9, name: 'Write the docs', status: 'Backlog' },
    ]);
  });
});

// The link picker's candidate list is a tenant-isolation surface: it must never
// hand a non-admin the id/number/name/status of tasks they can't otherwise see.
// Admins keep the full list; non-admins are scoped to their own assigned tasks —
// the same rule every other non-admin read path in tasks-board.ts follows.
describe('loadTaskDetailFull linkCandidates scoping', () => {
  const NON_ADMIN_ASSIGNEE = {
    id: 'user-1',
    display_name: 'Riley',
    department: 'Coding',
    avatar_url: null,
    is_admin: false,
    is_investor: false,
  };
  // TASK_ROW.assignee_id === 'user-1', so this caller clears the own-task gate.
  const OWN_TASK = { id: 'task-3', task_number: 9, name: 'Write the docs', status: 'Backlog' };
  const OTHER_USER_TASK = { id: 'task-4', task_number: 10, name: 'Balance pass', status: 'Todo' };

  beforeEach(() => {
    mocks.getServiceClient.mockReset();
  });

  it("scopes linkCandidates to the caller's own assigned tasks for a non-admin assignee", async () => {
    const scopeEq = vi.fn();
    mocks.getServiceClient.mockReturnValue(
      serviceMock(null, {
        profile: NON_ADMIN_ASSIGNEE,
        // fullCandidates = what an UNSCOPED query would surface (every other task);
        // scopedCandidates = what the DB returns once the loader appends
        // .eq('assignee_id', 'user-1'). Only OWN_TASK belongs to this caller.
        fullCandidates: [OWN_TASK, LINKED_TASK_2, OTHER_USER_TASK],
        scopedCandidates: [OWN_TASK],
        captureScopeEq: scopeEq,
      }),
    );

    const data = await loadTaskDetailFull({ id: 'user-1' }, 'task-1');

    // Only their own other task — NOT task-4 (another user's) and NOT task-2,
    // proving the picker no longer leaks the studio's whole task list to a
    // non-admin.
    expect(data.linkCandidates).toEqual([OWN_TASK]);
    expect(data.linkCandidates.some((c) => c.id === 'task-4')).toBe(false);
    expect(data.linkCandidates.some((c) => c.id === 'task-2')).toBe(false);
    // The scope filtered on the caller's OWN id — not some other column/value.
    // (A bug scoping to the wrong id would still return [OWN_TASK] from the mock,
    // so assert the actual argument, not just that the branch was taken.)
    expect(scopeEq).toHaveBeenCalledWith('assignee_id', 'user-1');
  });

  it('gives an admin the full candidate list (every other task)', async () => {
    mocks.getServiceClient.mockReturnValue(
      serviceMock(null, {
        profile: ADMIN_PROFILE,
        fullCandidates: [OWN_TASK, LINKED_TASK_2, OTHER_USER_TASK],
      }),
    );

    const data = await loadTaskDetailFull({ id: 'admin-1' }, 'task-1');

    // task-2 is already linked (LINK_ROWS) → excluded in memory. Everything else,
    // including another user's task-4, stays available to the admin.
    expect(data.linkCandidates).toEqual([OWN_TASK, OTHER_USER_TASK]);
  });
});
