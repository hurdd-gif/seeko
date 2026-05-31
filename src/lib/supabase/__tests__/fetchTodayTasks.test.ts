import { describe, it, expect, vi } from 'vitest';
import { fetchTodayTasks } from '../data';

vi.mock('../server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        in: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({
                data: [
                  {
                    id: 't1',
                    name: 'Today task',
                    priority: 'High',
                    deadline: '2026-05-14',
                    status: 'In Progress',
                    department: 'Coding',
                  },
                ],
                error: null,
              }),
          }),
        }),
      }),
    }),
  })),
}));

describe('fetchTodayTasks', () => {
  it('returns top open tasks limited', async () => {
    const tasks = await fetchTodayTasks(5);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe('Today task');
  });
});
