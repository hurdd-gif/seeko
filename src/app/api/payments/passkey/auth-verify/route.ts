import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { getRpConfig, issuePaymentsCookie } from '@/lib/payments-passkey';
import { getServiceClient } from '@/lib/supabase/service';

type Assertion = {
  id?: string;
  rawId?: string;
  type?: string;
  response?: unknown;
};

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

  let body: { assertion?: Assertion };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.assertion?.id) return NextResponse.json({ error: 'assertion required' }, { status: 400 });

  const service = getServiceClient();

  const { data: ch } = await service
    .from('passkey_challenges')
    .select('challenge, expires_at')
    .eq('user_id', user.id).eq('kind', 'auth')
    .single();
  if (!ch || new Date(ch.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Challenge missing or expired' }, { status: 400 });
  }

  const { data: cred } = await service
    .from('passkey_credentials')
    .select('id, credential_id, public_key, counter, transports')
    .eq('user_id', user.id).eq('credential_id', body.assertion.id)
    .single();
  if (!cred) return NextResponse.json({ error: 'Unknown credential' }, { status: 400 });

  const origin = req.headers.get('origin') ?? new URL(req.url).origin;
  const { rpId, origin: expectedOrigin } = getRpConfig(origin);

  const publicKeyBytes = new Uint8Array(Buffer.from(cred.public_key, 'base64url'));

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.assertion as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
      expectedChallenge: ch.challenge,
      expectedOrigin,
      expectedRPID: rpId,
      requireUserVerification: true,
      credential: {
        id: cred.credential_id,
        publicKey: publicKeyBytes,
        counter: Number(cred.counter),
        transports: (cred.transports as AuthenticatorTransportFuture[] | null) ?? undefined,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  const newCounter = verification.authenticationInfo.newCounter;
  if (newCounter !== 0 && newCounter <= Number(cred.counter)) {
    await service.from('passkey_credentials').delete().eq('id', cred.id);
    return NextResponse.json({ error: 'untrusted-device' }, { status: 401 });
  }

  await service.from('passkey_credentials')
    .update({ counter: newCounter, last_used_at: new Date().toISOString() })
    .eq('id', cred.id);

  await service.from('passkey_challenges')
    .delete().eq('user_id', user.id).eq('kind', 'auth');

  const cookie = await issuePaymentsCookie(user.id);
  const res = NextResponse.json({ success: true });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
