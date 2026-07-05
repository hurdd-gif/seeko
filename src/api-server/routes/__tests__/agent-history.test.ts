import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentRoutes, type AgentChatInput } from '../agent';

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
}));

const authUser = { id: 'user-1', email: 'member@example.invalid' };

function createAgentApp(agentRunner?: (input: AgentChatInput) => Promise<{
  reply: string;
  provider: 'openai';
  model: string;
}>) {
  return new Hono().route('/api', createAgentRoutes({
    authResolver: async () => authUser,
    agentRunner: agentRunner
      ? async (input) => agentRunner(input)
      : undefined,
  }));
}

describe('EKO agent history', () => {
  let insertedRows: Array<Record<string, unknown>>;
  const storedHistory = [
    { role: 'user', text: 'What is the most recent task?', created_at: '2026-07-04T12:00:00.000Z' },
    { role: 'eko', text: 'The most recent task is UI Extension.', created_at: '2026-07-04T12:00:01.000Z' },
  ];

  beforeEach(() => {
    insertedRows = [];
    mocks.getServiceClient.mockReset();
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table !== 'agent_chat_messages') throw new Error(`Unexpected table ${table}`);

        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(async () => ({ data: storedHistory, error: null })),
          insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
            insertedRows.push(...rows);
            return { error: null };
          }),
        };

        return query;
      }),
    });
  });

  it('loads persisted EKO chat history for the authenticated user', async () => {
    const response = await createAgentApp().request('/api/agent/history');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      history: [
        { role: 'user', text: 'What is the most recent task?' },
        { role: 'eko', text: 'The most recent task is UI Extension.' },
      ],
    });
  });

  it('hydrates the next EKO request with server history and persists the exchange', async () => {
    let observedInput: AgentChatInput | null = null;
    const app = createAgentApp(async (input) => {
      observedInput = input;
      return {
        reply: 'UI Extension has no due date set. Would you like to add one?',
        provider: 'openai',
        model: 'test-agent',
      };
    });

    const response = await app.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'When is it due?',
        clientContext: {
          path: '/issues',
          title: 'Issues',
          recentHistory: [{ role: 'user', text: 'Client-only fallback' }],
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(observedInput?.clientContext?.recentHistory).toEqual([
      { role: 'user', text: 'What is the most recent task?' },
      { role: 'eko', text: 'The most recent task is UI Extension.' },
      { role: 'user', text: 'Client-only fallback' },
    ]);
    expect(insertedRows).toEqual([
      {
        user_id: 'user-1',
        role: 'user',
        text: 'When is it due?',
        metadata: { path: '/issues', title: 'Issues' },
      },
      {
        user_id: 'user-1',
        role: 'eko',
        text: 'UI Extension has no due date set. Would you like to add one?',
        metadata: { intent: undefined, provider: 'openai', model: 'test-agent' },
      },
    ]);
  });
});
