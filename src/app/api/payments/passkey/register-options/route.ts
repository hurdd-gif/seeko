import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { getRpConfig } from '@/lib/payments-passkey';
import { getPaymentsAuth } from '@/lib/payments-auth';
import { getServiceClient } from '@/lib/supabase/service';

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-payments-token');
  const { user, isAdmin, tokenValid } = await getPaymentsAuth(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  // Enrolling any passkey — including the very first one — requires a valid payments token
  // (held passkey or recovery password). Prevents a hijacked Supabase session from bootstrapping
  // a passkey and bypassing the gate. Recovery password is the only path to bootstrap.
  if (!tokenValid) {
    return NextResponse.json({ error: 'Payments token required to enroll a device' }, { status: 401 });
  }

  const service = getServiceClient();

  const { data: existing } = await service
    .from('passkey_credentials').select('credential_id, transports').eq('user_id', user.id);

  const origin = req.headers.get('origin') ?? new URL(req.url).origin;
  const { rpId, rpName } = getRpConfig(origin);

  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userName: user.email ?? user.id,
    userDisplayName: user.email ?? 'admin',
    attestationType: 'none',
    excludeCredentials: (existing ?? []).map((c: { credential_id: string; transports: string[] | null }) => ({
      id: c.credential_id,
      transports: (c.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });

  const { error: chErr } = await service.from('passkey_challenges').upsert({
    user_id: user.id,
    kind: 'register',
    challenge: options.challenge,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
  if (chErr) return NextResponse.json({ error: 'Failed to store challenge' }, { status: 500 });

  return NextResponse.json(options);
}
