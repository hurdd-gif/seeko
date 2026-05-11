// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

const mockGetPaymentsAuth = vi.fn();
vi.mock('@/lib/payments-auth', () => ({
  getPaymentsAuth: mockGetPaymentsAuth,
}));

const mockFrom = vi.fn();
const mockGenerateRegistrationOptions = vi.fn();
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: mockGenerateRegistrationOptions,
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({ from: mockFrom }),
}));

function makeFromImpl({
  existing,
  upsertResult,
  upsertSpy,
}: {
  existing?: Array<{ credential_id: string; transports?: string[] | null }>;
  upsertResult?: { error: unknown };
  upsertSpy?: ReturnType<typeof vi.fn>;
}) {
  return (table: string) => {
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
    mockGenerateRegistrationOptions.mockResolvedValue({
      challenge: 'challenge-base64url',
      rp: { name: 'SEEKO Studio', id: 'localhost' },
      user: { id: 'uid', name: 'admin@seeko.studio', displayName: 'admin@seeko.studio' },
      pubKeyCredParams: [],
    });
  });

  it('returns 401 when not signed in', async () => {
    mockGetPaymentsAuth.mockResolvedValue({ user: null, isAdmin: false, tokenValid: false });
    mockFrom.mockImplementation(makeFromImpl({}));
    const { POST } = await import('../route');
    const res = await POST(makeReq() as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 when signed-in user is not admin', async () => {
    mockGetPaymentsAuth.mockResolvedValue({
      user: { id: 'u1', email: 'u1@seeko.studio' },
      isAdmin: false,
      tokenValid: false,
    });
    mockFrom.mockImplementation(makeFromImpl({}));
    const { POST } = await import('../route');
    const res = await POST(makeReq() as any);
    expect(res.status).toBe(403);
  });

  it('returns 401 when no valid payments token (blocks first-device bootstrap)', async () => {
    mockGetPaymentsAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'karti@seeko.studio' },
      isAdmin: true,
      tokenValid: false,
    });
    mockFrom.mockImplementation(makeFromImpl({ existing: [] }));

    const { POST } = await import('../route');
    const res = await POST(makeReq() as any);

    expect(res.status).toBe(401);
    expect(mockGenerateRegistrationOptions).not.toHaveBeenCalled();
  });

  it('returns 200 and upserts a register challenge when token is valid', async () => {
    mockGetPaymentsAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'karti@seeko.studio' },
      isAdmin: true,
      tokenValid: true,
    });
    const upsertSpy = vi.fn(async () => ({ error: null }));
    mockFrom.mockImplementation(makeFromImpl({ existing: [], upsertSpy }));

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

  it('passes existing credentials with transports as excludeCredentials when token valid', async () => {
    mockGetPaymentsAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'karti@seeko.studio' },
      isAdmin: true,
      tokenValid: true,
    });
    mockFrom.mockImplementation(makeFromImpl({
      existing: [
        { credential_id: 'cred-a', transports: ['internal'] },
        { credential_id: 'cred-b', transports: null },
      ],
    }));

    const { POST } = await import('../route');
    await POST(makeReq() as any);

    expect(mockGenerateRegistrationOptions).toHaveBeenCalledTimes(1);
    const args = mockGenerateRegistrationOptions.mock.calls[0][0];
    expect(args.excludeCredentials).toEqual([
      { id: 'cred-a', transports: ['internal'] },
      { id: 'cred-b' },
    ]);
    expect(args.rpName).toBe('SEEKO Studio');
    expect(args.rpID).toBe('localhost');
    expect(args.userName).toBe('karti@seeko.studio');
    expect(args.authenticatorSelection.userVerification).toBe('required');
  });
});
