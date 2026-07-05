import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentRoutes, planLocalNoteWrite, type AgentChatInput } from '../agent';

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
}));

const authUser = { id: 'user-1', email: 'admin@example.invalid' };

function createAgentApp() {
  return new Hono().route('/api', createAgentRoutes({
    authResolver: async () => authUser,
    contextLoader: async () => [
      'Notes inbox: 2 open. Newest: "Follow up on contractor invoice" (web, just now).',
      'EKO capabilities: note.create.',
    ].join('\n'),
  }));
}

describe('EKO note actions', () => {
  beforeEach(() => {
    mocks.getServiceClient.mockReset();
  });

  it('prepares note capture as a gated dashboard write', () => {
    expect(planLocalNoteWrite({ message: 'Add note: follow up with art team tomorrow' })).toEqual({
      reply: 'Ready for approval: add note to inbox.',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'note.create',
        title: 'Add note',
        copy: 'Add this note to the inbox: follow up with art team tomorrow',
        draft: {
          noteBody: 'follow up with art team tomorrow',
        },
      },
    });
  });

  it('asks for note text before opening a note approval', () => {
    expect(planLocalNoteWrite({ message: 'Add a note' })).toEqual({
      reply: 'What should EKO add to the notes inbox?',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'clarification',
    });
  });

  it('prepares note archiving as a gated dashboard write', () => {
    expect(planLocalNoteWrite({ message: 'Archive note: Follow up on contractor invoice' })).toEqual({
      reply: 'Ready for approval: archive note from inbox.',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'note.archive',
        title: 'Archive note',
        copy: 'Archive this note from the inbox: Follow up on contractor invoice',
        draft: {
          noteBody: 'Follow up on contractor invoice',
        },
      },
    });
  });

  it('asks which note to archive before opening an archive approval', () => {
    expect(planLocalNoteWrite({ message: 'Archive a note' })).toEqual({
      reply: 'Which note should EKO archive?',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'clarification',
    });
  });

  it('captures a note only after approval', async () => {
    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
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

        if (table === 'notes') {
          const query = {
            insert: vi.fn((payload: Record<string, unknown>) => {
              inserts.push({ table, payload });
              return query;
            }),
            select: vi.fn(() => query),
            single: vi.fn(async () => ({
              data: {
                id: 'note-1',
                body: 'follow up with art team tomorrow',
                status: 'open',
                source: 'web',
              },
              error: null,
            })),
          };
          return query;
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const input: AgentChatInput = {
      message: 'Add note: follow up with art team tomorrow',
      mode: 'approval',
      decision: 'approve',
      suggestion: {
        title: 'Add note',
        approval: {
          kind: 'note.create',
          title: 'Add note',
          copy: 'Add this note to the inbox: follow up with art team tomorrow',
          draft: {
            noteBody: 'follow up with art team tomorrow',
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
      reply: 'Added note to inbox.',
      provider: 'openai',
      model: 'eko-local-write',
      intent: 'executed',
    });
    expect(inserts).toContainEqual({
      table: 'notes',
      payload: {
        body: 'follow up with art team tomorrow',
        source: 'web',
        created_by: 'user-1',
      },
    });
  });

  it('archives an open note only after approval', async () => {
    const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'agent_chat_messages') {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            order: vi.fn(() => query),
            limit: vi.fn(async () => ({ data: [], error: null })),
            insert: vi.fn(async () => ({ error: null })),
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

        if (table === 'notes') {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            order: vi.fn(() => query),
            limit: vi.fn(async () => ({
              data: [
                {
                  id: 'note-1',
                  body: 'Follow up on contractor invoice',
                  status: 'open',
                },
              ],
              error: null,
            })),
            update: vi.fn((payload: Record<string, unknown>) => {
              updates.push({ table, payload });
              return query;
            }),
          };
          return query;
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const input: AgentChatInput = {
      message: 'Archive note: Follow up on contractor invoice',
      mode: 'approval',
      decision: 'approve',
      suggestion: {
        title: 'Archive note',
        approval: {
          kind: 'note.archive',
          title: 'Archive note',
          copy: 'Archive this note from the inbox: Follow up on contractor invoice',
          draft: {
            noteBody: 'Follow up on contractor invoice',
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
      reply: 'Archived note from inbox.',
      provider: 'openai',
      model: 'eko-local-write',
      intent: 'executed',
    });
    expect(updates).toContainEqual({
      table: 'notes',
      payload: { status: 'archived' },
    });
  });
});
