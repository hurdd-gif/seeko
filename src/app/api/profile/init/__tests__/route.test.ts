import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

const mockServiceFrom = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

describe('POST /api/profile/init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import('../route');
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('updates profile and deletes pending_invite on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'new@seeko.studio' } } });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { department: 'Coding', is_contractor: false, is_investor: false },
          error: null,
        }),
      }),
    });
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'pending_invites') return { select: mockSelect, delete: mockDelete };
      if (table === 'profiles') return { update: mockUpdate };
      return {};
    });

    const { POST } = await import('../route');
    const res = await POST();
    expect(mockUpdate).toHaveBeenCalledWith({
      department: 'Coding',
      is_contractor: false,
      is_investor: false,
      must_set_password: true,
    });
    expect(res.status).toBe(200);
  });

  it('returns 200 with no-op when no pending invite exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'new@seeko.studio' } } });
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }),
    });
    mockServiceFrom.mockReturnValue({ select: mockSelect });
    const { POST } = await import('../route');
    const res = await POST();
    expect(res.status).toBe(200);
  });
});
