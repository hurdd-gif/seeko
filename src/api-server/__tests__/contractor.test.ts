import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../supabase';
import { createContractorRoutes } from '../routes/contractor';
import { type ContractorOverviewData } from '@/lib/contractor-index';
import { AccessError } from '@/lib/access-error';

const READY: ContractorOverviewData = {
  profile: {
    id: 'u1',
    displayName: 'Dana',
    email: 'dana@example.com',
    avatarUrl: null,
    isAdmin: false,
    isContractor: true,
  },
  deliverables: [],
};

function appWith(opts: Parameters<typeof createContractorRoutes>[0]) {
  return new Hono().route('/api', createContractorRoutes(opts));
}

describe('GET /api/contractor-index', () => {
  it('401 when unauthenticated', async () => {
    const app = appWith({ authResolver: async () => null });
    const res = await app.request('/api/contractor-index');
    expect(res.status).toBe(401);
  });

  it('403 when the loader reports contractor_required', async () => {
    const app = appWith({
      authResolver: async () => ({ id: 'u1', email: 'x' }) as AuthenticatedUser,
      contractorOverviewLoader: async () => {
        throw new AccessError('forbidden', 'contractor_required');
      },
    });
    const res = await app.request('/api/contractor-index');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'contractor_required' });
  });

  it('404 when the profile is missing', async () => {
    const app = appWith({
      authResolver: async () => ({ id: 'u1', email: 'x' }) as AuthenticatedUser,
      contractorOverviewLoader: async () => {
        throw new AccessError('profile_not_found');
      },
    });
    const res = await app.request('/api/contractor-index');
    expect(res.status).toBe(404);
  });

  it('200 with the overview payload when authorized', async () => {
    const app = appWith({
      authResolver: async () => ({ id: 'u1', email: 'x' }) as AuthenticatedUser,
      contractorOverviewLoader: async () => READY,
    });
    const res = await app.request('/api/contractor-index');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(READY);
  });
});
