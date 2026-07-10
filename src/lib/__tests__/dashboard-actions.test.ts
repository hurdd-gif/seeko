import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTask } from '../dashboard-actions';

// createTask must route through the /api/tasks door (task-store), never a
// direct browser Supabase write. We stub task-store to assert the wiring and
// the preserved contract (returns the created Task, throws on failure).
vi.mock('@/lib/task-store', () => ({
  createTask: vi.fn(),
}));

import { createTask as storeCreateTask } from '@/lib/task-store';

const store = vi.mocked(storeCreateTask);

afterEach(() => {
  vi.clearAllMocks();
});

const input = {
  name: '  Ship the thing  ',
  department: 'Coding' as const,
  priority: 'High' as const,
};

describe('dashboard-actions.createTask', () => {
  it('posts to the task-store and returns the created task', async () => {
    const task = { id: 't1', name: 'Ship the thing' } as never;
    store.mockResolvedValue({ ok: true, data: { task } });

    const result = await createTask(input);

    expect(store).toHaveBeenCalledTimes(1);
    // Name is trimmed before it reaches the store.
    expect(store).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ship the thing', department: 'Coding', priority: 'High' }),
    );
    expect(result).toBe(task);
  });

  it('throws with the store error message when the write fails', async () => {
    store.mockResolvedValue({ ok: false, error: 'forbidden' });
    await expect(createTask(input)).rejects.toThrow('forbidden');
  });
});
