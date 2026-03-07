import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

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

  let tokenValid = false;
  if (isAdmin && tokenHeader) {
    try {
      const secret = new TextEncoder().encode(process.env.PAYMENTS_JWT_SECRET ?? 'fallback-secret');
      const { payload } = await jwtVerify(tokenHeader, secret);
      tokenValid = payload.sub === user.id && payload.scope === 'payments';
    } catch {
      tokenValid = false;
    }
  }

  return { supabase, user, isAdmin, isInvestor, tokenValid };
}
