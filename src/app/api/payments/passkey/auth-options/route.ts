import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getRpConfig } from '@/lib/payments-passkey';

export async function POST(req: NextRequest) {
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { data: creds } = await supabase
    .from('passkey_credentials')
    .select('credential_id, transports')
    .eq('user_id', user.id);

  const origin = req.headers.get('origin') ?? new URL(req.url).origin;
  const { rpId } = getRpConfig(origin);

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    userVerification: 'preferred',
    allowCredentials: (creds ?? []).map((c: { credential_id: string; transports: string[] | null }) => ({
      id: c.credential_id,
      transports: c.transports ?? undefined,
    })),
  });

  const { error: chErr } = await supabase.from('passkey_challenges').upsert({
    user_id: user.id,
    kind: 'auth',
    challenge: options.challenge,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
  if (chErr) return NextResponse.json({ error: 'Failed to store challenge' }, { status: 500 });

  return NextResponse.json(options);
}
