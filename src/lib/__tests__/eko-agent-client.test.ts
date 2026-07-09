import { describe, expect, it } from 'vitest';
import { newConversationId, firstPendingAction, executedTarget, shouldOpenApprovalCard } from '../eko-agent-client';

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

describe('shouldOpenApprovalCard', () => {
  it('opens the card whenever the server staged one or more writes', () => {
    // The milestone scenario: two staged set_milestone_health writes → one card.
    expect(shouldOpenApprovalCard({
      reply: "…so I've staged both as at_risk for your approval.",
      pendingActions: [
        { id: 'pa-1', toolId: 'set_milestone_health', summary: 'Set milestone "ALPHA" health to at_risk' },
        { id: 'pa-2', toolId: 'set_milestone_health', summary: 'Set milestone "BETA" health to at_risk' },
      ],
    })).toBe(true);
    expect(shouldOpenApprovalCard({
      reply: 'Staged.',
      pendingActions: [{ id: 'pa-1', toolId: 'create_task', summary: 'Create task "Fix login"' }],
    })).toBe(true);
  });

  it('does not open the card for a plain answer with no staged writes', () => {
    // Read-only / clarification replies must NOT be gated on prose wording anymore.
    expect(shouldOpenApprovalCard({ reply: 'Both milestones are on track.' })).toBe(false);
    expect(shouldOpenApprovalCard({ reply: 'x', pendingActions: [] })).toBe(false);
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
