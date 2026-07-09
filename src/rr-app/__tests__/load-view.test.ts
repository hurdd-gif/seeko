import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadView } from '../load-view';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('loadView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a ready state with the parsed payload on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { board: [1, 2, 3] })));

    const result = await loadView<{ board: number[] }>('/api/tasks-board', 'Unable to load tasks');

    expect(result).toEqual({ status: 'ready', data: { board: [1, 2, 3] } });
  });

  it('returns an unauthorized state on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthorized' })));

    const result = await loadView('/api/tasks-board', 'Unable to load tasks');

    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('returns a forbidden state on 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: 'forbidden' })));

    const result = await loadView('/api/tasks-board', 'Unable to load tasks');

    expect(result).toEqual({ status: 'forbidden' });
  });

  it('returns a not_found state on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, { error: 'not_found' })));

    const result = await loadView('/api/tasks-board', 'Unable to load tasks');

    expect(result).toEqual({ status: 'not_found' });
  });

  it('throws a Response carrying the given message on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' })));

    await expect(loadView('/api/tasks-board', 'Unable to load tasks')).rejects.toSatisfy(
      (err: unknown) => err instanceof Response && err.status === 500,
    );
  });

  it('propagates the exact message text on the thrown Response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(502, {})));

    try {
      await loadView('/api/tasks-board', 'Custom failure message');
      expect.unreachable('loadView should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      const response = err as Response;
      expect(response.status).toBe(502);
      expect(await response.text()).toBe('Custom failure message');
    }
  });

  it('fetches the given url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await loadView('/api/some-url', 'msg');

    expect(fetchMock).toHaveBeenCalledWith('/api/some-url');
  });
});
