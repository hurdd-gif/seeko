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
