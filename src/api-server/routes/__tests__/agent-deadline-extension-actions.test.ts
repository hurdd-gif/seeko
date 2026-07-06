import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentRoutes, planLocalDeadlineExtensionWrite, type AgentChatInput } from '../agent';

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  loadTasksBoard: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
}));

vi.mock('@/lib/tasks-board', () => ({
  loadTasksBoard: mocks.loadTasksBoard,
}));

const authUser = { id: 'user-1', email: 'admin@example.invalid' };
const dashboardContext = [
  'Pending deadline extensions: UI Extension (48h, 2026-07-04 → 2026-07-06, by Mel, id ext-1).',
].join('\n');

function createAgentApp() {
  return new Hono().route('/api', createAgentRoutes({
    authResolver: async () => authUser,
    contextLoader: async () => dashboardContext,
  }));
}

describe('EKO deadline extension actions', () => {
  beforeEach(() => {
    mocks.getServiceClient.mockReset();
    mocks.loadTasksBoard.mockReset();
  });

  it('prepares approving a pending deadline extension as a gated dashboard write', () => {
    expect(planLocalDeadlineExtensionWrite({ message: 'Approve the deadline extension for UI Extension' }, dashboardContext)).toEqual({
      reply: 'Ready for approval: approve deadline extension for UI Extension.',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'deadline_extension.update',
        title: 'Approve UI Extension extension',
        copy: 'Approve pending deadline extension for UI Extension.',
        draft: {
          action: 'approve',
          extensionId: 'ext-1',
          taskName: 'UI Extension',
          reason: undefined,
        },
      },
    });
  });

  it('asks for a target instead of guessing which extension to update', () => {
    expect(planLocalDeadlineExtensionWrite({ message: 'Approve the deadline extension' }, dashboardContext)).toEqual({
      reply: 'Which pending deadline extension should EKO review?',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'clarification',
    });
  });

  it('prepares denying a pending deadline extension with a reason', () => {
    expect(planLocalDeadlineExtensionWrite({ message: 'Deny UI Extension deadline extension because scope needs review' }, dashboardContext)).toEqual({
      reply: 'Ready for approval: deny deadline extension for UI Extension.',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'deadline_extension.update',
        title: 'Deny UI Extension extension',
        copy: 'Deny pending deadline extension for UI Extension.',
        draft: {
          action: 'deny',
          extensionId: 'ext-1',
          taskName: 'UI Extension',
          reason: 'scope needs review',
        },
      },
    });
  });

  it('approves one pending deadline extension only after approval and records the write', async () => {
    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
    mocks.loadTasksBoard.mockResolvedValue({
      projectMilestones: [],
      projectActivity: [],
      tasks: [],
      areas: [],
      team: [],
      account: { notifications: [], unreadCount: 0 },
    });
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'agent_chat_messages') {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            order: vi.fn(() => query),
            limit: vi.fn(async () => ({ data: [], error: null })),
            insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
              for (const row of rows) inserts.push({ table, payload: row });
              return { error: null };
            }),
          };
          return query;
        }

        if (table === 'profiles') {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            maybeSingle: vi.fn(async () => ({ data: { is_admin: true }, error: null })),
          };
          return query;
        }

        if (table === 'deadline_extensions') {
          const extensionRows = [
            {
              id: 'ext-1',
              task_id: 'task-1',
              requested_by: 'mel-1',
              extra_hours: 48,
              original_deadline: '2026-07-04',
              new_deadline: '2026-07-06',
              status: 'pending',
              task: { name: 'UI Extension' },
            },
          ];
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            update: vi.fn((payload: Record<string, unknown>) => {
              updates.push({ table, payload });
              return query;
            }),
            then: (resolve: (value: { data: typeof extensionRows; error: null }) => void) => resolve({ data: extensionRows, error: null }),
          };
          return query;
        }

        if (table === 'tasks') {
          const query = {
            update: vi.fn((payload: Record<string, unknown>) => {
              updates.push({ table, payload });
              return query;
            }),
            eq: vi.fn(() => query),
            then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
          };
          return query;
        }

        if (table === 'activity_log' || table === 'notifications') {
          return {
            insert: vi.fn(async (payload: Record<string, unknown>) => {
              inserts.push({ table, payload });
              return { error: null };
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const input: AgentChatInput = {
      message: 'Approve the deadline extension for UI Extension',
      mode: 'approval',
      decision: 'approve',
      suggestion: {
        title: 'Approve UI Extension extension',
        approval: {
          kind: 'deadline_extension.update' as never,
          title: 'Approve UI Extension extension',
          copy: 'Approve pending deadline extension for UI Extension.',
          draft: {
            extensionId: 'ext-1',
            taskName: 'UI Extension',
            action: 'approve',
          },
        },
      },
    };

    const response = await createAgentApp().request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      reply: 'Approved deadline extension for UI Extension; due date is now 2026-07-06.',
      provider: 'openai',
      model: 'eko-local-write',
      intent: 'executed',
      target: {
        kind: 'task',
        taskId: 'task-1',
        name: 'UI Extension',
        action: 'dueDate',
      },
    });
    expect(updates).toContainEqual({
      table: 'deadline_extensions',
      payload: {
        status: 'approved',
        decided_by: 'user-1',
        decided_at: expect.any(String),
      },
    });
    expect(updates).toContainEqual({
      table: 'tasks',
      payload: {
        deadline: '2026-07-06',
      },
    });
    expect(inserts).toContainEqual({
      table: 'activity_log',
      payload: {
        user_id: 'user-1',
        action: 'Approved extension',
        target: 'task: UI Extension',
        task_id: 'task-1',
        source: 'eko',
      },
    });
    expect(inserts).toContainEqual({
      table: 'notifications',
      payload: {
        user_id: 'mel-1',
        kind: 'deadline_extension_approved',
        title: 'Extension approved on "UI Extension"',
        body: null,
        link: '/tasks?task=task-1',
        read: false,
      },
    });
  });

  it('denies one pending deadline extension without changing the task deadline', async () => {
    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
    mocks.loadTasksBoard.mockResolvedValue({
      projectMilestones: [],
      projectActivity: [],
      tasks: [],
      areas: [],
      team: [],
      account: { notifications: [], unreadCount: 0 },
    });
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'agent_chat_messages') {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            order: vi.fn(() => query),
            limit: vi.fn(async () => ({ data: [], error: null })),
            insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
              for (const row of rows) inserts.push({ table, payload: row });
              return { error: null };
            }),
          };
          return query;
        }

        if (table === 'profiles') {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            maybeSingle: vi.fn(async () => ({ data: { is_admin: true }, error: null })),
          };
          return query;
        }

        if (table === 'deadline_extensions') {
          const extensionRows = [
            {
              id: 'ext-1',
              task_id: 'task-1',
              requested_by: 'mel-1',
              extra_hours: 48,
              original_deadline: '2026-07-04',
              new_deadline: '2026-07-06',
              status: 'pending',
              task: { name: 'UI Extension' },
            },
          ];
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            update: vi.fn((payload: Record<string, unknown>) => {
              updates.push({ table, payload });
              return query;
            }),
            then: (resolve: (value: { data: typeof extensionRows; error: null }) => void) => resolve({ data: extensionRows, error: null }),
          };
          return query;
        }

        if (table === 'activity_log' || table === 'notifications') {
          return {
            insert: vi.fn(async (payload: Record<string, unknown>) => {
              inserts.push({ table, payload });
              return { error: null };
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const input: AgentChatInput = {
      message: 'Deny UI Extension deadline extension because scope needs review',
      mode: 'approval',
      decision: 'approve',
      suggestion: {
        title: 'Deny UI Extension extension',
        approval: {
          kind: 'deadline_extension.update' as never,
          title: 'Deny UI Extension extension',
          copy: 'Deny pending deadline extension for UI Extension.',
          draft: {
            extensionId: 'ext-1',
            taskName: 'UI Extension',
            action: 'deny',
            reason: 'scope needs review',
          },
        },
      },
    };

    const response = await createAgentApp().request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      reply: 'Denied deadline extension for UI Extension.',
      provider: 'openai',
      model: 'eko-local-write',
      intent: 'executed',
    });
    expect(updates).toContainEqual({
      table: 'deadline_extensions',
      payload: {
        status: 'denied',
        decided_by: 'user-1',
        decided_at: expect.any(String),
        denial_reason: 'scope needs review',
      },
    });
    expect(updates.some((entry) => entry.table === 'tasks')).toBe(false);
    expect(inserts).toContainEqual({
      table: 'notifications',
      payload: {
        user_id: 'mel-1',
        kind: 'deadline_extension_denied',
        title: 'Extension denied on "UI Extension"',
        body: 'scope needs review',
        link: '/tasks?task=task-1',
        read: false,
      },
    });
  });
});
