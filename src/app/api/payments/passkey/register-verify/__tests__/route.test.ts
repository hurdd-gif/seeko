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

const mockVerifyRegistrationResponse = vi.fn();
vi.mock('@simplewebauthn/server', () => ({
  verifyRegistrationResponse: mockVerifyRegistrationResponse,
}));

type FromOpts = {
  profile?: { is_admin: boolean } | null;
  challenge?: { challenge: string; expires_at: string } | null;
  insertResult?: { error: { code?: string } | null };
  insertSpy?: ReturnType<typeof vi.fn>;
  deleteSpy?: ReturnType<typeof vi.fn>;
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
            eq: opts.deleteSpy ?? vi.fn(async () => ({ error: null })),
          }),
        }),
      };
    }
    if (table === 'passkey_credentials') {
      const insert = opts.insertSpy ?? vi.fn(async () => opts.insertResult ?? { error: null });
      return { insert };
    }
    throw new Error(`Unexpected table: ${table}`);
  };
}

function makeReq({
  body,
  origin = 'http://localhost:3000',
  ua = 'Mozilla/5.0 (Macintosh; Mac OS X 14_0)',
}: { body?: unknown; origin?: string; ua?: string } = {}) {
  return {
    headers: new Headers({ origin, 'user-agent': ua }),
    url: `${origin}/api/payments/passkey/register-verify`,
    json: async () => (body === undefined ? {} : body),
  };
}

const validAttestation = {
  id: 'cred-id',
  rawId: 'cred-id',
  type: 'public-key',
  response: { transports: ['internal'] },
};

const futureExpiry = () => new Date(Date.now() + 60_000).toISOString();
const pastExpiry = () => new Date(Date.now() - 60_000).toISOString();

describe('POST /api/payments/passkey/register-verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.PAYMENTS_JWT_SECRET = 'a'.repeat(48);
    mockVerifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-id-from-server',
          publicKey: new Uint8Array([1, 2, 3, 4]),
          counter: 0,
        },
      },
    });
  });

  it('returns 401 when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockFrom.mockImplementation(makeFromImpl({}));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { attestation: validAttestation } }) as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockImplementation(makeFromImpl({ profile: { is_admin: false } }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { attestation: validAttestation } }) as any);
    expect(res.status).toBe(403);
  });

  it('returns 400 when attestation is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation(makeFromImpl({ profile: { is_admin: true } }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: {} }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when challenge row is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation(makeFromImpl({ profile: { is_admin: true }, challenge: null }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { attestation: validAttestation } }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when challenge is expired', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      challenge: { challenge: 'c', expires_at: pastExpiry() },
    }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { attestation: validAttestation } }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when verifyRegistrationResponse throws', async () => {
    mockVerifyRegistrationResponse.mockRejectedValueOnce(new Error('boom'));
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      challenge: { challenge: 'c', expires_at: futureExpiry() },
    }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { attestation: validAttestation } }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 409 when credential already exists (Postgres 23505)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      challenge: { challenge: 'c', expires_at: futureExpiry() },
      insertResult: { error: { code: '23505' } },
    }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { attestation: validAttestation } }) as any);
    expect(res.status).toBe(409);
  });

  it('returns 200 with cookie, inserts credential, deletes challenge', async () => {
    const insertSpy = vi.fn(async () => ({ error: null }));
    const deleteSpy = vi.fn(async () => ({ error: null }));
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'k@s.studio' } } });
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      challenge: { challenge: 'c', expires_at: futureExpiry() },
      insertSpy,
      deleteSpy,
    }));

    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { attestation: validAttestation } }) as any);

    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const inserted = insertSpy.mock.calls[0][0];
    expect(inserted.user_id).toBe('admin-1');
    expect(inserted.credential_id).toBe('cred-id-from-server');
    expect(typeof inserted.public_key).toBe('string'); // base64url-encoded
    expect(inserted.public_key.length).toBeGreaterThan(0);
    expect(inserted.counter).toBe(0);
    expect(inserted.device_name).toBe('Mac');

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(mockCookieSet).toHaveBeenCalledTimes(1);
    expect(mockCookieSet.mock.calls[0][0]).toBe('payments-token');
  });

  it('uses provided deviceName when set', async () => {
    const insertSpy = vi.fn(async () => ({ error: null }));
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation(makeFromImpl({
      profile: { is_admin: true },
      challenge: { challenge: 'c', expires_at: futureExpiry() },
      insertSpy,
    }));

    const { POST } = await import('../route');
    await POST(makeReq({ body: { attestation: validAttestation, deviceName: 'Karti Laptop' } }) as any);

    expect(insertSpy.mock.calls[0][0].device_name).toBe('Karti Laptop');
  });
});
