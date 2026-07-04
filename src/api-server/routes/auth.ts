import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { SignJWT, jwtVerify } from 'jose';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { createHonoSupabaseClient } from '../supabase';
import { getServiceClient } from '@/lib/supabase/service';
import { getRpConfig } from '@/lib/payments-passkey';
import type { Context } from 'hono';

type AuthRoutesOptions = {
  signOut?: (c: Context) => Promise<void>;
};

export function createAuthRoutes(options: AuthRoutesOptions = {}) {
  const signOut = options.signOut ?? defaultSignOut;

  return new Hono().post('/signout', async (c) => {
    await signOut(c);

    return c.redirect('/login', 303);
  });
}

export function createAuthCallbackRoutes() {
  return new Hono()
    .get('/callback', async (c) => {
      const url = new URL(c.req.url);
      const code = url.searchParams.get('code');
      const rawNext = url.searchParams.get('next') ?? '/';
      const next = /^\/(?!\/)/.test(rawNext) ? rawNext : '/';

      if (code) {
        const supabase = createHonoSupabaseClient(c);
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return c.redirect(next);
      }

      return c.redirect('/login?error=auth_callback_failed');
    })
    .get('/callback/invite', async (c) => {
      const url = new URL(c.req.url);
      const code = url.searchParams.get('code');

      if (code) {
        const supabase = createHonoSupabaseClient(c);
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return c.redirect('/set-password');
      }

      return c.redirect('/login?error=auth_callback_failed');
    });
}

async function defaultSignOut(c: Context) {
  const supabase = createHonoSupabaseClient(c);
  await supabase.auth.signOut();
}

/* ── First-factor passkey login ──────────────────────────────────────────────
 * Usernameless (discoverable-credential) WebAuthn sign-in, distinct from the
 * payments step-up gate in routes/payments.ts: here NO session exists yet, so
 * the challenge can't live in passkey_challenges (keyed by user_id). It rides
 * in a short-lived signed HttpOnly cookie instead, with a jti so each
 * challenge is single-use. A verified assertion is exchanged for a real
 * Supabase session entirely server-side (admin.generateLink → verifyOtp on the
 * anon cookie client) — the token_hash never reaches the browser. */

const LOGIN_CHALLENGE_COOKIE = 'login-passkey-challenge';
const LOGIN_CHALLENGE_TTL_SEC = 5 * 60;
const LOGIN_CHALLENGE_COOKIE_PATH = '/api/auth/passkey';

// Sliding-window rate limit on verify attempts, keyed by client IP.
const VERIFY_WINDOW_MS = 15 * 60 * 1000;
const VERIFY_MAX_ATTEMPTS = 10;
const verifyAttemptsByIp = new Map<string, number[]>();

// Redeemed challenge jtis (value = cookie expiry) so a captured cookie can't
// be replayed after its ceremony completes; pruned on every touch.
const redeemedChallenges = new Map<string, number>();

export function resetPasskeyLoginRateLimit() {
  verifyAttemptsByIp.clear();
  redeemedChallenges.clear();
}

function getChallengeSecret() {
  const { env } = process;
  const secret = env.PAYMENTS_JWT_SECRET;
  if (!secret) throw new Error('PAYMENTS_JWT_SECRET is not configured');
  return new TextEncoder().encode(secret);
}

function recordVerifyAttempt(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const recent = (verifyAttemptsByIp.get(ip) ?? []).filter((time) => time > now - VERIFY_WINDOW_MS);
  if (recent.length >= VERIFY_MAX_ATTEMPTS) {
    verifyAttemptsByIp.set(ip, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0]! + VERIFY_WINDOW_MS - now) / 1000)) };
  }
  recent.push(now);
  verifyAttemptsByIp.set(ip, recent);
  return { ok: true };
}

function pruneRedeemedChallenges() {
  const now = Date.now();
  for (const [jti, expiresAt] of redeemedChallenges) {
    if (expiresAt < now) redeemedChallenges.delete(jti);
  }
}

export function createPasskeyLoginRoutes() {
  const { env } = process;

  return new Hono()
    .post('/passkey/options', async (c) => {
      const { rpId } = getRpConfig(c.req.header('origin') ?? new URL(c.req.url).origin);
      // Empty allowCredentials = discoverable/usernameless: the browser offers
      // whatever SEEKO passkeys the authenticator holds, no email typed first.
      const options = await generateAuthenticationOptions({
        rpID: rpId,
        userVerification: 'required',
        allowCredentials: [],
      });

      const jti = crypto.randomUUID();
      const token = await new SignJWT({ challenge: options.challenge })
        .setProtectedHeader({ alg: 'HS256' })
        .setJti(jti)
        .setIssuedAt()
        .setExpirationTime(`${LOGIN_CHALLENGE_TTL_SEC}s`)
        .sign(getChallengeSecret());

      setCookie(c, LOGIN_CHALLENGE_COOKIE, token, {
        httpOnly: true,
        secure: env.NODE_ENV !== 'development',
        sameSite: 'strict',
        path: LOGIN_CHALLENGE_COOKIE_PATH,
        maxAge: LOGIN_CHALLENGE_TTL_SEC,
      });
      return c.json(options);
    })
    .post('/passkey/verify', async (c) => {
      const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const rate = recordVerifyAttempt(ip);
      if (!rate.ok) {
        c.header('Retry-After', String(rate.retryAfterSec));
        return c.json({ error: 'Too many attempts. Try again later.' }, 429);
      }

      const cookieToken = getCookie(c, LOGIN_CHALLENGE_COOKIE);
      deleteCookie(c, LOGIN_CHALLENGE_COOKIE, { path: LOGIN_CHALLENGE_COOKIE_PATH });
      if (!cookieToken) return c.json({ error: 'Challenge missing or expired' }, 400);

      let challenge: string;
      let jti: string;
      try {
        const { payload } = await jwtVerify(cookieToken, getChallengeSecret());
        if (typeof payload.challenge !== 'string' || typeof payload.jti !== 'string') throw new Error('malformed');
        challenge = payload.challenge;
        jti = payload.jti;
      } catch {
        return c.json({ error: 'Challenge missing or expired' }, 400);
      }

      pruneRedeemedChallenges();
      if (redeemedChallenges.has(jti)) return c.json({ error: 'Challenge missing or expired' }, 400);
      redeemedChallenges.set(jti, Date.now() + LOGIN_CHALLENGE_TTL_SEC * 1000);

      const body = await c.req.json().catch(() => null) as { assertion?: { id?: string } & Record<string, unknown> } | null;
      if (!body?.assertion?.id) return c.json({ error: 'assertion required' }, 400);

      const service = getServiceClient();
      const { data: cred } = await service
        .from('passkey_credentials')
        .select('id, user_id, credential_id, public_key, counter, transports')
        .eq('credential_id', body.assertion.id)
        .single();
      if (!cred) return c.json({ error: 'Unknown credential' }, 400);

      const { rpId, origin: expectedOrigin } = getRpConfig(c.req.header('origin') ?? new URL(c.req.url).origin);
      let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
      try {
        verification = await verifyAuthenticationResponse({
          response: body.assertion as unknown as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
          expectedChallenge: challenge,
          expectedOrigin,
          expectedRPID: rpId,
          requireUserVerification: true,
          credential: {
            id: cred.credential_id,
            publicKey: new Uint8Array(Buffer.from(cred.public_key, 'base64url')),
            counter: Number(cred.counter),
            transports: (cred.transports as AuthenticatorTransportFuture[] | null) ?? undefined,
          },
        });
      } catch {
        return c.json({ error: 'Verification failed' }, 400);
      }
      if (!verification.verified) return c.json({ error: 'Verification failed' }, 400);

      // Same clone-detection policy as the payments gate: a counter that fails
      // to advance means a copied authenticator — evict it.
      const newCounter = verification.authenticationInfo.newCounter;
      if (newCounter !== 0 && newCounter <= Number(cred.counter)) {
        await service.from('passkey_credentials').delete().eq('id', cred.id);
        return c.json({ error: 'untrusted-device' }, 401);
      }
      await service
        .from('passkey_credentials')
        .update({ counter: newCounter, last_used_at: new Date().toISOString() } as never)
        .eq('id', cred.id);

      // Exchange the proven credential for a Supabase session without ever
      // shipping the magiclink token to the client: generate the link with the
      // service role, then redeem its hashed token on the anon cookie client so
      // the session cookies land on THIS response.
      const { data: userData } = await service.auth.admin.getUserById(cred.user_id);
      const email = userData?.user?.email;
      if (!email) return c.json({ error: 'Login failed' }, 500);

      const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });
      const tokenHash = linkData?.properties?.hashed_token;
      if (linkError || !tokenHash) {
        console.error('[passkey login] generateLink failed:', linkError);
        return c.json({ error: 'Login failed' }, 500);
      }

      const supabase = createHonoSupabaseClient(c);
      const { error: otpError } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
      if (otpError) {
        console.error('[passkey login] verifyOtp failed:', otpError);
        return c.json({ error: 'Login failed' }, 500);
      }

      return c.json({ success: true });
    });
}
