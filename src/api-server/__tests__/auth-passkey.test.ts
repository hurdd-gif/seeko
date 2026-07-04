// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPasskeyLoginRoutes, resetPasskeyLoginRateLimit } from '../routes/auth';

// First-factor passkey login: unauthenticated discoverable-credential ceremony.
// The challenge round-trips in a signed HttpOnly cookie (no user_id exists yet,
// so the passkey_challenges table can't hold it), and a verified assertion is
// exchanged for a real Supabase session server-side via admin.generateLink →
// verifyOtp — the token_hash must never appear in the response body.

const webauthn = vi.hoisted(() => ({
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

vi.mock('@simplewebauthn/server', () => webauthn);

const serviceState = vi.hoisted(() => ({
  credential: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  deletes: [] as string[],
  user: { email: 'karti@seeko.studio' } as { email?: string } | null,
  hashedToken: 'hashed-token-1' as string | null,
  generateLinkCalls: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table !== 'passkey_credentials') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: serviceState.credential, error: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          serviceState.updates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
        delete: () => ({
          eq: async (_col: string, id: string) => {
            serviceState.deletes.push(id);
            return { error: null };
          },
        }),
      };
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: serviceState.user },
          error: serviceState.user ? null : { message: 'not found' },
        }),
        generateLink: async (params: Record<string, unknown>) => {
          serviceState.generateLinkCalls.push(params);
          return serviceState.hashedToken
            ? { data: { properties: { hashed_token: serviceState.hashedToken } }, error: null }
            : { data: null, error: { message: 'link failed' } };
        },
      },
    },
  }),
}));

const anonState = vi.hoisted(() => ({
  verifyOtp: vi.fn(async () => ({ data: { session: {} }, error: null })),
}));

vi.mock('../supabase', async (importOriginal) => {
  const original = await importOriginal<typeof import('../supabase')>();
  return {
    ...original,
    createHonoSupabaseClient: () => ({ auth: { verifyOtp: anonState.verifyOtp } }),
  };
});

const STORED_CREDENTIAL = {
  id: 'cred-row-1',
  user_id: 'user-1',
  credential_id: 'cred-abc',
  public_key: Buffer.from('public-key').toString('base64url'),
  counter: 5,
  transports: ['internal'],
};

function makeApp() {
  return createPasskeyLoginRoutes();
}

async function getChallengeCookie(app: ReturnType<typeof makeApp>) {
  const res = await app.request('/passkey/options', {
    method: 'POST',
    headers: { origin: 'http://localhost:5173' },
  });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/login-passkey-challenge=([^;]+)/);
  expect(match).not.toBeNull();
  return `login-passkey-challenge=${match![1]}`;
}

function verifyRequest(app: ReturnType<typeof makeApp>, cookie?: string) {
  return app.request('/passkey/verify', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:5173',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ assertion: { id: 'cred-abc', response: {} } }),
  });
}

beforeEach(() => {
  vi.stubEnv('PAYMENTS_JWT_SECRET', 'test-secret');
  resetPasskeyLoginRateLimit();
  serviceState.credential = { ...STORED_CREDENTIAL };
  serviceState.updates = [];
  serviceState.deletes = [];
  serviceState.user = { email: 'karti@seeko.studio' };
  serviceState.hashedToken = 'hashed-token-1';
  serviceState.generateLinkCalls = [];
  anonState.verifyOtp.mockClear();
  webauthn.generateAuthenticationOptions.mockResolvedValue({
    challenge: 'test-challenge',
    rpId: 'localhost',
    allowCredentials: [],
    userVerification: 'required',
  });
  webauthn.verifyAuthenticationResponse.mockResolvedValue({
    verified: true,
    authenticationInfo: { newCounter: 6 },
  });
});

describe('POST /passkey/options', () => {
  it('returns discoverable-credential options and sets the challenge cookie', async () => {
    const app = makeApp();
    const res = await app.request('/passkey/options', {
      method: 'POST',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.challenge).toBe('test-challenge');
    // Discoverable flow: no allowCredentials narrowing (usernameless).
    expect(webauthn.generateAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({ rpID: 'localhost', userVerification: 'required', allowCredentials: [] })
    );
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('login-passkey-challenge=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/api/auth/passkey');
  });
});

describe('POST /passkey/verify', () => {
  it('rejects when the challenge cookie is missing', async () => {
    const res = await verifyRequest(makeApp());
    expect(res.status).toBe(400);
    expect(anonState.verifyOtp).not.toHaveBeenCalled();
  });

  it('rejects an unknown credential', async () => {
    const app = makeApp();
    const cookie = await getChallengeCookie(app);
    serviceState.credential = null;

    const res = await verifyRequest(app, cookie);
    expect(res.status).toBe(400);
    expect(anonState.verifyOtp).not.toHaveBeenCalled();
  });

  it('rejects when assertion verification fails', async () => {
    webauthn.verifyAuthenticationResponse.mockRejectedValue(new Error('bad assertion'));
    const app = makeApp();
    const cookie = await getChallengeCookie(app);

    const res = await verifyRequest(app, cookie);
    expect(res.status).toBe(400);
    expect(anonState.verifyOtp).not.toHaveBeenCalled();
  });

  it('deletes the credential and returns untrusted-device on counter regression', async () => {
    webauthn.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 3 }, // stored counter is 5
    });
    const app = makeApp();
    const cookie = await getChallengeCookie(app);

    const res = await verifyRequest(app, cookie);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('untrusted-device');
    expect(serviceState.deletes).toContain('cred-row-1');
    expect(anonState.verifyOtp).not.toHaveBeenCalled();
  });

  it('mints a session server-side on a verified assertion', async () => {
    const app = makeApp();
    const cookie = await getChallengeCookie(app);

    const res = await verifyRequest(app, cookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });

    // Counter + last_used_at persisted.
    expect(serviceState.updates).toContainEqual(
      expect.objectContaining({ counter: 6 })
    );
    // Session minted via magiclink token redeemed SERVER-side…
    expect(serviceState.generateLinkCalls).toContainEqual(
      expect.objectContaining({ type: 'magiclink', email: 'karti@seeko.studio' })
    );
    expect(anonState.verifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'email', token_hash: 'hashed-token-1' })
    );
    // …and the token never leaks to the browser.
    expect(JSON.stringify(body)).not.toContain('hashed-token-1');
  });

  it('cannot replay the same challenge cookie after a completed ceremony', async () => {
    const app = makeApp();
    const cookie = await getChallengeCookie(app);

    const first = await verifyRequest(app, cookie);
    expect(first.status).toBe(200);

    // The verify response expires the cookie; a client that ignores that and
    // replays the old value must be rejected because the challenge is single-use.
    const replay = await verifyRequest(app, cookie);
    expect(replay.status).toBe(400);
  });

  it('rate limits repeated failing attempts', async () => {
    webauthn.verifyAuthenticationResponse.mockRejectedValue(new Error('bad'));
    const app = makeApp();

    let lastStatus = 0;
    for (let i = 0; i < 12; i++) {
      const cookie = await getChallengeCookie(app);
      const res = await verifyRequest(app, cookie);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
