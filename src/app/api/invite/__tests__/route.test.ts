import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextRequest: class {},
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

const mockSignInWithOtp = vi.fn();
const mockGetUserByEmail = vi.fn();
const mockInviteUserByEmail = vi.fn();
const mockServiceFrom = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: vi.fn(() => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
      admin: {
        getUserByEmail: mockGetUserByEmail,
        inviteUserByEmail: mockInviteUserByEmail,
      },
    },
    from: mockServiceFrom,
  })),
}));

describe('POST /api/invite', () => {
  let mockUpsert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert = vi.fn().mockResolvedValue({ error: null });
    mockServiceFrom.mockImplementation(() => ({ upsert: mockUpsert }));
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import('../route');
    const req = { json: async () => ({ email: 'a@b.com' }), nextUrl: { origin: 'http://localhost' }, headers: new Headers() };
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: false } }) }) }) });
    const { POST } = await import('../route');
    const req = { json: async () => ({ email: 'a@b.com' }), nextUrl: { origin: 'http://localhost' }, headers: new Headers() };
    const res = await POST(req as any);
    expect(res.status).toBe(403);
  });

  it('returns 400 when email is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: true } }) }) }) });
    const { POST } = await import('../route');
    const req = { json: async () => ({}), nextUrl: { origin: 'http://localhost' }, headers: new Headers() };
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when email format is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: true } }) }) }) });
    const { POST } = await import('../route');
    const req = { json: async () => ({ email: 'not-an-email' }), nextUrl: { origin: 'http://localhost' }, headers: new Headers() };
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('upserts pending_invites first then calls inviteUserByEmail for new user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: true } }) }) }) });
    mockGetUserByEmail.mockResolvedValue({ data: { user: null } });
    mockInviteUserByEmail.mockResolvedValue({ data: { user: {} }, error: null });

    const { POST } = await import('../route');
    const req = {
      json: async () => ({ email: 'new@seeko.studio', department: 'Coding', isContractor: false }),
      nextUrl: { origin: 'http://localhost' },
      headers: new Headers({ 'x-forwarded-for': '192.168.1.1' }),
    };
    const res = await POST(req as any);

    expect(mockUpsert).toHaveBeenCalledWith(
      { email: 'new@seeko.studio', department: 'Coding', is_contractor: false, is_investor: false },
      { onConflict: 'email' }
    );
    expect(mockGetUserByEmail).toHaveBeenCalledWith('new@seeko.studio');
    expect(mockInviteUserByEmail).toHaveBeenCalledWith('new@seeko.studio', { redirectTo: 'http://localhost/login' });
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('upserts pending_invites with is_investor true and invites new user as investor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: true } }) }) }) });
    mockGetUserByEmail.mockResolvedValue({ data: { user: null } });
    mockInviteUserByEmail.mockResolvedValue({ data: { user: {} }, error: null });

    const { POST } = await import('../route');
    const req = {
      json: async () => ({ email: 'investor@seeko.studio', department: null, isContractor: false, isInvestor: true }),
      nextUrl: { origin: 'https://app.example.com' },
      headers: new Headers({ 'x-forwarded-for': '192.168.2.2' }),
    };
    const res = await POST(req as any);

    expect(mockUpsert).toHaveBeenCalledWith(
      { email: 'investor@seeko.studio', department: null, is_contractor: false, is_investor: true },
      { onConflict: 'email' }
    );
    expect(mockInviteUserByEmail).toHaveBeenCalledWith('investor@seeko.studio', { redirectTo: 'https://app.example.com/login' });
    expect(res.status).toBe(200);
  });

  it('calls signInWithOtp for existing user and upserts pending_invites first', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: true } }) }) }) });
    mockGetUserByEmail.mockResolvedValue({ data: { user: { id: 'existing-id' } } });
    mockSignInWithOtp.mockResolvedValue({ error: null });

    const { POST } = await import('../route');
    const req = {
      json: async () => ({ email: 'Existing@Seeko.Studio', department: 'Coding', isContractor: true }),
      nextUrl: { origin: 'http://localhost' },
      headers: new Headers({ 'x-forwarded-for': '192.168.2.3' }),
    };
    const res = await POST(req as any);

    expect(mockUpsert).toHaveBeenCalledWith(
      { email: 'existing@seeko.studio', department: 'Coding', is_contractor: true, is_investor: false },
      { onConflict: 'email' }
    );
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'existing@seeko.studio',
      options: { shouldCreateUser: false },
    });
    expect(mockInviteUserByEmail).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
