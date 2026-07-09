import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTasksForAssignee, fetchAllTasksWithAssignees } from '../data';

vi.mock('../server', () => ({
  createClient: vi.fn(),
}));

const SELECT_WITH_JOIN =
  '*, assignee:profiles!tasks_assignee_id_fkey(id, display_name, avatar_url)';

const ALL_ROWS = [
  { id: 't1', name: 'Mine', assignee_id: 'u1', assignee: { id: 'u1', display_name: 'Me', avatar_url: null } },
  { id: 't2', name: 'Theirs', assignee_id: 'u2', assignee: { id: 'u2', display_name: 'Them', avatar_url: null } },
];

describe('tasks board fetchers — admin vs non-admin scoping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetchTasksForAssignee scopes to ONE assignee server-side, keeping the join + order', async () => {
    // Mirror the supabase builder chain: from -> select -> eq -> order (awaited).
    // The mock only returns rows whose assignee_id matches the .eq() filter,
    // proving the filter is applied at the query layer (not in memory).
    const order = vi.fn();
    const eq = vi.fn().mockImplementation((col: string, val: string) => {
      const rows = ALL_ROWS.filter((r) => r[col as 'assignee_id'] === val);
      order.mockResolvedValue({ data: rows, error: null });
      return { order };
    });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const { createClient } = await import('../server');
    (createClient as any).mockResolvedValue({ from });

    const tasks = await fetchTasksForAssignee('u1');

    expect(from).toHaveBeenCalledWith('tasks');
    expect(select).toHaveBeenCalledWith(SELECT_WITH_JOIN);
    expect(eq).toHaveBeenCalledWith('assignee_id', 'u1');
    expect(order).toHaveBeenCalledWith('deadline', { ascending: true, nullsFirst: false });

    // Only the caller's own task comes back; the assignee join is intact.
    expect(tasks.map((t) => t.id)).toEqual(['t1']);
    expect(tasks[0].assignee).toEqual({ id: 'u1', display_name: 'Me', avatar_url: null });
  });

  it('fetchAllTasksWithAssignees returns ALL rows (no assignee filter) — admin path', async () => {
    const order = vi.fn().mockResolvedValue({ data: ALL_ROWS, error: null });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });

    const { createClient } = await import('../server');
    (createClient as any).mockResolvedValue({ from });

    const tasks = await fetchAllTasksWithAssignees();

    expect(from).toHaveBeenCalledWith('tasks');
    expect(select).toHaveBeenCalledWith(SELECT_WITH_JOIN);
    expect(order).toHaveBeenCalledWith('deadline', { ascending: true, nullsFirst: false });
    expect(tasks.map((t) => t.id)).toEqual(['t1', 't2']);
  });
});
