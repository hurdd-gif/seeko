import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadInvestorDocs } from '../investor-index';

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
  getServiceClientAs: mocks.getServiceClient,
}));

function createQuery(table: string) {
  const docsResult = {
    data: [
      {
        id: 'doc-1',
        title: 'Restricted Plan',
        content: '<p>Restricted content</p>',
        restricted_department: ['Coding'],
        granted_user_ids: [],
        type: 'doc',
        slides: null,
        deck_orientation: null,
        created_at: '2026-06-18T12:00:00.000Z',
        updated_at: '2026-06-18T12:00:00.000Z',
        sort_order: 0,
      },
    ],
    error: null,
  };
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: {
        id: 'investor-1',
        display_name: 'Investor Example',
        email: 'investor@example.invalid',
        department: null,
        avatar_url: null,
        is_admin: false,
        is_investor: true,
        timezone: null,
        paypal_email: null,
      },
      error: null,
    })),
    then: table === 'docs'
      ? (resolve: (value: typeof docsResult) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(docsResult).then(resolve, reject)
      : undefined,
  };

  return query;
}

describe('investor docs index', () => {
  beforeEach(() => {
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn((table: string) => createQuery(table)),
    });
  });

  it('does not treat non-admin investors as admins, and drops restricted docs they are not granted', async () => {
    // The /investor/docs route renders the SHARED <DocList isInvestor>, which has
    // no lock treatment for investors — so the loader must not ship a restricted,
    // ungranted doc at all (it would render as a normal tile that opens to
    // nothing, leaking the title; see investor-docs-confidentiality.test.ts for
    // the full filter matrix incl. the grants-win case). The loader must also
    // NOT flag the investor as admin (admin unlocks editing affordances).
    const result = await loadInvestorDocs({ id: 'investor-1' });

    expect(result.profile.isAdmin).toBe(false);
    // The only fixture doc is Coding-restricted with no grants → filtered out.
    expect(result.docs).toHaveLength(0);
    expect(result.docCount).toBe(0);
    expect(result.deckCount).toBe(0);
  });
});
