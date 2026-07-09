import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { jwtVerify } from 'jose';
import {
  createHonoSupabaseClient,
  getDevBypassUser,
  isDevAuthBypass,
  type AuthenticatedUser,
} from './supabase';
import { getServiceClient } from '@/lib/supabase/service';

export type AuthGuard =
  | { ok: true; user: AuthenticatedUser; isAdmin: boolean; isInvestor: boolean }
  | { ok: false; status: 401 | 403; error: string };

export async function requireUser(c: Context): Promise<AuthGuard> {
  if (isDevAuthBypass()) {
    const user = await getDevBypassUser();
    if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
    return { ok: true, user, isAdmin: true, isInvestor: false };
  }

  const supabase = createHonoSupabaseClient(c);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, is_investor')
    .eq('id', user.id)
    .single();

  return {
    ok: true,
    user: { id: user.id, email: user.email },
    isAdmin: !!profile?.is_admin,
    isInvestor: !!profile?.is_investor,
  };
}

export async function requireAdmin(c: Context): Promise<AuthGuard> {
  const guard = await requireUser(c);
  if (!guard.ok) return guard;
  if (!guard.isAdmin) return { ok: false, status: 403, error: 'Forbidden' };
  return guard;
}

/**
 * Admin gate for route modules that inject their own authResolver (a DI test
 * seam — see app.test.ts) instead of using requireUser's cookie-bound
 * Supabase client. Flags are always read via the service client so the guard
 * also works for token-only resolvers that bypass cookie auth entirely.
 */
export async function requireAdminVia(
  c: Context,
  authResolver: (c: Context) => Promise<AuthenticatedUser | null>,
): Promise<AuthGuard> {
  const user = await authResolver(c);
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };

  if (isDevAuthBypass()) {
    return { ok: true, user, isAdmin: true, isInvestor: false };
  }

  const service = getServiceClient();
  const { data } = await service
    .from('profiles')
    .select('is_admin, is_investor')
    .eq('id', user.id)
    .maybeSingle();

  const profile = data as { is_admin?: boolean; is_investor?: boolean } | null;
  if (!profile?.is_admin) return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true, user, isAdmin: true, isInvestor: !!profile.is_investor };
}

/**
 * The sole profiles.is_admin boolean check for callers that only have a
 * userId (no Context to run an authResolver against) — currently
 * agent/eko-activity.ts's assertAdmin. Throws on a genuine query failure so
 * callers can distinguish "could not verify" from "verified: not admin".
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  const service = getServiceClient();
  const { data, error } = await service
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return !!(data as { is_admin?: boolean } | null)?.is_admin;
}

export function getClientIp(c: Context) {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
  }
  return c.req.header('x-real-ip') || 'unknown';
}

export function isRateLimited(
  hits: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: { max: number; windowMs: number },
  pruneAt = 100
) {
  const now = Date.now();
  if (hits.size > pruneAt) {
    for (const [entryKey, entry] of hits) {
      if (now > entry.resetAt) hits.delete(entryKey);
    }
  }

  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + limit.windowMs });
    return false;
  }

  if (entry.count >= limit.max) return true;
  entry.count++;
  return false;
}

export async function validatePaymentsToken(c: Context, userId: string) {
  const tokenValue = getCookie(c, 'payments-token') || c.req.header('x-payments-token');
  const jwtSecret = process.env.PAYMENTS_JWT_SECRET;
  if (!tokenValue || !jwtSecret) return false;

  try {
    const { payload } = await jwtVerify(tokenValue, new TextEncoder().encode(jwtSecret));
    return payload.sub === userId && payload.scope === 'payments';
  } catch {
    return false;
  }
}

export function applyIssuedCookie(
  c: Context,
  cookie: {
    name: string;
    value: string;
    options: {
      httpOnly: true;
      secure: boolean;
      sameSite: 'strict';
      path: string;
      maxAge: number;
    };
  }
) {
  setCookie(c, cookie.name, cookie.value, cookie.options);
}

export async function getAdminProfile(userId: string) {
  const service = getServiceClient();
  const { data } = await service
    .from('profiles')
    .select('is_admin, email')
    .eq('id', userId)
    .single();
  return data as { is_admin?: boolean; email?: string | null } | null;
}
