import { describe, it, expect, vi } from 'vitest';
import { fetchRecentItems } from '../data';

vi.mock('../server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          limit: () =>
            Promise.resolve({
              data:
                table === 'tasks'
                  ? [{ id: 't1', name: 'Task one', updated_at: '2026-05-13T10:00:00Z' }]
                  : table === 'docs'
                    ? [{ id: 'd1', title: 'Doc one', updated_at: '2026-05-13T11:00:00Z' }]
                    : [{ id: 'a1', name: 'Area one', updated_at: '2026-05-13T09:00:00Z' }],
              error: null,
            }),
        }),
      }),
    }),
  })),
}));

describe('fetchRecentItems', () => {
  it('returns union of tasks/docs/areas sorted by updated_at desc, capped at limit', async () => {
    const items = await fetchRecentItems('user-1', 3);
    expect(items.map((i) => i.id)).toEqual(['d1', 't1', 'a1']);
    expect(items[0]).toMatchObject({ kind: 'doc', title: 'Doc one', href: '/docs/d1' });
    expect(items[1]).toMatchObject({ kind: 'task', title: 'Task one', href: '/tasks/t1' });
    expect(items[2]).toMatchObject({ kind: 'area', title: 'Area one', href: '/areas/a1' });
  });
});
