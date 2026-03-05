import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/server
vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

// Mock supabase server client
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

// Mock supabase service client
const mockSignInWithOtp = vi.fn();
const mockServiceFrom = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { signInWithOtp: mockSignInWithOtp },
    from: mockServiceFrom,
  })),
}));

describe('POST /api/invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import('../route');
    const req = { json: async () => ({ email: 'a@b.com' }), nextUrl: { origin: 'http://localhost' } };
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: false } }) }) }) });
    const { POST } = await import('../route');
    const req = { json: async () => ({ email: 'a@b.com' }), nextUrl: { origin: 'http://localhost' } };
    const res = await POST(req as any);
    expect(res.status).toBe(403);
  });

  it('returns 400 when email is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: true } }) }) }) });
    const { POST } = await import('../route');
    const req = { json: async () => ({}), nextUrl: { origin: 'http://localhost' } };
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('calls signInWithOtp and upserts pending_invites on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: true } }) }) }) });
    mockSignInWithOtp.mockResolvedValue({ error: null });
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ upsert: mockUpsert });

    const { POST } = await import('../route');
    const req = {
      json: async () => ({ email: 'new@seeko.studio', department: 'Coding', isContractor: false }),
      nextUrl: { origin: 'http://localhost' },
    };
    const res = await POST(req as any);
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'new@seeko.studio',
      options: { shouldCreateUser: true },
    });
    expect(mockUpsert).toHaveBeenCalledWith(
      { email: 'new@seeko.studio', department: 'Coding', is_contractor: false },
      { onConflict: 'email' }
    );
    expect(res.status).toBe(200);
  });
});
