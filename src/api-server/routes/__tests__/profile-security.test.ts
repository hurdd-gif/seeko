import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProfileRoutes } from '../profile';

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
  getServiceClientAs: mocks.getServiceClient,
}));

function createQuery(isAdmin: boolean) {
  const updateEq = vi.fn(async () => ({ error: null }));
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: { is_admin: isAdmin }, error: null })),
    update: vi.fn(() => ({ eq: updateEq })),
  };
  return query;
}

describe('PATCH /profile admin gate (requireAdminVia migration)', () => {
  beforeEach(() => {
    mocks.getServiceClient.mockReset();
  });

  it('rejects an authenticated non-admin with 403 Forbidden', async () => {
    mocks.getServiceClient.mockReturnValue({ from: vi.fn(() => createQuery(false)) });
    const app = new Hono().route('/api', createProfileRoutes({
      authResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    }));

    const response = await app.request('/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'user-2', department: 'Coding' }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('rejects an unauthenticated caller with 401 Unauthorized', async () => {
    mocks.getServiceClient.mockReturnValue({ from: vi.fn(() => createQuery(true)) });
    const app = new Hono().route('/api', createProfileRoutes({
      authResolver: async () => null,
    }));

    const response = await app.request('/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'user-2', department: 'Coding' }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('allows an admin through to update the target profile', async () => {
    mocks.getServiceClient.mockReturnValue({ from: vi.fn(() => createQuery(true)) });
    const app = new Hono().route('/api', createProfileRoutes({
      authResolver: async () => ({ id: 'admin-1', email: 'admin@example.invalid' }),
    }));

    const response = await app.request('/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'user-2', department: 'Coding' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe('POST /profile/password-complete', () => {
  beforeEach(() => {
    mocks.getServiceClient.mockReset();
  });

  it('rejects an unauthenticated caller with 401', async () => {
    mocks.getServiceClient.mockReturnValue({ from: vi.fn(() => createQuery(false)) });
    const app = new Hono().route('/api', createProfileRoutes({
      authResolver: async () => null,
    }));

    const response = await app.request('/api/profile/password-complete', { method: 'POST' });

    expect(response.status).toBe(401);
  });

  /* The invariant this route exists to hold. `must_set_password` gates the
   * set-password screen, so clearing someone ELSE's flag would strand them —
   * and clearing it early would let an invited user skip the ceremony while
   * keeping their temporary credentials. The row is chosen from the session,
   * never from the request, so a caller cannot aim it at another user no
   * matter what they send. */
  it('clears the flag on the CALLER row, ignoring any user id in the body', async () => {
    const query = createQuery(false);
    mocks.getServiceClient.mockReturnValue({ from: vi.fn(() => query) });
    const app = new Hono().route('/api', createProfileRoutes({
      authResolver: async () => ({ id: 'caller-1', email: 'member@example.invalid' }),
    }));

    const response = await app.request('/api/profile/password-complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'victim-2', userId: 'victim-2', must_set_password: true }),
    });

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledWith({ must_set_password: false });

    const updateEq = query.update.mock.results[0]!.value.eq as ReturnType<typeof vi.fn>;
    expect(updateEq).toHaveBeenCalledWith('id', 'caller-1');
  });
});
