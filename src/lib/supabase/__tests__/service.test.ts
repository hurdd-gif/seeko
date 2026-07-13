import { beforeAll, describe, expect, it } from 'vitest';
import {
  ACTOR_HEADER,
  SOURCE_HEADER,
  getServiceClient,
  getServiceClientAs,
} from '../service';

/** The headers PostgREST will actually receive for a query built from `client`.
 *  postgrest-js keeps them in a `Headers` instance, which JSON.stringify()s to
 *  `{}` — read them through .entries() or the assertions silently pass. */
function headersOf(client: ReturnType<typeof getServiceClient>): Record<string, string> {
  const builder = client.from('activity_log').select('id') as unknown as { headers: Headers };
  return Object.fromEntries(builder.headers.entries());
}

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
});

describe('service client actor seam', () => {
  it('names no actor by default — a system write is attributable to nobody, on purpose', () => {
    const headers = headersOf(getServiceClient());
    expect(headers[ACTOR_HEADER]).toBeUndefined();
    expect(headers[SOURCE_HEADER]).toBeUndefined();
  });

  it('sends the actor the DB reads in current_actor_id()', () => {
    expect(headersOf(getServiceClientAs(ALICE))[ACTOR_HEADER]).toBe(ALICE);
  });

  it('brands EKO writes at the source, so the trigger stamps activity_log.source', () => {
    const headers = headersOf(getServiceClientAs(ALICE, 'eko'));
    expect(headers[ACTOR_HEADER]).toBe(ALICE);
    expect(headers[SOURCE_HEADER]).toBe('eko');
  });

  it('does not brand human writes — source defaults to human in the DB', () => {
    expect(headersOf(getServiceClientAs(ALICE))[SOURCE_HEADER]).toBeUndefined();
  });

  it('keeps one client per actor, so two concurrent requests cannot swap actors', () => {
    // supabase-js binds headers at construction. If we handed back a shared
    // client and mutated its headers per call, Alice's request could be sent
    // under Bob's name — the exact failure this seam exists to prevent.
    expect(getServiceClientAs(ALICE)).toBe(getServiceClientAs(ALICE));
    expect(getServiceClientAs(ALICE)).not.toBe(getServiceClientAs(BOB));
    expect(getServiceClientAs(ALICE)).not.toBe(getServiceClientAs(ALICE, 'eko'));
    expect(getServiceClientAs(ALICE)).not.toBe(getServiceClient());
    expect(headersOf(getServiceClientAs(BOB))[ACTOR_HEADER]).toBe(BOB);
  });
});
