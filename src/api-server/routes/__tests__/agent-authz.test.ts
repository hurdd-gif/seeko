import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentChatResult } from '../agent';

// The route's DEFAULT admin gate is `assertAdmin` from agent/eko-activity.
// Mock that module so the tests below exercise the real default wiring (no
// `adminCheck` injected) rather than a hand-rolled test double — this is what
// proves the surface is admin-only "secure by default". `adminOk` flips the
// gate; a denied gate throws AgentActionError(403), which the route's catch
// block maps to a 403 response. Same stubbing seam as agent-executor.test.ts.
let adminOk = true;
vi.mock('../../agent/eko-activity', async (orig) => {
  const actual = await orig<typeof import('../../agent/eko-activity')>();
  const { AgentActionError } = await import('../../agent/errors');
  return {
    ...actual,
    assertAdmin: vi.fn(async (_userId: string) => {
      if (!adminOk) throw new AgentActionError('Only admins can approve EKO writes.', 403);
    }),
  };
});

import { createAgentRoutes } from '../agent';
import { assertAdmin } from '../../agent/eko-activity';
import { AgentActionError } from '../../agent/errors';

const USER = { id: 'user-1', email: 'member@example.invalid' };

function post(body: unknown) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

const CHAT = { message: 'Summarize tasks', mode: 'chat' } as const;
const APPROVE = { mode: 'approval', decision: 'approve', pendingActionIds: ['pa-1'] } as const;
const REJECT = { mode: 'approval', decision: 'reject', pendingActionIds: ['pa-1'] } as const;

afterEach(() => {
  adminOk = true;
  vi.mocked(assertAdmin).mockClear();
});

describe('agent chat admin gate (default adminCheck = assertAdmin)', () => {
  // A runner that would answer 200 if the gate ever let a non-admin through.
  const passthroughRunner = () =>
    vi.fn(
      async (input): Promise<AgentChatResult> => ({
        reply: `ran ${input.mode ?? 'chat'}`,
        provider: 'anthropic',
        model: 'test-model',
      }),
    );

  it('403s a non-admin in CHAT mode before the model/runner ever runs', async () => {
    adminOk = false;
    const runner = passthroughRunner();
    const app = createAgentRoutes({ authResolver: async () => USER, agentRunner: runner });

    const res = await app.request('/agent/chat', post(CHAT));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Only admins can approve EKO writes.' });
    expect(runner).not.toHaveBeenCalled();
    expect(vi.mocked(assertAdmin)).toHaveBeenCalledWith(USER.id);
  });

  it('403s a non-admin on approval APPROVE before staging/committing any write', async () => {
    adminOk = false;
    const runner = passthroughRunner();
    const app = createAgentRoutes({ authResolver: async () => USER, agentRunner: runner });

    const res = await app.request('/agent/chat', post(APPROVE));

    expect(res.status).toBe(403);
    expect(runner).not.toHaveBeenCalled();
  });

  it('403s a non-admin on approval REJECT (cannot cancel a stranger’s pending action)', async () => {
    adminOk = false;
    const runner = passthroughRunner();
    const app = createAgentRoutes({ authResolver: async () => USER, agentRunner: runner });

    const res = await app.request('/agent/chat', post(REJECT));

    expect(res.status).toBe(403);
    expect(runner).not.toHaveBeenCalled();
  });

  it('lets an ADMIN reach the runner for chat, approve, and reject alike', async () => {
    adminOk = true;
    const runner = passthroughRunner();
    const app = createAgentRoutes({ authResolver: async () => USER, agentRunner: runner });

    for (const body of [CHAT, APPROVE, REJECT]) {
      const res = await app.request('/agent/chat', post(body));
      expect(res.status).toBe(200);
    }
    expect(runner).toHaveBeenCalledTimes(3);
    expect(vi.mocked(assertAdmin)).toHaveBeenCalledTimes(3);
  });

  it('still 401s an unauthenticated caller before the admin gate is consulted', async () => {
    adminOk = false;
    const app = createAgentRoutes({ authResolver: async () => null });

    const res = await app.request('/agent/chat', post(CHAT));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(vi.mocked(assertAdmin)).not.toHaveBeenCalled();
  });

  it('honors an injected adminCheck override without falling back to assertAdmin', async () => {
    const adminCheck = vi.fn(async () => {
      throw new AgentActionError('nope', 403);
    });
    const runner = passthroughRunner();
    const app = createAgentRoutes({ authResolver: async () => USER, adminCheck, agentRunner: runner });

    const res = await app.request('/agent/chat', post(CHAT));

    expect(res.status).toBe(403);
    expect(adminCheck).toHaveBeenCalledWith(USER.id);
    expect(runner).not.toHaveBeenCalled();
    // The injected override fully replaces the default — the real assertAdmin is untouched.
    expect(vi.mocked(assertAdmin)).not.toHaveBeenCalled();
  });
});
