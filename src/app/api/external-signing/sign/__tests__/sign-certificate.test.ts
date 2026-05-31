// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

const mockFrom = vi.fn();
const mockUpload = vi.fn();
const mockCreateSignedUrl = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({
    from: mockFrom,
    storage: { from: () => ({ upload: mockUpload, createSignedUrl: mockCreateSignedUrl }) },
  }),
}));

const mockGeneratePdf = vi.fn();
vi.mock('@/lib/agreement-pdf', () => ({
  generateAgreementPdf: mockGeneratePdf,
}));

const mockSendEmail = vi.fn();
vi.mock('@/lib/email', () => ({
  sendAgreementEmail: mockSendEmail,
}));

vi.mock('@/lib/external-agreement-templates', () => ({
  getTemplateById: () => ({
    name: 'Mutual NDA',
    sections: [{ number: 1, title: 'Confidentiality', content: '<p>Body.</p>' }],
  }),
  withGuardianSection: (s: unknown) => s,
}));

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

function makeInvite() {
  return {
    id: 'invite-1',
    token: 'tok-abc',
    status: 'verified',
    expires_at: FUTURE,
    recipient_email: 'signer@example.com',
    template_type: 'preset',
    template_id: 'mutual-nda',
    custom_sections: null,
    custom_title: null,
    personal_note: null,
    is_guardian_signing: false,
  };
}

function makeFromImpl(invite: ReturnType<typeof makeInvite> | null, updateSpy: ReturnType<typeof vi.fn>) {
  return () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: invite }) }) }),
    update: updateSpy,
  });
}

function makeReq(ip: string, ua: string, body: Record<string, unknown>) {
  return {
    headers: new Headers({ 'x-forwarded-for': ip, 'user-agent': ua }),
    json: async () => body,
  };
}

const VALID_BODY = { token: 'tok-abc', full_name: 'Karti Patel', address: '1 Main St, City, ST 00000' };

describe('POST /api/external-signing/sign — certificate + download URL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneratePdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockSendEmail.mockResolvedValue(undefined);
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/abc' }, error: null });
  });

  it('returns a downloadUrl from a freshly-minted signed URL on success', async () => {
    mockFrom.mockImplementation(makeFromImpl(makeInvite(), vi.fn(() => ({ eq: async () => ({}) }))));

    const { POST } = await import('../route');
    const res = await POST(makeReq('10.0.0.1', 'vitest-ua', VALID_BODY) as any);

    expect(res.status).toBe(200);
    expect((res.body as { downloadUrl?: string }).downloadUrl).toBe('https://signed.example/abc');
  });

  it('mints the signed URL for the invite path with a 30-minute (1800s) TTL', async () => {
    mockFrom.mockImplementation(makeFromImpl(makeInvite(), vi.fn(() => ({ eq: async () => ({}) }))));

    const { POST } = await import('../route');
    await POST(makeReq('10.0.0.2', 'vitest-ua', VALID_BODY) as any);

    expect(mockCreateSignedUrl).toHaveBeenCalledWith('external/invite-1/agreement.pdf', 1800);
  });

  it('passes the audit trail (envelopeId, integrity hash, ip, user-agent) into the PDF certificate', async () => {
    mockFrom.mockImplementation(makeFromImpl(makeInvite(), vi.fn(() => ({ eq: async () => ({}) }))));

    const { POST } = await import('../route');
    await POST(makeReq('203.0.113.9', 'Mozilla/5.0 Test', VALID_BODY) as any);

    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        envelopeId: 'invite-1',
        integrityHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        ip: '203.0.113.9',
        userAgent: 'Mozilla/5.0 Test',
      }),
    );
  });

  it('still succeeds (200) with downloadUrl null when the signed URL cannot be minted', async () => {
    // A failed convenience-URL mint must not fail the signing the user already completed.
    mockFrom.mockImplementation(makeFromImpl(makeInvite(), vi.fn(() => ({ eq: async () => ({}) }))));
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'nope' } });

    const { POST } = await import('../route');
    const res = await POST(makeReq('10.0.0.3', 'vitest-ua', VALID_BODY) as any);

    expect(res.status).toBe(200);
    expect((res.body as { downloadUrl?: string | null }).downloadUrl).toBeNull();
  });
});
