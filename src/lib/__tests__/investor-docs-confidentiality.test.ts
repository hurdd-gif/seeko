import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadInvestorDocs } from '../investor-index';

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
  getServiceClientAs: mocks.getServiceClient,
}));

const INVESTOR_ID = 'investor-1';

// A mix that exercises every branch of the server-side confidentiality strip:
//  (a) unrestricted            → full body ships
//  (b) restricted, NOT granted → body must be blanked (the bug)
//  (c) restricted, granted     → granted_user_ids overrides the lock, body ships
const docsResult = {
  data: [
    {
      id: 'doc-a',
      title: 'Public Overview',
      content: '<p>Public body</p>',
      parent_id: null,
      restricted_department: [],
      granted_user_ids: [],
      type: 'doc',
      slides: null,
      deck_orientation: null,
      created_at: '2026-06-18T12:00:00.000Z',
      updated_at: '2026-06-18T12:00:00.000Z',
      sort_order: 0,
    },
    {
      id: 'doc-b',
      title: 'Restricted Deck',
      content: '<p>TOP SECRET body</p>',
      parent_id: null,
      restricted_department: ['Coding'],
      granted_user_ids: [],
      type: 'deck',
      slides: [{ url: 'https://secret.example.invalid/1.png', sort_order: 0 }],
      deck_orientation: 'horizontal',
      created_at: '2026-06-18T12:00:00.000Z',
      updated_at: '2026-06-18T12:00:00.000Z',
      sort_order: 1,
    },
    {
      id: 'doc-c',
      title: 'Granted Restricted Deck',
      content: '<p>Investor was explicitly granted this</p>',
      parent_id: null,
      restricted_department: ['Coding'],
      granted_user_ids: [INVESTOR_ID],
      type: 'deck',
      slides: [{ url: 'https://granted.example.invalid/1.png', sort_order: 0 }],
      deck_orientation: 'horizontal',
      created_at: '2026-06-18T12:00:00.000Z',
      updated_at: '2026-06-18T12:00:00.000Z',
      sort_order: 2,
    },
  ],
  error: null,
};

const teamResult = { data: [], error: null };

function createQuery(table: string) {
  const settled = table === 'docs' ? docsResult : teamResult;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => query),
    // loadInvestorProfile ends its 'profiles' chain in maybeSingle(); the team
    // fetch ends in order() and is awaited via `then`.
    maybeSingle: vi.fn(async () => ({
      data: {
        id: INVESTOR_ID,
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
    then: (resolve: (value: typeof settled) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(settled).then(resolve, reject),
  };
  return query;
}

describe('loadInvestorDocs — confidential body strip', () => {
  beforeEach(() => {
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn((table: string) => createQuery(table)),
    });
  });

  it('keeps full content for unrestricted and granted docs, but blanks content + slides for a restricted doc the investor is not granted', async () => {
    const result = await loadInvestorDocs({ id: INVESTOR_ID });

    const byId = Object.fromEntries(result.docs.map((doc) => [doc.id, doc]));

    // Tree stays intact — every doc is still present (dropping a doc would break
    // <DocList>'s parent/child tree and tab counts).
    expect(result.docs).toHaveLength(3);
    expect(Object.keys(byId).sort()).toEqual(['doc-a', 'doc-b', 'doc-c']);

    // (a) unrestricted → full body ships
    expect(byId['doc-a'].content).toBe('<p>Public body</p>');

    // (c) restricted but granted to this investor → body ships untouched
    expect(byId['doc-c'].content).toBe('<p>Investor was explicitly granted this</p>');
    expect(byId['doc-c'].slides).toEqual([
      { url: 'https://granted.example.invalid/1.png', sort_order: 0 },
    ]);

    // (b) restricted and NOT granted → confidential body is stripped
    expect(byId['doc-b'].content).toBe('');
    expect(byId['doc-b'].slides).toEqual([]);
    // ...but the tile still renders: title + metadata survive
    expect(byId['doc-b'].title).toBe('Restricted Deck');
    expect(byId['doc-b'].restricted_department).toEqual(['Coding']);
    expect(byId['doc-b'].type).toBe('deck');
  });

  it('never ships granted_user_ids to an investor (the doc access-control list is confidential)', async () => {
    const result = await loadInvestorDocs({ id: INVESTOR_ID });
    const byId = Object.fromEntries(result.docs.map((doc) => [doc.id, doc]));

    // The ACL must not ride along on ANY doc — not the locked one (doc-b), and
    // especially not the granted one (doc-c), whose granted_user_ids names other
    // profile ids that, joined against `team`, would reveal who can read it.
    for (const doc of result.docs) {
      expect(doc).not.toHaveProperty('granted_user_ids');
    }
    // Guard the highest-value case explicitly: doc-c's raw row carried
    // granted_user_ids: [INVESTOR_ID] and it must not survive into the payload.
    expect(byId['doc-c'].granted_user_ids).toBeUndefined();

    // The allowlist is opt-in: only the vetted fields reach the investor. If a new
    // column is added to DOC_FULL_SELECT, it must be consciously added here too —
    // this assertion fails loudly if an unexpected key starts shipping.
    const allowedKeys = [
      'id',
      'title',
      'parent_id',
      'sort_order',
      'type',
      'deck_orientation',
      'restricted_department',
      'created_at',
      'updated_at',
      'content',
      'slides',
    ].sort();
    for (const doc of result.docs) {
      expect(Object.keys(doc).sort()).toEqual(allowedKeys);
    }
  });
});
