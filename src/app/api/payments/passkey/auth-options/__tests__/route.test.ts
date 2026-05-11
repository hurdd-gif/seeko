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

const mockGenerateAuthenticationOptions = vi.fn();
vi.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: mockGenerateAuthenticationOptions,
}));

function makeFromImpl({
  profile,
  creds,
  upsertSpy,
  upsertResult,
}: {
  profile?: { is_admin: boolean } | null;
  creds?: Array<{ credential_id: string; transports: string[] | null }>;
  upsertSpy?: ReturnType<typeof vi.fn>;
  upsertResult?: { error: unknown };
}) {
  return (table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: profile ?? null }),
          }),
        }),
      };
    }
    if (table === 'passkey_credentials') {
      return {
        select: () => ({
          eq: async () => ({ data: creds ?? [] }),
        }),
      };
    }
    if (table === 'passkey_challenges') {
      return {
        upsert: upsertSpy ?? vi.fn(async () => upsertResult ?? { error: null }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  };
}

function makeReq(origin = 'http://localhost:3000') {
  return {
    headers: new Headers({ origin }),
    url: `${origin}/api/payments/passkey/auth-options`,
  };
}

describe('POST /api/payments/passkey/auth-options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    mockGenerateAuthenticationOptions.mockResolvedValue({
      challenge: 'auth-challenge',
      timeout: 60000,
      rpId: 'localhost',
      allowCredentials: [],
      userVerification: 'preferred',
    });
  });

  it('returns 401 when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockFrom.mockImplementation(makeFromImpl({}));
    const { POST } = await import('../route');
    const res = await POST(makeReq() as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockImplementation(makeFromImpl({ profile: { is_admin: false } }));
    const { POST } = await import('../route');
    const res = await POST(makeReq() as any);
    expect(res.status).toBe(403);
  });

  it('returns 200 with allowCredentials derived from user creds and upserts auth challenge', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    const upsertSpy = vi.fn(async () => ({ error: null }));
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      creds: [
        { credential_id: 'cred-a', transports: ['internal'] },
        { credential_id: 'cred-b', transports: null },
      ],
      upsertSpy,
    }));

    const { POST } = await import('../route');
    const res = await POST(makeReq() as any);

    expect(res.status).toBe(200);
    expect(mockGenerateAuthenticationOptions).toHaveBeenCalledTimes(1);
    const args = mockGenerateAuthenticationOptions.mock.calls[0][0];
    expect(args.rpID).toBe('localhost');
    expect(args.allowCredentials).toEqual([
      { id: 'cred-a', transports: ['internal'] },
      { id: 'cred-b', transports: undefined },
    ]);

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const upsertArg = upsertSpy.mock.calls[0][0];
    expect(upsertArg.user_id).toBe('admin-1');
    expect(upsertArg.kind).toBe('auth');
    expect(upsertArg.challenge).toBe('auth-challenge');
  });

  it('returns 200 with empty allowCredentials when user has no passkeys', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      creds: [],
    }));

    const { POST } = await import('../route');
    const res = await POST(makeReq() as any);

    expect(res.status).toBe(200);
    expect(mockGenerateAuthenticationOptions).toHaveBeenCalledTimes(1);
    expect(mockGenerateAuthenticationOptions.mock.calls[0][0].allowCredentials).toEqual([]);
  });
});
