import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  isDevAuthBypass: vi.fn(() => false),
}));

beforeEach(() => {
  mocks.getServiceClient.mockReset();
  mocks.isDevAuthBypass.mockReset();
  mocks.isDevAuthBypass.mockReturnValue(false);
});

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
}));

vi.mock('../supabase', async (importOriginal) => {
  const original = await importOriginal<typeof import('../supabase')>();
  return {
    ...original,
    isDevAuthBypass: mocks.isDevAuthBypass,
  };
});

function mockProfileQuery(row: Record<string, unknown> | null, error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: row, error })),
  };
  mocks.getServiceClient.mockReturnValue({
    from: vi.fn(() => query),
  });
  return query;
}

describe('requireAdminVia', () => {
  it('returns 401 Unauthorized when the resolver finds no user', async () => {
    const { requireAdminVia } = await import('../auth-utils');
    const resolver = async () => null;

    const guard = await requireAdminVia({} as never, resolver);

    expect(guard).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('returns ok with flags when the service profile has is_admin:true', async () => {
    mockProfileQuery({ is_admin: true, is_investor: false });
    const { requireAdminVia } = await import('../auth-utils');
    const resolver = async () => ({ id: 'user-1', email: 'admin@example.invalid' });

    const guard = await requireAdminVia({} as never, resolver);

    expect(guard).toEqual({
      ok: true,
      user: { id: 'user-1', email: 'admin@example.invalid' },
      isAdmin: true,
      isInvestor: false,
    });
  });

  it('returns 403 Forbidden when is_admin is false', async () => {
    mockProfileQuery({ is_admin: false, is_investor: false });
    const { requireAdminVia } = await import('../auth-utils');
    const resolver = async () => ({ id: 'user-2', email: 'member@example.invalid' });

    const guard = await requireAdminVia({} as never, resolver);

    expect(guard).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  it('returns 403 Forbidden when no profile row exists (maybeSingle null)', async () => {
    mockProfileQuery(null);
    const { requireAdminVia } = await import('../auth-utils');
    const resolver = async () => ({ id: 'user-3', email: 'ghost@example.invalid' });

    const guard = await requireAdminVia({} as never, resolver);

    expect(guard).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  it('fails closed (403, not a throw) when the profiles query itself errors', async () => {
    mockProfileQuery(null, { message: 'boom' });
    const { requireAdminVia } = await import('../auth-utils');
    const resolver = async () => ({ id: 'user-err', email: 'errored@example.invalid' });

    const guard = await requireAdminVia({} as never, resolver);

    expect(guard).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  it('short-circuits to isAdmin:true under DEV_AUTH_BYPASS without querying the service client', async () => {
    mocks.isDevAuthBypass.mockReturnValueOnce(true);
    const { requireAdminVia } = await import('../auth-utils');
    const resolver = async () => ({ id: 'dev-user', email: 'dev@example.invalid' });

    const guard = await requireAdminVia({} as never, resolver);

    expect(guard).toEqual({
      ok: true,
      user: { id: 'dev-user', email: 'dev@example.invalid' },
      isAdmin: true,
      isInvestor: false,
    });
    expect(mocks.getServiceClient).not.toHaveBeenCalled();
  });
});

describe('isAdminUser', () => {
  it('returns true when the profile row has is_admin:true', async () => {
    mockProfileQuery({ is_admin: true });
    const { isAdminUser } = await import('../auth-utils');

    await expect(isAdminUser('user-1')).resolves.toBe(true);
  });

  it('returns false when is_admin is false', async () => {
    mockProfileQuery({ is_admin: false });
    const { isAdminUser } = await import('../auth-utils');

    await expect(isAdminUser('user-2')).resolves.toBe(false);
  });

  it('returns false when no profile row exists', async () => {
    mockProfileQuery(null);
    const { isAdminUser } = await import('../auth-utils');

    await expect(isAdminUser('user-3')).resolves.toBe(false);
  });

  it('throws when the service query errors, so callers can distinguish a lookup failure from "not admin"', async () => {
    mockProfileQuery(null, new Error('connection reset'));
    const { isAdminUser } = await import('../auth-utils');

    await expect(isAdminUser('user-4')).rejects.toThrow('connection reset');
  });
});
