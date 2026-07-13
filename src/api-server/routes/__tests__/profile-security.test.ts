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
