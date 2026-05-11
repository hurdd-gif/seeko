import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { getRpConfig, issuePaymentsCookie, deriveDeviceName } from '@/lib/payments-passkey';

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

  let body: { attestation?: unknown; deviceName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.attestation) return NextResponse.json({ error: 'attestation required' }, { status: 400 });

  const { data: ch } = await supabase
    .from('passkey_challenges')
    .select('challenge, expires_at')
    .eq('user_id', user.id).eq('kind', 'register')
    .single();
  if (!ch || new Date(ch.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Challenge missing or expired' }, { status: 400 });
  }

  const origin = req.headers.get('origin') ?? new URL(req.url).origin;
  const { rpId, origin: expectedOrigin } = getRpConfig(origin);

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response: body.attestation as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge: ch.challenge,
      expectedOrigin,
      expectedRPID: rpId,
      requireUserVerification: false,
    });
  } catch {
    return NextResponse.json({ error: 'Attestation verification failed' }, { status: 400 });
  }
  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Attestation rejected' }, { status: 400 });
  }

  const regInfo = verification.registrationInfo as Record<string, unknown>;
  const cred = (regInfo.credential as Record<string, unknown> | undefined) ?? regInfo;
  const credentialIdRaw = cred.id ?? cred.credentialID;
  const publicKeyRaw = cred.publicKey ?? cred.credentialPublicKey;
  const counter = (cred.counter as number | undefined) ?? 0;
  const transports = (body.attestation as { response?: { transports?: string[] } })?.response?.transports ?? null;

  const credentialId = typeof credentialIdRaw === 'string'
    ? credentialIdRaw
    : Buffer.from(credentialIdRaw as Uint8Array).toString('base64url');

  const publicKey = typeof publicKeyRaw === 'string'
    ? publicKeyRaw
    : Buffer.from(publicKeyRaw as Uint8Array).toString('base64url');

  const deviceName = body.deviceName?.trim() || deriveDeviceName(req.headers.get('user-agent'));

  const { error: insErr } = await supabase.from('passkey_credentials').insert({
    user_id: user.id,
    credential_id: credentialId,
    public_key: publicKey,
    counter,
    transports,
    device_name: deviceName,
  });
  if (insErr) {
    if ((insErr as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Already registered' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to store credential' }, { status: 500 });
  }

  await supabase.from('passkey_challenges')
    .delete().eq('user_id', user.id).eq('kind', 'register');

  const cookie = await issuePaymentsCookie(user.id);
  const res = NextResponse.json({ success: true, deviceName });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
