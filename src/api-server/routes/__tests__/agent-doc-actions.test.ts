import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentRoutes, planLocalDocumentWrite, type AgentChatInput } from '../agent';

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
      'Docs context: 1 docs, 1 decks, 0 locked.',
      'Accessible docs: Engineering Notes; Investor Deck (deck).',
    ].join('\n'),
  }));
}

describe('EKO document actions', () => {
  beforeEach(() => {
    mocks.getServiceClient.mockReset();
  });

  it('prepares document creation as a gated dashboard write', () => {
    const result = planLocalDocumentWrite({ message: 'Create a doc called Launch Notes' });

    expect(result).toEqual({
      reply: 'Ready for approval: create document Launch Notes.',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'doc.create',
        title: 'Create Launch Notes',
        copy: 'Create document Launch Notes.',
        draft: {
          title: 'Launch Notes',
          docType: 'doc',
        },
      },
    });
  });

  it('prepares deck creation from natural suffix phrasing', () => {
    expect(planLocalDocumentWrite({ message: 'Create investor update deck' })).toMatchObject({
      reply: 'Ready for approval: create deck Investor Update.',
      intent: 'approval_required',
      approval: {
        kind: 'doc.create',
        title: 'Create Investor Update',
        draft: {
          title: 'Investor Update',
          docType: 'deck',
        },
      },
    });
  });

  it('asks for a title before opening a document approval', () => {
    expect(planLocalDocumentWrite({ message: 'Create a document' })).toEqual({
      reply: 'What should EKO call the document?',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'clarification',
    });
  });

  it('prepares an existing document update as a gated dashboard write', () => {
    expect(planLocalDocumentWrite({ message: 'Update the Launch Notes document to say Release ships Friday.' })).toMatchObject({
      reply: 'Ready for approval: update document Launch Notes.',
      intent: 'approval_required',
      approval: {
        kind: 'doc.update',
        title: 'Update Launch Notes',
        copy: 'Replace the content in document Launch Notes.',
        draft: {
          docTitle: 'Launch Notes',
          content: 'Release ships Friday.',
        },
      },
    });
  });

  it('asks for content before opening a document update approval', () => {
    expect(planLocalDocumentWrite({ message: 'Update the Launch Notes document' })).toEqual({
      reply: 'What should EKO write in Launch Notes?',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'clarification',
    });
  });

  it('creates a document only after approval and records it as an EKO write', async () => {
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

        if (table === 'docs') {
          const query = {
            insert: vi.fn((payload: Record<string, unknown>) => {
              inserts.push({ table, payload });
              return query;
            }),
            select: vi.fn(() => query),
            single: vi.fn(async () => ({ data: { id: 'doc-1', title: 'Launch Notes', type: 'doc' }, error: null })),
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
      message: 'Create document Launch Notes',
      mode: 'approval',
      decision: 'approve',
      suggestion: {
        title: 'Create Launch Notes',
        approval: {
          kind: 'doc.create',
          title: 'Create Launch Notes',
          copy: 'Create document Launch Notes.',
          draft: {
            title: 'Launch Notes',
            docType: 'doc',
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
      reply: 'Created document "Launch Notes".',
      provider: 'openai',
      model: 'eko-local-write',
      intent: 'executed',
    });
    expect(inserts).toContainEqual({
      table: 'docs',
      payload: {
        title: 'Launch Notes',
        content: '',
        sort_order: 0,
        restricted_department: null,
        granted_user_ids: null,
      },
    });
    expect(inserts).toContainEqual({
      table: 'activity_log',
      payload: {
        user_id: 'user-1',
        action: 'Created',
        target: 'doc: Launch Notes',
        doc_id: 'doc-1',
        source: 'eko',
      },
    });
  });

  it('updates an existing document only after approval and records it as an EKO write', async () => {
    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
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

        if (table === 'docs') {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            update: vi.fn((payload: Record<string, unknown>) => {
              updates.push({ table, payload });
              return query;
            }),
            single: vi.fn(async () => ({ data: { id: 'doc-1', title: 'Launch Notes', type: 'doc' }, error: null })),
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
      message: 'Update the Launch Notes document to say Release ships Friday.',
      mode: 'approval',
      decision: 'approve',
      suggestion: {
        title: 'Update Launch Notes',
        approval: {
          kind: 'doc.update',
          title: 'Update Launch Notes',
          copy: 'Replace the content in document Launch Notes.',
          draft: {
            docTitle: 'Launch Notes',
            content: 'Release ships Friday.',
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
      reply: 'Updated document "Launch Notes".',
      provider: 'openai',
      model: 'eko-local-write',
      intent: 'executed',
    });
    expect(updates).toContainEqual({
      table: 'docs',
      payload: {
        content: '<p>Release ships Friday.</p>',
        updated_at: expect.any(String),
      },
    });
    expect(inserts).toContainEqual({
      table: 'activity_log',
      payload: {
        user_id: 'user-1',
        action: 'Updated',
        target: 'doc: Launch Notes',
        doc_id: 'doc-1',
        source: 'eko',
      },
    });
  });

  it('prepares document deletion as a gated dashboard write', () => {
    expect(planLocalDocumentWrite({ message: 'Delete document Launch Notes' })).toEqual({
      reply: 'Ready for approval: delete document Launch Notes.',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'doc.delete',
        title: 'Delete Launch Notes',
        copy: 'Delete document Launch Notes from Docs. This cannot be undone.',
        draft: {
          docTitle: 'Launch Notes',
        },
      },
    });
  });

  it('asks which document to delete before opening a delete approval', () => {
    expect(planLocalDocumentWrite({ message: 'Delete a document' })).toEqual({
      reply: 'Which document should EKO delete?',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'clarification',
    });
  });

  it('deletes an existing document only after approval and records it as an EKO write', async () => {
    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    const deletedIds: string[] = [];
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

        if (table === 'docs') {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn((column: string, value: string) => {
              if (column === 'id') deletedIds.push(value);
              return query;
            }),
            limit: vi.fn(async () => ({ data: [{ id: 'doc-1', title: 'Launch Notes', type: 'doc' }], error: null })),
            delete: vi.fn(() => query),
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
      message: 'Delete document Launch Notes',
      mode: 'approval',
      decision: 'approve',
      suggestion: {
        title: 'Delete Launch Notes',
        approval: {
          kind: 'doc.delete' as never,
          title: 'Delete Launch Notes',
          copy: 'Delete document Launch Notes from Docs. This cannot be undone.',
          draft: {
            docTitle: 'Launch Notes',
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
      reply: 'Deleted document "Launch Notes".',
      provider: 'openai',
      model: 'eko-local-write',
      intent: 'executed',
    });
    expect(deletedIds).toEqual(['doc-1']);
    expect(inserts).toContainEqual({
      table: 'activity_log',
      payload: {
        user_id: 'user-1',
        action: 'Deleted',
        target: 'doc: Launch Notes',
        source: 'eko',
      },
    });
  });
});
