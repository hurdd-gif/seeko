import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

const PAYMENTS_COOKIE = 'payments-token';

export async function getPaymentsAuth(tokenHeader?: string | null) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isAdmin: false, isInvestor: false, tokenValid: false };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, is_investor')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.is_admin ?? false;
  const isInvestor = profile?.is_investor ?? false;

  // Read token from httpOnly cookie first, fall back to header for backwards compat
  const tokenValue = cookieStore.get(PAYMENTS_COOKIE)?.value || tokenHeader;

  let tokenValid = false;
  if (isAdmin && tokenValue) {
    try {
      const jwtSecret = process.env.PAYMENTS_JWT_SECRET;
      if (!jwtSecret) {
        tokenValid = false;
        return { supabase, user, isAdmin, isInvestor, tokenValid };
      }
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(tokenValue, secret);
      tokenValid = payload.sub === user.id && payload.scope === 'payments';
    } catch {
      tokenValid = false;
    }
  }

  return { supabase, user, isAdmin, isInvestor, tokenValid };
}

type PaymentsAuth = Awaited<ReturnType<typeof getPaymentsAuth>>;

// Admin endpoints that mutate payments. Requires Supabase admin + valid payments token.
export async function requirePaymentsAdminToken(
  req: NextRequest
): Promise<{ error: NextResponse } | { auth: PaymentsAuth & { user: NonNullable<PaymentsAuth['user']> } }> {
  const token = req.headers.get('x-payments-token');
  const auth = await getPaymentsAuth(token);
  if (!auth.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!auth.isAdmin || !auth.tokenValid) {
    return { error: NextResponse.json({ error: 'Admin + payments token required' }, { status: 403 }) };
  }
  return { auth: auth as PaymentsAuth & { user: NonNullable<PaymentsAuth['user']> } };
}

// Read-only endpoints. Admin needs a valid payments token; investors don't.
export async function requirePaymentsViewerToken(
  req: NextRequest
): Promise<{ error: NextResponse } | { auth: PaymentsAuth & { user: NonNullable<PaymentsAuth['user']> } }> {
  const token = req.headers.get('x-payments-token');
  const auth = await getPaymentsAuth(token);
  if (!auth.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!auth.isAdmin && !auth.isInvestor) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  if (auth.isAdmin && !auth.tokenValid) {
    return { error: NextResponse.json({ error: 'Payments token required' }, { status: 401 }) };
  }
  return { auth: auth as PaymentsAuth & { user: NonNullable<PaymentsAuth['user']> } };
}
