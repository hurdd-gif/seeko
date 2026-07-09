import { describe, expect, it, vi } from 'vitest';
import { subscribeToTable, type PostgresChangeSpec } from '@/lib/realtime';

function makeFakeClient(session: { access_token: string } | null) {
  const calls: string[] = [];
  const channel = {
    on: vi.fn(function (this: unknown) { calls.push('on'); return channel; }),
    subscribe: vi.fn(() => { calls.push('subscribe'); }),
  };
  const client = {
    channel: vi.fn(() => { calls.push('channel'); return channel; }),
    removeChannel: vi.fn((ch: unknown) => { calls.push('removeChannel'); return ch; }),
    realtime: { setAuth: vi.fn(() => { calls.push('setAuth'); }) },
    auth: { getSession: vi.fn(async () => ({ data: { session } })) },
  };
  return { client, channel, calls };
}

const spec: PostgresChangeSpec[] = [
  { event: '*', table: 'tasks', handler: () => {} },
];

describe('subscribeToTable', () => {
  it('attaches the session token BEFORE subscribing', async () => {
    const { client, calls } = makeFakeClient({ access_token: 'tok' });
    subscribeToTable(client, 'test-channel', spec);
    await vi.waitFor(() => expect(calls).toContain('subscribe'));
    expect(client.realtime.setAuth).toHaveBeenCalledWith('tok');
    expect(calls.indexOf('setAuth')).toBeLessThan(calls.indexOf('subscribe'));
  });

  it('still subscribes when there is no session (dev)', async () => {
    const { client, channel } = makeFakeClient(null);
    subscribeToTable(client, 'test-channel', spec);
    await vi.waitFor(() => expect(channel.subscribe).toHaveBeenCalled());
    expect(client.realtime.setAuth).not.toHaveBeenCalled();
  });

  it('registers one .on per spec with schema defaulted to public', async () => {
    const { client, channel } = makeFakeClient(null);
    subscribeToTable(client, 'c', [
      { event: 'INSERT', table: 'notifications', filter: 'user_id=eq.1', handler: () => {} },
      { event: 'UPDATE', table: 'notifications', filter: 'user_id=eq.1', handler: () => {} },
    ]);
    await vi.waitFor(() => expect(channel.subscribe).toHaveBeenCalled());
    expect(channel.on).toHaveBeenCalledTimes(2);
    expect(channel.on.mock.calls[0][1]).toMatchObject({ event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.1' });
  });

  it('dispose removes the channel and is idempotent; disposal before session resolution never subscribes', async () => {
    let resolveSession!: (v: { data: { session: null } }) => void;
    const pending = new Promise<{ data: { session: null } }>((r) => { resolveSession = r; });
    const { client, channel } = makeFakeClient(null);
    client.auth.getSession = vi.fn(() => pending) as never;
    const dispose = subscribeToTable(client, 'c', spec);
    dispose();
    dispose();
    resolveSession({ data: { session: null } });
    await Promise.resolve();
    expect(channel.subscribe).not.toHaveBeenCalled();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
  });
});
