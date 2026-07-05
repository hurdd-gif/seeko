import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentRoutes, planLocalPaymentWrite, type AgentChatInput } from '../agent';

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
  'Payments context: 1 people owed, 0 payments this month, pending total 450 USD, paid this month 0.',
  'Payment roster: Mel pending 450; Karti.',
  'Pending payment requests: none visible.',
].join('\n');

function createAgentApp() {
  return new Hono().route('/api', createAgentRoutes({
    authResolver: async () => authUser,
    contextLoader: async () => dashboardContext,
  }));
}

describe('EKO payment actions', () => {
  beforeEach(() => {
    mocks.getServiceClient.mockReset();
    mocks.loadTasksBoard.mockReset();
  });

  it('prepares marking a pending payment paid as a gated dashboard write', () => {
    expect(planLocalPaymentWrite({ message: 'Mark Mel payment paid' }, dashboardContext)).toEqual({
      reply: 'Ready for approval: mark Mel payment paid.',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'payment.update',
        title: 'Mark Mel payment paid',
        copy: 'Mark pending payment for Mel as paid.',
        draft: {
          recipientName: 'Mel',
          status: 'paid',
        },
      },
    });
  });

  it('prepares cancelling a pending payment as a gated dashboard write', () => {
    expect(planLocalPaymentWrite({ message: 'Cancel Mel payment' }, dashboardContext)).toMatchObject({
      reply: 'Ready for approval: mark Mel payment cancelled.',
      intent: 'approval_required',
      approval: {
        kind: 'payment.update',
        title: 'Mark Mel payment cancelled',
        copy: 'Mark pending payment for Mel as cancelled.',
        draft: {
          recipientName: 'Mel',
          status: 'cancelled',
        },
      },
    });
  });

  it('asks which pending payment to update when the target is missing', () => {
    expect(planLocalPaymentWrite({ message: 'Mark payment paid' }, dashboardContext)).toEqual({
      reply: 'Which pending payment should EKO mark paid?',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'clarification',
    });
  });

  it('marks a single pending payment paid only after approval and records it as an EKO write', async () => {
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

        if (table === 'payments') {
          const pendingRows = [
            {
              id: 'payment-1',
              status: 'pending',
              amount: 450,
              currency: 'USD',
              description: 'UI milestone payout',
              recipient_id: 'mel-1',
              recipient: { id: 'mel-1', display_name: 'Mel' },
            },
          ];
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            update: vi.fn((payload: Record<string, unknown>) => {
              updates.push({ table, payload });
              return query;
            }),
            single: vi.fn(async () => ({ data: { ...pendingRows[0], status: 'paid', paid_at: '2026-07-05T00:00:00.000Z' }, error: null })),
            then: (resolve: (value: { data: typeof pendingRows; error: null }) => void) => resolve({ data: pendingRows, error: null }),
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
      message: 'Mark Mel payment paid',
      mode: 'approval',
      decision: 'approve',
      suggestion: {
        title: 'Mark Mel payment paid',
        approval: {
          kind: 'payment.update' as never,
          title: 'Mark Mel payment paid',
          copy: 'Mark pending payment for Mel as paid.',
          draft: {
            recipientName: 'Mel',
            status: 'paid',
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
      reply: 'Marked payment for Mel as paid.',
      provider: 'openai',
      model: 'eko-local-write',
      intent: 'executed',
    });
    expect(updates).toContainEqual({
      table: 'payments',
      payload: expect.objectContaining({
        status: 'paid',
        paid_at: expect.any(String),
      }),
    });
    expect(inserts).toContainEqual({
      table: 'activity_log',
      payload: {
        user_id: 'user-1',
        action: 'Updated payment',
        target: 'payment: Mel -> paid 450 USD',
        source: 'eko',
      },
    });
  });
});
