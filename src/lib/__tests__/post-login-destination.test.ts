import { describe, expect, it } from 'vitest';
import { resolvePostLoginDestination } from '@/lib/post-login-destination';

function makeSupabase(user: { id: string } | null, profile: unknown) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }),
      }),
    }),
  } as never;
}

describe('resolvePostLoginDestination', () => {
  it('sends contractors to /contractor (contractor wins over investor)', async () => {
    const dest = await resolvePostLoginDestination(
      makeSupabase({ id: 'u1' }, { is_contractor: true, is_investor: true }),
    );
    expect(dest).toBe('/contractor');
  });

  it('sends investors to /investor', async () => {
    const dest = await resolvePostLoginDestination(
      makeSupabase({ id: 'u1' }, { is_contractor: false, is_investor: true }),
    );
    expect(dest).toBe('/investor');
  });

  it('defaults everyone else to /tasks', async () => {
    const dest = await resolvePostLoginDestination(
      makeSupabase({ id: 'u1' }, { is_contractor: false, is_investor: false }),
    );
    expect(dest).toBe('/tasks');
  });

  it('defaults to /tasks when there is no user', async () => {
    const dest = await resolvePostLoginDestination(makeSupabase(null, null));
    expect(dest).toBe('/tasks');
  });
});
