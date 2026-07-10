import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTask, updateTask, deleteTask } from '../task-store';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 500 ? 'Internal Server Error' : 'OK',
    headers: { 'content-type': 'application/json' },
  });
}

describe('task-store', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createTask', () => {
    it('POSTs to /api/tasks with the fields as JSON', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { task: { id: 't1', name: 'New' } }));
      vi.stubGlobal('fetch', fetchMock);

      await createTask({ name: 'New', status: 'Todo' });

      expect(fetchMock).toHaveBeenCalledWith('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New', status: 'Todo' }),
      });
    });

    it('returns {ok:true, data} with the created task on 2xx', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { task: { id: 't1', name: 'New' } })));

      const result = await createTask({ name: 'New' });

      expect(result).toEqual({ ok: true, data: { task: { id: 't1', name: 'New' } } });
    });

    it('returns {ok:false} with the server error string on non-2xx', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(400, { error: 'invalid_body' })));

      const result = await createTask({});

      expect(result).toEqual({ ok: false, error: 'invalid_body' });
    });

    it('returns {ok:false} when fetch throws (network error)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      const result = await createTask({ name: 'New' });

      expect(result).toEqual({ ok: false, error: 'Network error' });
    });
  });

  describe('updateTask', () => {
    it('PATCHes /api/tasks/:id with the patch as JSON', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
      vi.stubGlobal('fetch', fetchMock);

      await updateTask('task-1', { status: 'Done' });

      expect(fetchMock).toHaveBeenCalledWith('/api/tasks/task-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Done' }),
      });
    });

    it('returns {ok:true} on 2xx', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { ok: true })));

      const result = await updateTask('task-1', { status: 'Done' });

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('returns {ok:false} with the server error string on non-2xx', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(400, { error: 'empty_patch' })));

      const result = await updateTask('task-1', {});

      expect(result).toEqual({ ok: false, error: 'empty_patch' });
    });

    it('falls back to statusText when the error body has no error string', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('', { status: 500, statusText: 'Internal Server Error' })
        )
      );

      const result = await updateTask('task-1', { status: 'Done' });

      expect(result).toEqual({ ok: false, error: 'Internal Server Error' });
    });

    it('returns {ok:false} when fetch throws (network error)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      const result = await updateTask('task-1', { status: 'Done' });

      expect(result).toEqual({ ok: false, error: 'Network error' });
    });
  });

  describe('deleteTask', () => {
    it('DELETEs /api/tasks/:id', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
      vi.stubGlobal('fetch', fetchMock);

      await deleteTask('task-1');

      expect(fetchMock).toHaveBeenCalledWith('/api/tasks/task-1', { method: 'DELETE' });
    });

    it('returns {ok:true} on 2xx', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { ok: true })));

      const result = await deleteTask('task-1');

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('returns {ok:false} with the server error string on non-2xx (e.g. 403 non-admin)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: 'Forbidden' })));

      const result = await deleteTask('task-1');

      expect(result).toEqual({ ok: false, error: 'Forbidden' });
    });

    it('returns {ok:false} when fetch throws (network error)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      const result = await deleteTask('task-1');

      expect(result).toEqual({ ok: false, error: 'Network error' });
    });
  });
});
