import { describe, expect, it, vi } from 'vitest';
import {
  TASK_PATCH_COLUMNS,
  sanitizeTaskPatch,
  createTask,
  updateTask,
  deleteTask,
} from '../tasks-repo';

describe('sanitizeTaskPatch', () => {
  it('drops unknown keys and keeps whitelisted ones', () => {
    expect(sanitizeTaskPatch({ status: 'Done', evil: 'x' })).toEqual({ status: 'Done' });
  });

  it('returns {} when the input has no whitelisted keys', () => {
    expect(sanitizeTaskPatch({ id: 'nope', task_number: 5, created_at: 'now' })).toEqual({});
  });

  it('returns {} for an empty input', () => {
    expect(sanitizeTaskPatch({})).toEqual({});
  });

  it('keeps every whitelisted column untouched', () => {
    const input: Record<string, unknown> = {};
    for (const column of TASK_PATCH_COLUMNS) input[column] = `value-${column}`;
    expect(sanitizeTaskPatch(input)).toEqual(input);
  });

  it('ignores prototype-chain properties (own keys only)', () => {
    const input = Object.create({ status: 'Done' }) as Record<string, unknown>;
    input.priority = 'High';
    expect(sanitizeTaskPatch(input)).toEqual({ priority: 'High' });
  });
});

describe('createTask', () => {
  it('inserts the given fields, selects, and returns the created row', async () => {
    const row = { id: 'task-1', name: 'New task', status: 'Todo' };
    const single = vi.fn(async () => ({ data: row, error: null }));
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const service = { from: vi.fn(() => ({ insert })) };

    const result = await createTask({ name: 'New task', status: 'Todo' }, service as never);

    expect(service.from).toHaveBeenCalledWith('tasks');
    expect(insert).toHaveBeenCalledWith({ name: 'New task', status: 'Todo' });
    expect(select).toHaveBeenCalled();
    expect(result).toEqual({ task: row });
  });

  it('surfaces a supabase insert error as {error}', async () => {
    const single = vi.fn(async () => ({ data: null, error: { message: 'insert failed' } }));
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const service = { from: vi.fn(() => ({ insert })) };

    const result = await createTask({ name: 'Broken' }, service as never);

    expect(result).toEqual({ error: 'insert failed' });
  });

  it('falls back to a generic message when the error has no message', async () => {
    const single = vi.fn(async () => ({ data: null, error: {} }));
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const service = { from: vi.fn(() => ({ insert })) };

    const result = await createTask({ name: 'Broken' }, service as never);

    expect(result).toEqual({ error: 'Unknown error' });
  });
});

describe('updateTask', () => {
  it('updates the sanitized patch and filters by id on success', async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    const service = { from: vi.fn(() => ({ update })) };

    const result = await updateTask('task-1', { status: 'Done' }, service as never);

    expect(service.from).toHaveBeenCalledWith('tasks');
    expect(update).toHaveBeenCalledWith({ status: 'Done' });
    expect(eq).toHaveBeenCalledWith('id', 'task-1');
    expect(result).toEqual({ ok: true });
  });

  it('surfaces a supabase update error as {error}', async () => {
    const eq = vi.fn(async () => ({ error: { message: 'update failed' } }));
    const update = vi.fn(() => ({ eq }));
    const service = { from: vi.fn(() => ({ update })) };

    const result = await updateTask('task-1', { status: 'Done' }, service as never);

    expect(result).toEqual({ error: 'update failed' });
  });
});

describe('deleteTask', () => {
  it('deletes by id and reports deleted:true when a row was removed', async () => {
    const select = vi.fn(async () => ({ data: [{ id: 'task-1' }], error: null }));
    const eq = vi.fn(() => ({ select }));
    const del = vi.fn(() => ({ eq }));
    const service = { from: vi.fn(() => ({ delete: del })) };

    const result = await deleteTask('task-1', service as never);

    expect(service.from).toHaveBeenCalledWith('tasks');
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'task-1');
    expect(result).toEqual({ ok: true, deleted: true });
  });

  it('reports deleted:false when no row matched (already removed)', async () => {
    const select = vi.fn(async () => ({ data: [], error: null }));
    const eq = vi.fn(() => ({ select }));
    const del = vi.fn(() => ({ eq }));
    const service = { from: vi.fn(() => ({ delete: del })) };

    const result = await deleteTask('missing', service as never);

    expect(result).toEqual({ ok: true, deleted: false });
  });

  it('surfaces a supabase delete error as {error}', async () => {
    const select = vi.fn(async () => ({ data: null, error: { message: 'delete failed' } }));
    const eq = vi.fn(() => ({ select }));
    const del = vi.fn(() => ({ eq }));
    const service = { from: vi.fn(() => ({ delete: del })) };

    const result = await deleteTask('task-1', service as never);

    expect(result).toEqual({ error: 'delete failed' });
  });
});
