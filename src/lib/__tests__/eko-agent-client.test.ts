import { describe, expect, it } from 'vitest';
import { newConversationId, firstPendingAction, executedTarget } from '../eko-agent-client';

describe('newConversationId', () => {
  it('returns a non-empty unique-ish string', () => {
    const a = newConversationId();
    const b = newConversationId();
    expect(a).toBeTruthy();
    expect(typeof a).toBe('string');
    expect(a).not.toBe(b);
  });
});

describe('firstPendingAction', () => {
  it('returns the first staged action or null', () => {
    expect(firstPendingAction({ reply: 'x', pendingActions: [{ id: 'pa-1', toolId: 't', summary: 's' }] }))
      .toEqual({ id: 'pa-1', toolId: 't', summary: 's' });
    expect(firstPendingAction({ reply: 'x' })).toBeNull();
    expect(firstPendingAction({ reply: 'x', pendingActions: [] })).toBeNull();
  });
});

describe('executedTarget', () => {
  it('returns the first executed target with a target, else null', () => {
    expect(executedTarget({
      reply: 'x',
      executed: [{ pendingActionId: 'pa-1', ok: true, reply: 'done', target: { kind: 'task', taskId: 't1', name: 'A', action: 'status' } }],
    })).toMatchObject({ taskId: 't1' });
    expect(executedTarget({ reply: 'x', executed: [{ pendingActionId: 'pa-1', ok: true, reply: 'done' }] })).toBeNull();
    expect(executedTarget({ reply: 'x' })).toBeNull();
  });
});
