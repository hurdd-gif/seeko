import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentRoutes, planLocalMilestoneWrite, type AgentChatInput } from '../agent';

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
  'Areas: Main Game (Active, Alpha, 40%).',
  'Milestones: Vertical Slice (at_risk, due 2026-08-01); Beta Cut (on_track, due 2026-09-15).',
].join('\n');

function createAgentApp() {
  return new Hono().route('/api', createAgentRoutes({
    authResolver: async () => authUser,
    contextLoader: async () => dashboardContext,
  }));
}

describe('EKO milestone actions', () => {
  beforeEach(() => {
    mocks.getServiceClient.mockReset();
    mocks.loadTasksBoard.mockReset();
  });

  it('prepares a milestone health update as a gated dashboard write', () => {
    expect(planLocalMilestoneWrite({ message: 'Mark Vertical Slice off track' }, dashboardContext)).toEqual({
      reply: 'Ready for approval: update Vertical Slice health to off track.',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'milestone.update',
        title: 'Update Vertical Slice',
        copy: 'Update milestone Vertical Slice: health off_track.',
        draft: {
          milestoneName: 'Vertical Slice',
          health: 'off_track',
        },
      },
    });
  });

  it('prepares a milestone target date update as a gated dashboard write', () => {
    expect(planLocalMilestoneWrite({ message: 'Set Beta Cut due 2026-10-01' }, dashboardContext)).toMatchObject({
      reply: 'Ready for approval: update Beta Cut due date to 2026-10-01.',
      intent: 'approval_required',
      approval: {
        kind: 'milestone.update',
        title: 'Update Beta Cut',
        copy: 'Update milestone Beta Cut: due 2026-10-01.',
        draft: {
          milestoneName: 'Beta Cut',
          targetDate: '2026-10-01',
        },
      },
    });
  });

  it('asks which milestone to update when the target is missing', () => {
    expect(planLocalMilestoneWrite({ message: 'Mark the milestone at risk' }, dashboardContext)).toEqual({
      reply: 'Which milestone should EKO update?',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'clarification',
    });
  });

  it('updates a milestone only after approval and records it as an EKO write', async () => {
    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
    mocks.loadTasksBoard.mockResolvedValue({
      projectMilestones: [
        { id: 'milestone-1', name: 'Vertical Slice', health: 'at_risk', target_date: '2026-08-01', sort_order: 0, created_at: '2026-06-01' },
      ],
      tasks: [],
      areas: [],
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

        if (table === 'milestones') {
          const query = {
            update: vi.fn((payload: Record<string, unknown>) => {
              updates.push({ table, payload });
              return query;
            }),
            eq: vi.fn(() => query),
            select: vi.fn(() => query),
            single: vi.fn(async () => ({ data: { id: 'milestone-1', name: 'Vertical Slice', health: 'off_track' }, error: null })),
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
      message: 'Mark Vertical Slice off track',
      mode: 'approval',
      decision: 'approve',
      suggestion: {
        title: 'Update Vertical Slice',
        approval: {
          kind: 'milestone.update' as never,
          title: 'Update Vertical Slice',
          copy: 'Update milestone Vertical Slice: health off_track.',
          draft: {
            milestoneName: 'Vertical Slice',
            health: 'off_track',
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
      reply: 'Updated milestone "Vertical Slice": health off_track.',
      provider: 'openai',
      model: 'eko-local-write',
      intent: 'executed',
    });
    expect(updates).toContainEqual({
      table: 'milestones',
      payload: {
        health: 'off_track',
      },
    });
    expect(inserts).toContainEqual({
      table: 'activity_log',
      payload: {
        user_id: 'user-1',
        action: 'Updated milestone',
        target: 'milestone: Vertical Slice → health off_track',
        source: 'eko',
      },
    });
  });
});
