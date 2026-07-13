import { afterEach, describe, expect, it, vi } from 'vitest';

// In-memory fake of the service client's fluent query builder, scoped to the
// eko_pending_actions single-row operations this module performs.
type Row = Record<string, unknown>;
function makeFakeService(seed: Row[] = []) {
  const rows = [...seed];
  return {
    rows,
    from(_table: string) {
      const state: { filters: Array<[string, unknown]> } = { filters: [] };
      const builder: Record<string, unknown> = {
        insert(payload: Row) {
          const created = { id: `pa-${rows.length + 1}`, error: null, executed_at: null, ...payload };
          rows.push(created);
          return {
            select() {
              return { single: async () => ({ data: { id: created.id }, error: null }) };
            },
          };
        },
        update(patch: Row) {
          return {
            eq(col: string, val: unknown) {
              const target = rows.find((r) => r[col] === val);
              if (target) Object.assign(target, patch);
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          state.filters.push([col, val]);
          return builder;
        },
        order() {
          return builder;
        },
        maybeSingle: async () => {
          const match = rows.find((r) => state.filters.every(([c, v]) => r[c] === v));
          return { data: match ?? null, error: null };
        },
        then(resolve: (v: { data: Row[]; error: null }) => unknown) {
          const matches = rows.filter((r) => state.filters.every(([c, v]) => r[c] === v));
          return Promise.resolve({ data: matches, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
}

const fake = makeFakeService();
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => fake,
  getServiceClientAs: () => fake,
}));

import {
  stagePendingAction,
  getPendingActionById,
  markExecuting,
  markExecuted,
  markFailed,
  isExecutable,
  listExecutedByConversation,
} from '../pending-actions';

afterEach(() => {
  fake.rows.length = 0;
});

describe('pending-actions lifecycle', () => {
  it('stages a row and reads it back by id', async () => {
    const id = await stagePendingAction({
      conversationId: 'c1',
      userId: 'u1',
      toolId: 'set_milestone_health',
      resolvedArgs: { milestoneId: 'm1', health: 'off_track' },
      summary: 'Set Alpha health to off_track',
    });
    const row = await getPendingActionById(id);
    expect(row).toMatchObject({
      id,
      tool_id: 'set_milestone_health',
      status: 'awaiting_approval',
      resolved_args: { milestoneId: 'm1', health: 'off_track' },
    });
  });

  it('transitions awaiting → executing → executed', async () => {
    const id = await stagePendingAction({
      conversationId: 'c1', userId: 'u1', toolId: 't', resolvedArgs: {}, summary: 's',
    });
    await markExecuting(id);
    expect((await getPendingActionById(id))?.status).toBe('executing');
    await markExecuted(id);
    expect((await getPendingActionById(id))?.status).toBe('executed');
  });

  it('records a failure with its error text', async () => {
    const id = await stagePendingAction({
      conversationId: 'c1', userId: 'u1', toolId: 't', resolvedArgs: {}, summary: 's',
    });
    await markFailed(id, 'row gone');
    const row = await getPendingActionById(id);
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('row gone');
  });

  it('isExecutable is true only for awaiting_approval', () => {
    expect(isExecutable('awaiting_approval')).toBe(true);
    expect(isExecutable('executed')).toBe(false);
    expect(isExecutable('rejected')).toBe(false);
    expect(isExecutable('failed')).toBe(false);
    expect(isExecutable('executing')).toBe(false);
  });
});

describe('listExecutedByConversation', () => {
  it('returns only executed rows for the conversation, excluding awaiting and other conversations', async () => {
    fake.rows.push(
      {
        id: 'x1', conversation_id: 'c1', status: 'executed', summary: 'Set milestone "ALPHA" health to off_track',
        tool_id: 'set_milestone_health', resolved_args: {}, user_id: 'u1', created_at: 'x', executed_at: '2026-07-07T21:49:35Z', error: null,
      },
      {
        id: 'x2', conversation_id: 'c1', status: 'awaiting_approval', summary: 'still pending',
        tool_id: 'set_milestone_health', resolved_args: {}, user_id: 'u1', created_at: 'x', executed_at: null, error: null,
      },
      {
        id: 'x3', conversation_id: 'c2', status: 'executed', summary: 'other conversation',
        tool_id: 'set_milestone_health', resolved_args: {}, user_id: 'u1', created_at: 'x', executed_at: '2026-07-07T20:00:00Z', error: null,
      },
      {
        id: 'x4', conversation_id: 'c1', status: 'executed', summary: 'Set milestone "BETA" health to at_risk',
        tool_id: 'set_milestone_health', resolved_args: {}, user_id: 'u1', created_at: 'x', executed_at: '2026-07-07T21:49:36Z', error: null,
      },
    );
    const rows = await listExecutedByConversation('c1');
    const summaries = rows.map((r) => r.summary);
    expect(summaries).toHaveLength(2);
    expect(summaries).toContain('Set milestone "ALPHA" health to off_track');
    expect(summaries).toContain('Set milestone "BETA" health to at_risk');
    expect(summaries).not.toContain('still pending');
    expect(summaries).not.toContain('other conversation');
  });
});
