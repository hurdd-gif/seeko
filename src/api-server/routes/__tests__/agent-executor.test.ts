import { afterEach, describe, expect, it, vi } from 'vitest';

const rows = new Map<string, Record<string, unknown>>();
vi.mock('../../agent/pending-actions', () => ({
  isExecutable: (status: string) => status === 'awaiting_approval',
  getPendingActionById: async (id: string) => rows.get(id) ?? null,
  markExecuting: async (id: string) => { const r = rows.get(id); if (r) r.status = 'executing'; },
  markExecuted: async (id: string) => { const r = rows.get(id); if (r) r.status = 'executed'; },
  markFailed: async (id: string, error: string) => { const r = rows.get(id); if (r) { r.status = 'failed'; r.error = error; } },
  markRejected: async (id: string) => { const r = rows.get(id); if (r) r.status = 'rejected'; },
}));

let adminOk = true;
vi.mock('../../agent/eko-activity', async (orig) => {
  const actual = await orig<typeof import('../../agent/eko-activity')>();
  return { ...actual, assertAdmin: async () => { if (!adminOk) throw new Error('Only admins can approve EKO writes.'); } };
});

// Stub the committed tool so no Supabase call happens.
vi.mock('../../agent/tool-registry', () => ({
  getToolById: (id: string) =>
    id === 'set_milestone_health'
      ? { id, gated: true, commit: async (args: Record<string, unknown>) => ({ reply: `Set milestone "${args.milestoneName}" health to ${args.health}.` }) }
      : undefined,
  AGENT_TOOLS: [],
}));

import { executeById } from '../agent';

afterEach(() => { rows.clear(); adminOk = true; });

describe('executeById', () => {
  it('commits an awaiting action and marks it executed', async () => {
    rows.set('pa-1', { id: 'pa-1', tool_id: 'set_milestone_health', status: 'awaiting_approval', resolved_args: { milestoneName: 'Alpha', health: 'off_track' } });
    const result = await executeById('pa-1', { id: 'u1', email: 'a@b.invalid' });
    expect(result).toMatchObject({ pendingActionId: 'pa-1', ok: true, reply: 'Set milestone "Alpha" health to off_track.' });
    expect(rows.get('pa-1')?.status).toBe('executed');
  });

  it('is idempotent — re-approving an executed action is a no-op', async () => {
    rows.set('pa-1', { id: 'pa-1', tool_id: 'set_milestone_health', status: 'executed', resolved_args: {} });
    const result = await executeById('pa-1', { id: 'u1', email: 'a@b.invalid' });
    expect(result.ok).toBe(false);
    expect(result.reply).toMatch(/already/i);
  });

  it('refuses when the user is not an admin', async () => {
    adminOk = false;
    rows.set('pa-1', { id: 'pa-1', tool_id: 'set_milestone_health', status: 'awaiting_approval', resolved_args: {} });
    await expect(executeById('pa-1', { id: 'u1', email: 'a@b.invalid' })).rejects.toThrow(/admins/i);
    expect(rows.get('pa-1')?.status).not.toBe('executed');
  });
});
