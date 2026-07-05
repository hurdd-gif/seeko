import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProfileRoutes } from '../profile';

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
}));

function createProfileApp(authenticated = true) {
  return new Hono().route('/api', createProfileRoutes({
    authResolver: async () => (authenticated ? { id: 'user-1', email: 'admin@example.invalid' } : null),
  }));
}

describe('profile routes', () => {
  beforeEach(() => {
    mocks.getServiceClient.mockReset();
  });

  it('returns current profile role flags for the global EKO gate', async () => {
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          single: vi.fn(async () => ({
            data: {
              id: 'user-1',
              email: null,
              display_name: 'Admin Example',
              is_admin: true,
              is_investor: false,
            },
            error: null,
          })),
        };
        return query;
      }),
    });

    const response = await createProfileApp().request('/api/profile');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      profile: {
        id: 'user-1',
        email: 'admin@example.invalid',
        displayName: 'Admin Example',
        isAdmin: true,
        isInvestor: false,
      },
    });
  });

  it('requires an authenticated user', async () => {
    const response = await createProfileApp(false).request('/api/profile');

    expect(response.status).toBe(401);
  });
});
