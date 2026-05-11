// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCookieSet = vi.fn();
vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
      cookies: { set: mockCookieSet },
    }),
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

const mockVerifyAuthenticationResponse = vi.fn();
vi.mock('@simplewebauthn/server', () => ({
  verifyAuthenticationResponse: mockVerifyAuthenticationResponse,
}));

type CredentialRow = {
  id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
};

type FromOpts = {
  profile?: { is_admin: boolean } | null;
  challenge?: { challenge: string; expires_at: string } | null;
  credential?: CredentialRow | null;
  credentialDeleteSpy?: ReturnType<typeof vi.fn>;
  credentialUpdateSpy?: ReturnType<typeof vi.fn>;
  challengeDeleteSpy?: ReturnType<typeof vi.fn>;
};

function makeFromImpl(opts: FromOpts) {
  return (table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: opts.profile ?? null }),
          }),
        }),
      };
    }
    if (table === 'passkey_challenges') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: opts.challenge ?? null }),
            }),
          }),
        }),
        delete: () => ({
          eq: () => ({
            eq: opts.challengeDeleteSpy ?? vi.fn(async () => ({ error: null })),
          }),
        }),
      };
    }
    if (table === 'passkey_credentials') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: opts.credential ?? null }),
            }),
          }),
        }),
        delete: () => ({
          eq: opts.credentialDeleteSpy ?? vi.fn(async () => ({ error: null })),
        }),
        update: opts.credentialUpdateSpy ?? vi.fn(() => ({
          eq: async () => ({ error: null }),
        })),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  };
}

function makeReq({ body, origin = 'http://localhost:3000' }: { body?: unknown; origin?: string } = {}) {
  return {
    headers: new Headers({ origin }),
    url: `${origin}/api/payments/passkey/auth-verify`,
    json: async () => (body === undefined ? {} : body),
  };
}

const validAssertion = {
  id: 'cred-a',
  rawId: 'cred-a',
  type: 'public-key',
  response: {},
};

const future = () => new Date(Date.now() + 60_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();

const storedCredential: CredentialRow = {
  id: 'row-uuid',
  credential_id: 'cred-a',
  public_key: Buffer.from(new Uint8Array([1, 2, 3, 4])).toString('base64url'),
  counter: 5,
  transports: ['internal'],
};

describe('POST /api/payments/passkey/auth-verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.PAYMENTS_JWT_SECRET = 'a'.repeat(48);
    mockVerifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 6 },
    });
  });

  it('returns 401 when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockFrom.mockImplementation(makeFromImpl({}));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { assertion: validAssertion } }) as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockImplementation(makeFromImpl({ profile: { is_admin: false } }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { assertion: validAssertion } }) as any);
    expect(res.status).toBe(403);
  });

  it('returns 400 when assertion is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation(makeFromImpl({ profile: { is_admin: true } }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: {} }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when challenge row is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      challenge: null,
    }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { assertion: validAssertion } }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when challenge is expired', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      challenge: { challenge: 'c', expires_at: past() },
    }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { assertion: validAssertion } }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when credential not found for this user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      challenge: { challenge: 'c', expires_at: future() },
      credential: null,
    }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { assertion: validAssertion } }) as any);
    expect(res.status).toBe(400);
  });

  it('detects cloned credential (newCounter <= storedCounter) and returns 401 untrusted-device', async () => {
    mockVerifyAuthenticationResponse.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: { newCounter: 3 }, // stored counter is 5
    });
    const credentialDeleteSpy = vi.fn(() => ({
      eq: async () => ({ error: null }),
    }));
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      challenge: { challenge: 'c', expires_at: future() },
      credential: storedCredential,
      credentialDeleteSpy,
    }));

    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { assertion: validAssertion } }) as any);

    expect(res.status).toBe(401);
    expect((res.body as { error?: string }).error).toBe('untrusted-device');
    expect(credentialDeleteSpy).toHaveBeenCalledTimes(1);
  });

  it('returns 200 on success: cookie set, counter updated, challenge deleted', async () => {
    const credentialUpdateSpy = vi.fn(() => ({
      eq: async () => ({ error: null }),
    }));
    const challengeDeleteSpy = vi.fn(async () => ({ error: null }));
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      challenge: { challenge: 'c', expires_at: future() },
      credential: storedCredential,
      credentialUpdateSpy,
      challengeDeleteSpy,
    }));

    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { assertion: validAssertion } }) as any);

    expect(res.status).toBe(200);

    expect(credentialUpdateSpy).toHaveBeenCalledTimes(1);
    const updatePayload = (credentialUpdateSpy as any).mock.calls[0][0];
    expect(updatePayload.counter).toBe(6);
    expect(typeof updatePayload.last_used_at).toBe('string');

    expect(challengeDeleteSpy).toHaveBeenCalledTimes(1);
    expect(mockCookieSet).toHaveBeenCalledTimes(1);
    expect(mockCookieSet.mock.calls[0][0]).toBe('payments-token');

    // verifyAuthenticationResponse should receive decoded public key
    expect(mockVerifyAuthenticationResponse).toHaveBeenCalledTimes(1);
    const verifyArgs = mockVerifyAuthenticationResponse.mock.calls[0][0];
    expect(verifyArgs.credential.publicKey).toBeInstanceOf(Uint8Array);
    expect(Array.from(verifyArgs.credential.publicKey as Uint8Array)).toEqual([1, 2, 3, 4]);
    expect(verifyArgs.credential.counter).toBe(5);
  });

  it('returns 400 when verifyAuthenticationResponse throws', async () => {
    mockVerifyAuthenticationResponse.mockRejectedValueOnce(new Error('boom'));
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      challenge: { challenge: 'c', expires_at: future() },
      credential: storedCredential,
    }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { assertion: validAssertion } }) as any);
    expect(res.status).toBe(400);
  });
});
