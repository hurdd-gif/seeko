// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
    redirect: (url: string | URL, status?: number) => ({ redirectUrl: String(url), status: status ?? 307 }),
  },
}));

const mockFrom = vi.fn();
const mockCreateSignedUrl = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({
    from: mockFrom,
    storage: { from: () => ({ createSignedUrl: mockCreateSignedUrl }) },
  }),
}));

function makeSignedInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invite-1',
    token: 'tok-abc',
    status: 'signed',
    template_type: 'preset',
    template_id: 'mutual-nda',
    ...overrides,
  };
}

function makeFromImpl(invite: Record<string, unknown> | null) {
  return () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: invite }) }) }),
  });
}

function makeReq(token: string | null, ip = '10.0.0.1') {
  const params = new URLSearchParams();
  if (token !== null) params.set('token', token);
  return {
    nextUrl: { searchParams: params },
    headers: new Headers({ 'x-forwarded-for': ip }),
  };
}

describe('GET /api/external-signing/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/dl' }, error: null });
  });

  it('returns 400 when no token is supplied', async () => {
    const { GET } = await import('../route');
    const res = await GET(makeReq(null, '10.1.0.1') as any);
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown / non-signing token (never confirms a sibling product token)', async () => {
    mockFrom.mockImplementation(makeFromImpl(null));
    const { GET } = await import('../route');
    const res = await GET(makeReq('nope', '10.1.0.2') as any);
    expect(res.status).toBe(404);
  });

  it('returns 404 when the token belongs to a non-signing row (invoice/doc-share)', async () => {
    mockFrom.mockImplementation(makeFromImpl(makeSignedInvite({ template_type: 'invoice' })));
    const { GET } = await import('../route');
    const res = await GET(makeReq('tok-abc', '10.1.0.3') as any);
    expect(res.status).toBe(404);
  });

  it('returns 409 when the invite exists but is not yet signed', async () => {
    mockFrom.mockImplementation(makeFromImpl(makeSignedInvite({ status: 'verified' })));
    const { GET } = await import('../route');
    const res = await GET(makeReq('tok-abc', '10.1.0.4') as any);
    expect(res.status).toBe(409);
  });

  it('302-redirects to a freshly-minted signed URL for a signed invite', async () => {
    mockFrom.mockImplementation(makeFromImpl(makeSignedInvite()));
    const { GET } = await import('../route');
    const res = await GET(makeReq('tok-abc', '10.1.0.5') as any);
    expect(res.status).toBe(302);
    expect((res as { redirectUrl?: string }).redirectUrl).toBe('https://signed.example/dl');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('external/invite-1/agreement.pdf', 1800);
  });

  it('returns 502 when the signed URL cannot be minted', async () => {
    mockFrom.mockImplementation(makeFromImpl(makeSignedInvite()));
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const { GET } = await import('../route');
    const res = await GET(makeReq('tok-abc', '10.1.0.6') as any);
    expect(res.status).toBe(502);
  });

  it('rate-limits a single IP after too many requests (429)', async () => {
    mockFrom.mockImplementation(makeFromImpl(makeSignedInvite()));
    const { GET } = await import('../route');
    const ip = '10.9.9.9';
    let sawRateLimit = false;
    // Far more than any reasonable per-hour cap; the limiter must eventually 429.
    for (let i = 0; i < 60; i++) {
      const res = await GET(makeReq('tok-abc', ip) as any);
      if (res.status === 429) { sawRateLimit = true; break; }
    }
    expect(sawRateLimit).toBe(true);
  });
});
