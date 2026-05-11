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

const mockGetPaymentsAuth = vi.fn();
vi.mock('@/lib/payments-auth', () => ({
  getPaymentsAuth: mockGetPaymentsAuth,
}));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({ from: mockFrom }),
}));

const mockVerifyRegistrationResponse = vi.fn();
vi.mock('@simplewebauthn/server', () => ({
  verifyRegistrationResponse: mockVerifyRegistrationResponse,
}));

type FromOpts = {
  existing?: Array<{ id: string }>;
  challenge?: { challenge: string; expires_at: string } | null;
  insertResult?: { error: { code?: string } | null };
  insertSpy?: ReturnType<typeof vi.fn>;
  deleteSpy?: ReturnType<typeof vi.fn>;
};

function makeFromImpl(opts: FromOpts) {
  return (table: string) => {
    if (table === 'passkey_credentials') {
      const insert = opts.insertSpy ?? vi.fn(async () => opts.insertResult ?? { error: null });
      return {
        select: () => ({
          eq: async () => ({ data: opts.existing ?? [] }),
        }),
        insert,
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
    mockGetPaymentsAuth.mockResolvedValue({ user: null, isAdmin: false, tokenValid: false });
    mockFrom.mockImplementation(makeFromImpl({}));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { attestation: validAttestation } }) as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    mockGetPaymentsAuth.mockResolvedValue({
      user: { id: 'u1', email: 'u1@seeko.studio' },
      isAdmin: false,
      tokenValid: false,
    });
    mockFrom.mockImplementation(makeFromImpl({}));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { attestation: validAttestation } }) as any);
    expect(res.status).toBe(403);
  });

  it('returns 401 when no valid payments token (blocks first-device bootstrap)', async () => {
    mockGetPaymentsAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'karti@seeko.studio' },
      isAdmin: true,
      tokenValid: false,
    });
    mockFrom.mockImplementation(makeFromImpl({}));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { attestation: validAttestation } }) as any);
    expect(res.status).toBe(401);
    expect(mockVerifyRegistrationResponse).not.toHaveBeenCalled();
  });

  it('returns 400 when attestation is missing', async () => {
    mockGetPaymentsAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'karti@seeko.studio' },
      isAdmin: true,
      tokenValid: true,
    });
    mockFrom.mockImplementation(makeFromImpl({}));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: {} }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when challenge row is missing', async () => {
    mockGetPaymentsAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'karti@seeko.studio' },
      isAdmin: true,
      tokenValid: true,
    });
    mockFrom.mockImplementation(makeFromImpl({ challenge: null }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { attestation: validAttestation } }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when challenge is expired', async () => {
    mockGetPaymentsAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'karti@seeko.studio' },
      isAdmin: true,
      tokenValid: true,
    });
    mockFrom.mockImplementation(makeFromImpl({
      challenge: { challenge: 'c', expires_at: pastExpiry() },
    }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { attestation: validAttestation } }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when verifyRegistrationResponse throws', async () => {
    mockVerifyRegistrationResponse.mockRejectedValueOnce(new Error('boom'));
    mockGetPaymentsAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'karti@seeko.studio' },
      isAdmin: true,
      tokenValid: true,
    });
    mockFrom.mockImplementation(makeFromImpl({
      challenge: { challenge: 'c', expires_at: futureExpiry() },
    }));
    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { attestation: validAttestation } }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 409 when credential already exists (Postgres 23505)', async () => {
    mockGetPaymentsAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'karti@seeko.studio' },
      isAdmin: true,
      tokenValid: true,
    });
    mockFrom.mockImplementation(makeFromImpl({
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
    mockGetPaymentsAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'k@s.studio' },
      isAdmin: true,
      tokenValid: true,
    });
    mockFrom.mockImplementation(makeFromImpl({
      challenge: { challenge: 'c', expires_at: futureExpiry() },
      insertSpy,
      deleteSpy,
    }));

    const { POST } = await import('../route');
    const res = await POST(makeReq({ body: { attestation: validAttestation } }) as any);

    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const inserted = (insertSpy as any).mock.calls[0][0];
    expect(inserted.user_id).toBe('admin-1');
    expect(inserted.credential_id).toBe('cred-id-from-server');
    expect(typeof inserted.public_key).toBe('string'); // base64url-encoded
    expect(inserted.public_key.length).toBeGreaterThan(0);
    expect(inserted.counter).toBe(0);
    expect(inserted.device_name).toBe('Mac');
    expect(inserted.transports).toEqual(['internal']);

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(mockCookieSet).toHaveBeenCalledTimes(1);
    expect((mockCookieSet as any).mock.calls[0][0]).toBe('payments-token');
  });

  it('uses provided deviceName when set', async () => {
    const insertSpy = vi.fn(async () => ({ error: null }));
    mockGetPaymentsAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'k@s.studio' },
      isAdmin: true,
      tokenValid: true,
    });
    mockFrom.mockImplementation(makeFromImpl({
      challenge: { challenge: 'c', expires_at: futureExpiry() },
      insertSpy,
    }));

    const { POST } = await import('../route');
    await POST(makeReq({ body: { attestation: validAttestation, deviceName: 'Karti Laptop' } }) as any);

    expect((insertSpy as any).mock.calls[0][0].device_name).toBe('Karti Laptop');
  });
});
