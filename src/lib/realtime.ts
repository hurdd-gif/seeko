/**
 * The one seam for Supabase postgres_changes subscriptions.
 *
 * Invariant this module owns: the session token is attached to the realtime
 * socket BEFORE the channel subscribes — a channel that joins as anon is
 * silently filtered to zero rows by RLS. (Previously re-derived per call
 * site and lost in 2 of 3.)
 */

export type PostgresChangeSpec = {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  table: string;
  schema?: string;
  filter?: string;
  handler: (payload: { new: unknown; old: unknown; eventType: string }) => void;
};

type ChannelLike = {
  on(type: 'postgres_changes', filter: Record<string, unknown>, cb: (payload: never) => void): ChannelLike;
  subscribe(): unknown;
};

export type SupabaseLike = {
  channel(name: string): ChannelLike;
  removeChannel(channel: ChannelLike): unknown;
  realtime: { setAuth(token: string): void };
  auth: { getSession(): Promise<{ data: { session: { access_token: string } | null } }> };
};

export function subscribeToTable(
  client: SupabaseLike,
  channelName: string,
  specs: PostgresChangeSpec[],
): () => void {
  let disposed = false;
  let channel: ChannelLike | null = client.channel(channelName);

  for (const spec of specs) {
    channel = channel.on(
      'postgres_changes',
      {
        event: spec.event,
        schema: spec.schema ?? 'public',
        table: spec.table,
        ...(spec.filter ? { filter: spec.filter } : {}),
      },
      spec.handler as (payload: never) => void,
    );
  }

  const live = channel;
  void client.auth.getSession().then(({ data: { session } }) => {
    if (disposed) return;
    if (session) client.realtime.setAuth(session.access_token);
    live.subscribe();
  });

  return () => {
    if (disposed) return;
    disposed = true;
    void client.removeChannel(live);
  };
}
