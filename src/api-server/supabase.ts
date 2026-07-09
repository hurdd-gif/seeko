import { createServerClient } from '@supabase/ssr';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { getServiceClient } from '@/lib/supabase/service';

export type AuthenticatedUser = Pick<User, 'id' | 'email'>;

// DEV_AUTH_BYPASS=1 (local .env.local only) impersonates the first admin profile so the
// dashboard can be viewed without signing in. Inert in production: Render sets NODE_ENV.
let devBypassUser: AuthenticatedUser | null = null;

export function isDevAuthBypass() {
  return process.env.DEV_AUTH_BYPASS === '1' && process.env.NODE_ENV !== 'production';
}

export async function getDevBypassUser(): Promise<AuthenticatedUser | null> {
  if (!devBypassUser) {
    const { data } = await getServiceClient()
      .from('profiles')
      .select('id, email')
      .eq('is_admin', true)
      .limit(1)
      .single();
    if (!data) return null;
    devBypassUser = { id: data.id, email: data.email ?? undefined };
  }
  return devBypassUser;
}

export function createHonoSupabaseClient(c: Context) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        const cookies = getCookie(c);
        return Object.entries(cookies).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          setCookie(c, name, value, options as Parameters<typeof setCookie>[3]);
        });
      },
    },
  });
}

export async function getAuthenticatedUser(c: Context): Promise<AuthenticatedUser | null> {
  if (isDevAuthBypass()) return getDevBypassUser();

  const supabase = createHonoSupabaseClient(c);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  return {
    id: user.id,
    email: user.email,
  };
}
