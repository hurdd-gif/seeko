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
