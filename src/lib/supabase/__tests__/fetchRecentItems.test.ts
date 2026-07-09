import { describe, it, expect, vi } from 'vitest';
import { fetchRecentItems } from '../data';

// The real `tasks` table has NO `updated_at` column — only `created_at`
// (docs/supabase-schema.sql:118-129). This mock models that: ordering by
// any column other than `created_at` mimics Postgres' "column does not
// exist" error (data: null), exactly as the live DB behaves. A query that
// asks for `updated_at` therefore yields an empty row and the section
// vanishes — the regression this test guards against.
const TASK_ROWS = [
  { id: 't1', name: 'Task one', created_at: '2026-05-13T10:00:00Z' },
  { id: 't2', name: 'Task two', created_at: '2026-05-13T12:00:00Z' },
  { id: 't3', name: 'Task three', created_at: '2026-05-13T08:00:00Z' },
];

vi.mock('../server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => ({
      select: (cols: string) => ({
        order: (col: string) => ({
          limit: () =>
            Promise.resolve(
              table === 'tasks' && col === 'created_at' && /created_at/.test(cols)
                ? { data: TASK_ROWS, error: null }
                : { data: null, error: { message: `column "${col}" does not exist` } },
            ),
        }),
      }),
    }),
  })),
}));

describe('fetchRecentItems', () => {
  it('returns ONLY tasks, ordered by an existing column, newest first', async () => {
    const items = await fetchRecentItems('user-1', 3);

    expect(items.map((i) => i.id)).toEqual(['t2', 't1', 't3']);
    expect(items.every((i) => i.kind === 'task')).toBe(true);
    expect(items.every((i) => i.href === `/tasks/${i.id}`)).toBe(true);
    expect(items[0]).toMatchObject({ kind: 'task', title: 'Task two', href: '/tasks/t2' });
  });

  it('caps the result at the requested limit', async () => {
    const items = await fetchRecentItems('user-1', 2);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id)).toEqual(['t2', 't1']);
  });
});
