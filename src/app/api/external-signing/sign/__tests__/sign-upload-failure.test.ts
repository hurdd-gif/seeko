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
    sections: [{ heading: 'Confidential information', body: 'Body.' }],
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

/** from('external_signing_invites') resolves the invite on select; update is a spy. */
function makeFromImpl(invite: ReturnType<typeof makeInvite> | null, updateSpy: ReturnType<typeof vi.fn>) {
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

const VALID_BODY = { token: 'tok-abc', full_name: 'Karti Patel', address: '1 Main St, City, ST 00000' };

describe('POST /api/external-signing/sign — storage upload failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneratePdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockSendEmail.mockResolvedValue(undefined);
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/ok' }, error: null });
  });

  it('returns 502 when the PDF upload fails', async () => {
    const updateSpy = vi.fn(() => ({ eq: async () => ({}) }));
    mockFrom.mockImplementation(makeFromImpl(makeInvite(), updateSpy));
    mockUpload.mockResolvedValue({ error: { message: 'storage exploded' } });

    const { POST } = await import('../route');
    const res = await POST(makeReq('10.0.0.1', VALID_BODY) as any);

    expect(res.status).toBe(502);
  });

  it('does NOT mark the invite signed when the upload fails', async () => {
    const updateSpy = vi.fn(() => ({ eq: async () => ({}) }));
    mockFrom.mockImplementation(makeFromImpl(makeInvite(), updateSpy));
    mockUpload.mockResolvedValue({ error: { message: 'storage exploded' } });

    const { POST } = await import('../route');
    await POST(makeReq('10.0.0.2', VALID_BODY) as any);

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('does NOT send the signed-copy email when the upload fails', async () => {
    const updateSpy = vi.fn(() => ({ eq: async () => ({}) }));
    mockFrom.mockImplementation(makeFromImpl(makeInvite(), updateSpy));
    mockUpload.mockResolvedValue({ error: { message: 'storage exploded' } });

    const { POST } = await import('../route');
    await POST(makeReq('10.0.0.3', VALID_BODY) as any);

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('still completes (200) and marks signed when the upload succeeds', async () => {
    const updateSpy = vi.fn(() => ({ eq: async () => ({}) }));
    mockFrom.mockImplementation(makeFromImpl(makeInvite(), updateSpy));
    mockUpload.mockResolvedValue({ error: null });

    const { POST } = await import('../route');
    const res = await POST(makeReq('10.0.0.4', VALID_BODY) as any);

    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'signed' }));
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
