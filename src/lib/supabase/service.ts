import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** The headers the DB reads the acting user, and what acted for them, from. Must
 *  match `current_actor_id()` / `current_actor_source()` in migration
 *  20260713140000_activity_actor.sql — the two halves of one seam. */
export const ACTOR_HEADER = 'x-seeko-actor';
export const SOURCE_HEADER = 'x-seeko-source';

/** Who is at the keyboard vs. what carried out the write. `activity_log.source`. */
export type ActorSource = 'human' | 'eko';

const clients = new Map<string, ReturnType<typeof createClient<Database>>>();

const ANONYMOUS = '';

function build(actorId: string, source: ActorSource) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  const headers: Record<string, string> = {};
  if (actorId) headers[ACTOR_HEADER] = actorId;
  if (source !== 'human') headers[SOURCE_HEADER] = source;
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(Object.keys(headers).length ? { global: { headers } } : {}),
  });
}

/**
 * Supabase client with the service role, for server-side operations.
 * Use only in API routes or server code; never expose to the client.
 *
 * Carries NO actor. Everything it writes that trips an audit trigger lands in
 * activity_log with a NULL user_id, because the service role has no session and
 * `auth.uid()` is NULL. Correct for genuinely system-authored writes (cron,
 * webhooks, backfills); wrong for anything a person asked for — those want
 * `getServiceClientAs(user.id)`.
 */
export function getServiceClient() {
  return memoized(ANONYMOUS, 'human');
}

function memoized(actorId: string, source: ActorSource) {
  const key = `${source}:${actorId}`;
  let client = clients.get(key);
  if (!client) {
    client = build(actorId, source);
    clients.set(key, client);
  }
  return client;
}

/**
 * The same service-role client, but every request it sends names `actorId` as
 * the person responsible. The DB reads that header in `current_actor_id()` and
 * the audit triggers stamp it onto activity_log, so a task write performed by
 * the API on someone's behalf is attributed to them and not to nobody.
 *
 * This is a client PER ACTOR, not a header per call, because supabase-js binds
 * headers at construction. Memoized: the map is keyed by user id and the studio
 * has a handful of users, so it settles at a handful of clients. Do not reach
 * for `getServiceClient()` and mutate its headers — that would race, since the
 * singleton is shared across concurrent requests.
 *
 * The header is only trusted because the DB checks the caller is the service
 * role before honouring it (see the migration). It is not a credential and
 * cannot be used to escalate: it names an actor, it does not grant them
 * anything.
 *
 * `source` says what carried the write out on the actor's behalf. It brands
 * activity_log.source, which the feed renders as the EKO badge. Pass 'eko' from
 * the agent's executors and leave it alone everywhere else — a person clicking a
 * button in the UI is the default.
 */
export function getServiceClientAs(actorId: string, source: ActorSource = 'human') {
  if (!actorId && source === 'human') return getServiceClient();
  return memoized(actorId, source);
}
