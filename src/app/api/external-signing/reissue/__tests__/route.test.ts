// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({ from: mockFrom }),
}));

const mockSendInvite = vi.fn();
const mockNotify = vi.fn();
vi.mock('@/lib/email', () => ({
  sendExternalInviteEmail: (...args: unknown[]) => mockSendInvite(...args),
  sendReissueNotificationEmail: (...args: unknown[]) => mockNotify(...args),
}));

vi.mock('@/lib/external-agreement-templates', () => ({
  getTemplateById: () => ({ name: 'Mutual NDA', sections: [] }),
}));

// bcryptjs is slow + native; the hash value is opaque to the route, so stub it.
vi.mock('bcryptjs', () => ({
  default: { hash: async () => 'hashed-code' },
}));

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

type InviteStatus = 'pending' | 'verified' | 'signed' | 'expired' | 'revoked';
type TemplateType = 'preset' | 'custom' | 'invoice' | 'doc_share';

function makeInvite(overrides: { status?: InviteStatus; template_type?: TemplateType } = {}) {
  return {
    id: 'invite-1',
    token: 'old-token-aaa',
    status: overrides.status ?? 'expired',
    expires_at: PAST,
    recipient_email: 'signer@example.com',
    template_type: overrides.template_type ?? 'preset',
    template_id: 'mutual-nda',
    custom_title: null,
    personal_note: null,
  };
}

/** from('external_signing_invites') resolves the invite on select; update is the captured spy. */
function makeFromImpl(
  invite: ReturnType<typeof makeInvite> | null,
  updateSpy: ReturnType<typeof vi.fn>,
) {
  return () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: invite }) }) }),
    update: updateSpy,
  });
}

function makeReq(ip: string, body: Record<string, unknown>) {
  return {
    headers: new Headers({ 'x-forwarded-for': ip, 'user-agent': 'vitest' }),
    json: async () => body,
  };
}

describe('POST /api/external-signing/reissue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendInvite.mockResolvedValue(undefined);
    mockNotify.mockResolvedValue(undefined);
  });

  it('returns 400 when no token is supplied', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeReq('10.2.0.1', {}) as any);
    expect(res.status).toBe(400);
  });

  it('returns 404 when the token matches no invite', async () => {
    mockFrom.mockImplementation(makeFromImpl(null, vi.fn()));
    const { POST } = await import('../route');
    const res = await POST(makeReq('10.2.0.2', { token: 'nope' }) as any);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-signing invite (invoice / doc_share) — no cross-product leak', async () => {
    const updateSpy = vi.fn(() => ({ eq: async () => ({}) }));
    mockFrom.mockImplementation(makeFromImpl(makeInvite({ template_type: 'invoice' }), updateSpy));
    const { POST } = await import('../route');
    const res = await POST(makeReq('10.2.0.3', { token: 'old-token-aaa' }) as any);
    expect(res.status).toBe(404);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(mockSendInvite).not.toHaveBeenCalled();
  });

  it('returns 409 when the invite is already signed', async () => {
    const updateSpy = vi.fn(() => ({ eq: async () => ({}) }));
    mockFrom.mockImplementation(makeFromImpl(makeInvite({ status: 'signed' }), updateSpy));
    const { POST } = await import('../route');
    const res = await POST(makeReq('10.2.0.4', { token: 'old-token-aaa' }) as any);
    expect(res.status).toBe(409);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('returns 403 when the invite was revoked (must stay dead — admin killed it)', async () => {
    const updateSpy = vi.fn(() => ({ eq: async () => ({}) }));
    mockFrom.mockImplementation(makeFromImpl(makeInvite({ status: 'revoked' }), updateSpy));
    const { POST } = await import('../route');
    const res = await POST(makeReq('10.2.0.5', { token: 'old-token-aaa' }) as any);
    expect(res.status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(mockSendInvite).not.toHaveBeenCalled();
  });

  it('returns 409 when the link is still active (pending)', async () => {
    const updateSpy = vi.fn(() => ({ eq: async () => ({}) }));
    mockFrom.mockImplementation(makeFromImpl(makeInvite({ status: 'pending' }), updateSpy));
    const { POST } = await import('../route');
    const res = await POST(makeReq('10.2.0.6', { token: 'old-token-aaa' }) as any);
    expect(res.status).toBe(409);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('returns 409 when the link is still active (verified)', async () => {
    const updateSpy = vi.fn(() => ({ eq: async () => ({}) }));
    mockFrom.mockImplementation(makeFromImpl(makeInvite({ status: 'verified' }), updateSpy));
    const { POST } = await import('../route');
    const res = await POST(makeReq('10.2.0.7', { token: 'old-token-aaa' }) as any);
    expect(res.status).toBe(409);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('rate-limits repeated reissues from one IP (429 once the cap is exceeded)', async () => {
    mockFrom.mockImplementation(makeFromImpl(makeInvite({ status: 'expired' }), vi.fn(() => ({ eq: async () => ({}) }))));
    const { POST } = await import('../route');
    const ip = '10.2.0.99';
    let last;
    // Cap is 3/hour; the 4th request from the same IP must be blocked.
    for (let i = 0; i < 4; i++) {
      last = await POST(makeReq(ip, { token: 'old-token-aaa' }) as any);
    }
    expect(last!.status).toBe(429);
  });

  it('reissues an expired invite: 200, new token + future expiry + reset to pending, re-sends link, notifies admin', async () => {
    let captured: Record<string, unknown> | null = null;
    const updateSpy = vi.fn((arg: Record<string, unknown>) => {
      captured = arg;
      return { eq: async () => ({}) };
    });
    mockFrom.mockImplementation(makeFromImpl(makeInvite({ status: 'expired' }), updateSpy));

    const { POST } = await import('../route');
    const res = await POST(makeReq('10.2.0.10', { token: 'old-token-aaa' }) as any);

    expect(res.status).toBe(200);

    // DB reset
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', verification_attempts: 0, verified_at: null }),
    );
    const c = captured as unknown as { token: string; expires_at: string };
    expect(c.token).not.toBe('old-token-aaa');
    expect(c.token.length).toBeGreaterThan(20);
    expect(new Date(c.expires_at).getTime()).toBeGreaterThan(Date.now());

    // Fresh signing link emailed to the recipient with the NEW token
    expect(mockSendInvite).toHaveBeenCalledTimes(1);
    expect(mockSendInvite).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: 'signer@example.com', token: c.token }),
    );

    // Admin notified
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it('returns 502 and does NOT touch the DB when the re-send email fails', async () => {
    const updateSpy = vi.fn(() => ({ eq: async () => ({}) }));
    mockFrom.mockImplementation(makeFromImpl(makeInvite({ status: 'expired' }), updateSpy));
    mockSendInvite.mockRejectedValue(new Error('resend down'));

    const { POST } = await import('../route');
    const res = await POST(makeReq('10.2.0.11', { token: 'old-token-aaa' }) as any);

    expect(res.status).toBe(502);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
