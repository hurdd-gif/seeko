import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { jwtVerify } from 'jose';
import { createHonoSupabaseClient, getDevBypassUser, isDevAuthBypass } from './supabase';

const PAYMENTS_COOKIE = 'payments-token';

export type PaymentsAdminAuth = {
  user: {
    id: string;
    email?: string | null;
  };
  supabase: ReturnType<typeof createHonoSupabaseClient>;
  isAdmin: boolean;
  isInvestor: boolean;
  tokenValid: boolean;
};

export type PaymentsAuthResult =
  | { ok: true; auth: PaymentsAdminAuth }
  | { ok: false; status: 401 | 403; error: string };

export async function requireHonoPaymentsAdminToken(c: Context): Promise<PaymentsAuthResult> {
  const auth = await getHonoPaymentsAuth(c);
  if (!auth.user) return { ok: false, status: 401, error: 'Unauthorized' };
  if (!auth.isAdmin || !auth.tokenValid) {
    return { ok: false, status: 403, error: 'Admin + payments token required' };
  }

  return { ok: true, auth: auth as PaymentsAdminAuth };
}

export async function requireHonoPaymentsViewerToken(c: Context): Promise<PaymentsAuthResult> {
  const auth = await getHonoPaymentsAuth(c);
  if (!auth.user) return { ok: false, status: 401, error: 'Unauthorized' };
  if (!auth.isAdmin && !auth.isInvestor) return { ok: false, status: 403, error: 'Forbidden' };
  if (auth.isAdmin && !auth.tokenValid) return { ok: false, status: 401, error: 'Payments token required' };

  return { ok: true, auth: auth as PaymentsAdminAuth };
}

export async function getHonoPaymentsAuth(c: Context): Promise<PaymentsAdminAuth | { user: null; supabase: ReturnType<typeof createHonoSupabaseClient>; isAdmin: false; isInvestor: false; tokenValid: false }> {
  const supabase = createHonoSupabaseClient(c);

  // DEV_AUTH_BYPASS also waives the passkey session (tokenValid) so /payments
  // is viewable on the dev server. Same guard as requireUser: inert in
  // production (Render sets NODE_ENV).
  if (isDevAuthBypass()) {
    const bypassUser = await getDevBypassUser();
    if (bypassUser) {
      return { supabase, user: bypassUser, isAdmin: true, isInvestor: false, tokenValid: true };
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, isAdmin: false, isInvestor: false, tokenValid: false };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, is_investor')
    .eq('id', user.id)
    .single();

  const isAdmin = !!profile?.is_admin;
  const isInvestor = !!profile?.is_investor;

  const tokenValue = getCookie(c, PAYMENTS_COOKIE) || c.req.header('x-payments-token');
  let tokenValid = false;
  if (isAdmin && tokenValue) {
    const jwtSecret = process.env.PAYMENTS_JWT_SECRET;
    if (jwtSecret) {
      try {
        const secret = new TextEncoder().encode(jwtSecret);
        const { payload } = await jwtVerify(tokenValue, secret);
        tokenValid = payload.sub === user.id && payload.scope === 'payments';
      } catch {
        tokenValid = false;
      }
    }
  }

  return {
    supabase,
    user: {
      id: user.id,
      email: user.email,
    },
    isAdmin,
    isInvestor,
    tokenValid,
  };
}

export async function requireHonoPaymentsRecoveryAdmin(c: Context): Promise<PaymentsAuthResult> {
  const auth = await getHonoPaymentsAuth(c);
  if (!auth.user) return { ok: false, status: 401, error: 'Unauthorized' };
  if (!auth.isAdmin) return { ok: false, status: 403, error: 'Admin access required' };
  return { ok: true, auth: auth as PaymentsAdminAuth };
}

export async function verifyHonoPaymentsCookie(c: Context, userId: string) {
  const tokenValue = getCookie(c, PAYMENTS_COOKIE) || c.req.header('x-payments-token');
  if (!tokenValue) {
    return false;
  }

  const jwtSecret = process.env.PAYMENTS_JWT_SECRET;
  if (!jwtSecret) {
    return false;
  }

  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(tokenValue, secret);
    return payload.sub === userId && payload.scope === 'payments';
  } catch {
    return false;
  }
}
