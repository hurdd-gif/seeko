import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentRoutes, planLocalAreaWrite, type AgentChatInput } from '../agent';

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
  'Areas: Main Game (Active, Alpha, 40%); Fighting Club (Planned, Beta, 0%).',
  'Milestones: ALPHA (on_track, due 2026-08-01).',
].join('\n');

function createAgentApp() {
  return new Hono().route('/api', createAgentRoutes({
    authResolver: async () => authUser,
    contextLoader: async () => dashboardContext,
  }));
}

describe('EKO area actions', () => {
  beforeEach(() => {
    mocks.getServiceClient.mockReset();
    mocks.loadTasksBoard.mockReset();
  });

  it('prepares an area progress update as a gated dashboard write', () => {
    expect(planLocalAreaWrite({ message: 'Set Main Game progress to 75%' }, dashboardContext)).toEqual({
      reply: 'Ready for approval: update Main Game progress to 75%.',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'area.update',
        title: 'Update Main Game',
        copy: 'Update area Main Game: progress 75%.',
        draft: {
          areaName: 'Main Game',
          progress: '75',
        },
      },
    });
  });

  it('asks which area to update when the target is missing', () => {
    expect(planLocalAreaWrite({ message: 'Set progress to 75%' }, dashboardContext)).toEqual({
      reply: 'Which area should EKO update?',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'clarification',
    });
  });

  it('updates an area only after approval and records it as an EKO write', async () => {
    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
    mocks.loadTasksBoard.mockResolvedValue({
      areas: [
        { id: 'area-1', name: 'Main Game', status: 'Active', phase: 'Alpha', progress: 40 },
      ],
      tasks: [],
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

        if (table === 'areas') {
          const query = {
            update: vi.fn((payload: Record<string, unknown>) => {
              updates.push({ table, payload });
              return query;
            }),
            eq: vi.fn(() => query),
            select: vi.fn(() => query),
            single: vi.fn(async () => ({ data: { id: 'area-1', name: 'Main Game', progress: 75 }, error: null })),
          };
          return query;
        }

        if (table === 'activity_log') {
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
      message: 'Set Main Game progress to 75%',
      mode: 'approval',
      decision: 'approve',
      suggestion: {
        title: 'Update Main Game',
        approval: {
          kind: 'area.update' as never,
          title: 'Update Main Game',
          copy: 'Update area Main Game: progress 75%.',
          draft: {
            areaName: 'Main Game',
            progress: '75',
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
      reply: 'Updated area "Main Game": progress 75%.',
      provider: 'openai',
      model: 'eko-local-write',
      intent: 'executed',
    });
    expect(updates).toContainEqual({
      table: 'areas',
      payload: {
        progress: 75,
      },
    });
    expect(inserts).toContainEqual({
      table: 'activity_log',
      payload: {
        user_id: 'user-1',
        action: 'Updated area',
        target: 'area: Main Game → progress 75%',
        source: 'eko',
      },
    });
  });
});
