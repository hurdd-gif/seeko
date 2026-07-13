import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The migrated header renders the live realtime <NotificationBell> instead of the
 * static Inbox glyph ONLY when `account.userId` is present. Both Paper loaders —
 * loadTasksBoard (the /tasks board) and loadShellContext (Docs/Activity/Progress)
 * — must therefore carry the signed-in user's id into the account cluster.
 *
 * A tiny chainable stub stands in for the service client: every builder method
 * returns the builder, the builder is awaitable, and `.maybeSingle()` resolves.
 * Tables queried more than once (profiles → profile+team, notifications →
 * list+count) drain a per-table queue in call order.
 */

let service: { from: (table: string) => unknown };
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => service,
  getServiceClientAs: () => service,
}));

import { loadTasksBoard } from '@/lib/tasks-board';
import { loadActivityView } from '@/lib/dashboard-views';

const PROFILE = {
  id: 'user-1',
  display_name: 'Ada Lovelace',
  department: 'Coding',
  avatar_url: null,
  is_admin: true,
  is_investor: false,
};

function makeService(queues: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const queue = queues[table];
      const result = queue && queue.length ? queue.shift() : { data: [], error: null };
      const builder: unknown = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result);
            if (typeof prop === 'symbol') return undefined;
            if (prop === 'maybeSingle' || prop === 'single') {
              return () => Promise.resolve(result);
            }
            return () => builder;
          },
        },
      );
      return builder;
    },
  };
}

const ok = (data: unknown) => ({ data, error: null });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('account.userId is carried into the Paper header cluster', () => {
  it('loadTasksBoard puts the signed-in user id on account (drives the live bell)', async () => {
    service = makeService({
      profiles: [ok(PROFILE), ok([])], // profile, then team roster
      tasks: [ok([])],
      areas: [ok([])],
      milestones: [ok([])],
      activity_log: [ok([])],
      notifications: [ok([]), { count: 0, error: null }], // recent list, unread count
    });

    const data = await loadTasksBoard({ id: 'user-1', email: 'ada@seeko.studio' });

    expect(data.account.userId).toBe('user-1');
  });

  it('loadShellContext (via loadActivityView) puts the user id on account too', async () => {
    service = makeService({
      profiles: [ok(PROFILE), ok([])], // profile, then team roster
      areas: [ok([])],
      notifications: [ok([]), { count: 0, error: null }], // recent list, unread count
      activity_log: [ok([])],
    });

    const data = await loadActivityView({ id: 'user-1', email: 'ada@seeko.studio' });

    expect(data.account.userId).toBe('user-1');
  });
});
