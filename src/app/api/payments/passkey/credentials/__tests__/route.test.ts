// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

const mockGetAll = vi.fn(() => []);
const mockSet = vi.fn();
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: mockGetAll, set: mockSet }),
}));

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

const mockGetPaymentsAuth = vi.fn();
vi.mock('@/lib/payments-auth', () => ({
  getPaymentsAuth: mockGetPaymentsAuth,
}));

function makeReq(url = 'http://localhost:3000/api/payments/passkey/credentials') {
  return { url, headers: new Headers() };
}

describe('GET /api/payments/passkey/credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  });

  it('returns 401 when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { GET } = await import('../route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns the credentials for the calling user only', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    const eqSpy = vi.fn(() => ({
      order: async () => ({
        data: [
          { id: 'r1', device_name: 'Mac', created_at: '2026-05-10', last_used_at: null },
          { id: 'r2', device_name: 'iPhone', created_at: '2026-05-11', last_used_at: '2026-05-12' },
        ],
        error: null,
      }),
    }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'passkey_credentials') {
        return { select: () => ({ eq: eqSpy }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const { GET } = await import('../route');
    const res = await GET();

    expect(res.status).toBe(200);
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'admin-1');
    expect((res.body as unknown as { credentials: unknown[] }).credentials).toHaveLength(2);
  });
});

describe('DELETE /api/payments/passkey/credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  });

  it('returns 401 when not signed in', async () => {
    mockGetPaymentsAuth.mockResolvedValue({ user: null, tokenValid: false });
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { DELETE } = await import('../route');
    const res = await DELETE(makeReq('http://localhost:3000/api/payments/passkey/credentials?id=abc') as any);
    expect(res.status).toBe(401);
  });

  it('returns 401 when payments token is missing or invalid (defense-in-depth against hijacked sessions)', async () => {
    mockGetPaymentsAuth.mockResolvedValue({ user: { id: 'admin-1' }, tokenValid: false });
    const { DELETE } = await import('../route');
    const res = await DELETE(makeReq('http://localhost:3000/api/payments/passkey/credentials?id=row-uuid') as any);
    expect(res.status).toBe(401);
    expect((res.body as { error?: string }).error).toMatch(/payments token/i);
  });

  it('returns 400 when id is missing', async () => {
    mockGetPaymentsAuth.mockResolvedValue({
      supabase: { from: mockFrom },
      user: { id: 'admin-1' },
      tokenValid: true,
    });
    const { DELETE } = await import('../route');
    const res = await DELETE(makeReq() as any);
    expect(res.status).toBe(400);
  });

  it('deletes the credential and returns 200 on success', async () => {
    const finalEq = vi.fn(async () => ({ error: null, count: 1 }));
    const firstEq = vi.fn(() => ({ eq: finalEq }));
    const deleteSpy = vi.fn(() => ({ eq: firstEq }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'passkey_credentials') return { delete: deleteSpy };
      throw new Error(`Unexpected table: ${table}`);
    });
    mockGetPaymentsAuth.mockResolvedValue({
      supabase: { from: mockFrom },
      user: { id: 'admin-1' },
      tokenValid: true,
    });

    const { DELETE } = await import('../route');
    const res = await DELETE(makeReq('http://localhost:3000/api/payments/passkey/credentials?id=row-uuid') as any);

    expect(res.status).toBe(200);
    expect(deleteSpy).toHaveBeenCalledWith({ count: 'exact' });
    expect(firstEq).toHaveBeenCalledWith('id', 'row-uuid');
    expect(finalEq).toHaveBeenCalledWith('user_id', 'admin-1');
  });

  it('returns 404 when the row belongs to another user (count: 0)', async () => {
    const finalEq = vi.fn(async () => ({ error: null, count: 0 }));
    const firstEq = vi.fn(() => ({ eq: finalEq }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'passkey_credentials') return { delete: () => ({ eq: firstEq }) };
      throw new Error(`Unexpected table: ${table}`);
    });
    mockGetPaymentsAuth.mockResolvedValue({
      supabase: { from: mockFrom },
      user: { id: 'admin-1' },
      tokenValid: true,
    });

    const { DELETE } = await import('../route');
    const res = await DELETE(makeReq('http://localhost:3000/api/payments/passkey/credentials?id=row-uuid') as any);

    expect(res.status).toBe(404);
  });
});
