import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { getRpConfig, issuePaymentsCookie, deriveDeviceName } from '@/lib/payments-passkey';
import { getPaymentsAuth } from '@/lib/payments-auth';
import { getServiceClient } from '@/lib/supabase/service';

const ALLOWED_TRANSPORTS = new Set(['usb', 'nfc', 'ble', 'internal', 'hybrid']);

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-payments-token');
  const { user, isAdmin, tokenValid } = await getPaymentsAuth(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  // Enrolling any passkey — including the first one — requires a valid payments token
  // (held passkey or recovery password). Prevents a hijacked Supabase session from
  // bootstrapping a passkey and bypassing the gate.
  if (!tokenValid) {
    return NextResponse.json({ error: 'Payments token required to enroll a device' }, { status: 401 });
  }

  let body: { attestation?: unknown; deviceName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.attestation) return NextResponse.json({ error: 'attestation required' }, { status: 400 });

  const service = getServiceClient();

  const { data: ch } = await service
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
      requireUserVerification: true,
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
  const rawTransports = (body.attestation as { response?: { transports?: string[] } })?.response?.transports;
  const transports = Array.isArray(rawTransports)
    ? rawTransports.filter((t): t is string => typeof t === 'string' && ALLOWED_TRANSPORTS.has(t))
    : null;

  const credentialId = typeof credentialIdRaw === 'string'
    ? credentialIdRaw
    : Buffer.from(credentialIdRaw as Uint8Array).toString('base64url');

  const publicKey = typeof publicKeyRaw === 'string'
    ? publicKeyRaw
    : Buffer.from(publicKeyRaw as Uint8Array).toString('base64url');

  const deviceName = body.deviceName?.trim() || deriveDeviceName(req.headers.get('user-agent'));

  const { error: insErr } = await service.from('passkey_credentials').insert({
    user_id: user.id,
    credential_id: credentialId,
    public_key: publicKey,
    counter,
    transports: transports && transports.length > 0 ? transports : null,
    device_name: deviceName,
  });
  if (insErr) {
    if ((insErr as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Already registered' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to store credential' }, { status: 500 });
  }

  await service.from('passkey_challenges')
    .delete().eq('user_id', user.id).eq('kind', 'register');

  const cookie = await issuePaymentsCookie(user.id);
  const res = NextResponse.json({ success: true, deviceName });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
