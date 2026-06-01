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

function makeReq(body: Record<string, unknown>) {
  return {
    headers: new Headers({ 'x-forwarded-for': '10.2.0.1', 'user-agent': 'vitest' }),
    json: async () => body,
  };
}

describe('POST /api/external-signing/reissue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when no token is supplied', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeReq({}) as any);
    expect(res.status).toBe(400);
  });

  it('blocks public self-service reissue without touching DB or email', async () => {
    const { POST } = await import('../route');

    const res = await POST(makeReq({ token: 'expired-token' }) as any);

    expect(res.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockSendInvite).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
