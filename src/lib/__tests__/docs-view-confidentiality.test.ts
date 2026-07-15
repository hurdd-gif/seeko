import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDocsView } from '../dashboard-views';
import { isDocLocked } from '../docs-index';

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
  getServiceClientAs: mocks.getServiceClient,
}));

// A contractor (non-investor, non-admin) in UI/UX. loadShellContext admits them —
// only `is_investor && !is_admin` is rejected — so they reach loadDocsView and are
// the un-hardened twin of the investor case: a Coding-restricted doc they aren't
// granted is LOCKED for them.
const CALLER_ID = 'contractor-1';
const ADMIN_ID = 'admin-1';
const OTHER_GRANTEE = 'other-secret-user-id';

type MockProfile = {
  id: string;
  display_name: string;
  department: string | null;
  avatar_url: null;
  is_admin: boolean;
  is_investor: boolean;
};

const CONTRACTOR_PROFILE: MockProfile = {
  id: CALLER_ID,
  display_name: 'Contractor Example',
  department: 'UI/UX',
  avatar_url: null,
  is_admin: false,
  is_investor: false,
};

const ADMIN_PROFILE: MockProfile = {
  id: ADMIN_ID,
  display_name: 'Admin Example',
  department: null,
  avatar_url: null,
  is_admin: true,
  is_investor: false,
};

// Flipped per-test before loadDocsView runs; createQuery's maybeSingle reads it live.
let activeProfile: MockProfile = CONTRACTOR_PROFILE;

// Exercises every branch of the server-side strip:
//  doc-a unrestricted             → full body ships
//  doc-b restricted, NOT granted  → body blanked, ACL fully stripped (the bug)
//  doc-c restricted, granted      → body ships; ACL reduced to the caller's own id
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
      granted_user_ids: [OTHER_GRANTEE],
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
      content: '<p>Contractor was explicitly granted this</p>',
      parent_id: null,
      restricted_department: ['Coding'],
      granted_user_ids: [CALLER_ID, OTHER_GRANTEE],
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

// One settled value per table covers every read loadShellContext + loadDocsView
// make. notifications is read twice (feed reads `.data`, unread count reads
// `.count`), so its value carries both.
const settledByTable: Record<string, unknown> = {
  profiles: { data: [], error: null },
  areas: { data: [], error: null },
  notifications: { data: [], count: 0, error: null },
  docs: docsResult,
};

function createQuery(table: string) {
  const settled = settledByTable[table] ?? { data: [], error: null };
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    // Only the caller-profile fetch ends in maybeSingle().
    maybeSingle: vi.fn(async () => ({ data: activeProfile, error: null })),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(settled).then(resolve, reject),
  };
  return query;
}

describe('loadDocsView — confidential body strip (staff/contractor twin of loadInvestorDocs)', () => {
  beforeEach(() => {
    activeProfile = CONTRACTOR_PROFILE;
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn((table: string) => createQuery(table)),
    });
  });

  it('blanks content + slides for a restricted doc the caller is not granted, but keeps the tile', async () => {
    const result = await loadDocsView({ id: CALLER_ID });
    const byId = Object.fromEntries(result.docs.map((doc) => [doc.id, doc]));

    // Tree stays intact — dropping a doc would break <DocList>'s parent/child tree.
    expect(result.docs).toHaveLength(3);
    expect(Object.keys(byId).sort()).toEqual(['doc-a', 'doc-b', 'doc-c']);

    // (a) unrestricted → full body ships
    expect(byId['doc-a'].content).toBe('<p>Public body</p>');

    // (c) restricted but granted to this caller → body ships untouched
    expect(byId['doc-c'].content).toBe('<p>Contractor was explicitly granted this</p>');
    expect(byId['doc-c'].slides).toEqual([
      { url: 'https://granted.example.invalid/1.png', sort_order: 0 },
    ]);

    // (b) restricted and NOT granted → confidential body is stripped, tile survives
    expect(byId['doc-b'].content).toBe('');
    expect(byId['doc-b'].slides).toEqual([]);
    expect(byId['doc-b'].title).toBe('Restricted Deck');
    expect(byId['doc-b'].restricted_department).toEqual(['Coding']);
    expect(byId['doc-b'].type).toBe('deck');
  });

  it('reduces granted_user_ids to minimal disclosure — never names OTHER grantees', async () => {
    const result = await loadDocsView({ id: CALLER_ID });
    const byId = Object.fromEntries(result.docs.map((doc) => [doc.id, doc]));

    // Unlocked-because-granted doc: the caller's own id is preserved (so the client
    // isLocked() still resolves false) but the co-grantee is stripped.
    expect(byId['doc-c'].granted_user_ids).toEqual([CALLER_ID]);
    expect(byId['doc-c'].granted_user_ids).not.toContain(OTHER_GRANTEE);

    // Locked doc: the caller is not on the ACL, so it collapses to empty — the
    // other grantee's id never ships.
    expect(byId['doc-b'].granted_user_ids).toEqual([]);
    expect(byId['doc-a'].granted_user_ids).toEqual([]);
  });

  it('preserves the client isLocked() computation exactly after the minimal-disclosure transform', async () => {
    const result = await loadDocsView({ id: CALLER_ID });
    const byId = Object.fromEntries(result.docs.map((doc) => [doc.id, doc]));

    // The client recomputes lock state from the SHIPPED granted_user_ids. Feeding
    // the minimized list back through isDocLocked must yield the true state: doc-c
    // openable (granted), doc-b locked.
    const clientLock = (doc: (typeof result.docs)[number]) =>
      isDocLocked({
        restrictedDepartments: doc.restricted_department ?? [],
        grantedUserIds: doc.granted_user_ids ?? [],
        currentUserId: CALLER_ID,
        userDepartment: 'UI/UX',
        isAdmin: false,
      });

    expect(clientLock(byId['doc-c'])).toBe(false);
    expect(clientLock(byId['doc-b'])).toBe(true);
    expect(clientLock(byId['doc-a'])).toBe(false);
  });

  it('ships only the vetted allowlist of fields (opt-in exposure)', async () => {
    const result = await loadDocsView({ id: CALLER_ID });

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
      'granted_user_ids',
    ].sort();
    for (const doc of result.docs) {
      expect(Object.keys(doc).sort()).toEqual(allowedKeys);
    }
  });
});

describe('loadDocsView — admin keeps the full grant list (grant-editor regression guard)', () => {
  beforeEach(() => {
    activeProfile = ADMIN_PROFILE;
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn((table: string) => createQuery(table)),
    });
  });

  it('ships full content and the complete granted_user_ids to an admin', async () => {
    const result = await loadDocsView({ id: ADMIN_ID });
    const byId = Object.fromEntries(result.docs.map((doc) => [doc.id, doc]));

    // Admin is never locked → every body ships, including the restricted deck.
    expect(byId['doc-b'].content).toBe('<p>TOP SECRET body</p>');
    expect(byId['doc-b'].slides).toEqual([
      { url: 'https://secret.example.invalid/1.png', sort_order: 0 },
    ]);

    // The grant editor (admin-only) seeds from this row — it MUST carry the real,
    // complete ACL, not the minimized non-admin form, or saving would wipe grants.
    expect(byId['doc-b'].granted_user_ids).toEqual([OTHER_GRANTEE]);
    expect(byId['doc-c'].granted_user_ids).toEqual([CALLER_ID, OTHER_GRANTEE]);
  });
});
