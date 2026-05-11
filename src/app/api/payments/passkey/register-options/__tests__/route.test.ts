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

const mockGenerateRegistrationOptions = vi.fn();
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: mockGenerateRegistrationOptions,
}));

function makeFromImpl({
  profile,
  existing,
  upsertResult,
  upsertSpy,
}: {
  profile?: { is_admin: boolean } | null;
  existing?: Array<{ credential_id: string }>;
  upsertResult?: { error: unknown };
  upsertSpy?: ReturnType<typeof vi.fn>;
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
          eq: async () => ({ data: existing ?? [] }),
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
    url: `${origin}/api/payments/passkey/register-options`,
  };
}

describe('POST /api/payments/passkey/register-options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    mockGenerateRegistrationOptions.mockResolvedValue({
      challenge: 'challenge-base64url',
      rp: { name: 'SEEKO Studio', id: 'localhost' },
      user: { id: 'uid', name: 'admin@seeko.studio', displayName: 'admin@seeko.studio' },
      pubKeyCredParams: [],
    });
  });

  it('returns 401 when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockFrom.mockImplementation(makeFromImpl({}));
    const { POST } = await import('../route');
    const res = await POST(makeReq() as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 when signed-in user is not admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'u1@seeko.studio' } } });
    mockFrom.mockImplementation(makeFromImpl({ profile: { is_admin: false } }));
    const { POST } = await import('../route');
    const res = await POST(makeReq() as any);
    expect(res.status).toBe(403);
  });

  it('returns 200 and upserts a register challenge for admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'karti@seeko.studio' } } });
    const upsertSpy = vi.fn(async () => ({ error: null }));
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      existing: [],
      upsertSpy,
    }));

    const { POST } = await import('../route');
    const res = await POST(makeReq() as any);

    expect(res.status).toBe(200);
    expect(mockGenerateRegistrationOptions).toHaveBeenCalledTimes(1);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const upsertArg = (upsertSpy as any).mock.calls[0][0];
    expect(upsertArg.user_id).toBe('admin-1');
    expect(upsertArg.kind).toBe('register');
    expect(upsertArg.challenge).toBe('challenge-base64url');
    expect(typeof upsertArg.expires_at).toBe('string');
  });

  it('passes existing credentials as excludeCredentials', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'karti@seeko.studio' } } });
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      existing: [{ credential_id: 'cred-a' }, { credential_id: 'cred-b' }],
    }));

    const { POST } = await import('../route');
    await POST(makeReq() as any);

    expect(mockGenerateRegistrationOptions).toHaveBeenCalledTimes(1);
    const args = mockGenerateRegistrationOptions.mock.calls[0][0];
    expect(args.excludeCredentials).toEqual([
      { id: 'cred-a' },
      { id: 'cred-b' },
    ]);
    expect(args.rpName).toBe('SEEKO Studio');
    expect(args.rpID).toBe('localhost');
    expect(args.userName).toBe('karti@seeko.studio');
  });
});
