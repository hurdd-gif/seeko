import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const MAX_ATTEMPTS = 5;

interface VerifyRow {
  id: string;
  status: string;
  expires_at: string;
  verification_code: string;
  verification_attempts: number;
}

export async function POST(request: NextRequest) {
  const { token, code } = await request.json();

  if (!token || !code) {
    return NextResponse.json({ error: 'Token and code required' }, { status: 400 });
  }

  const service = getServiceClient();

  // Atomic increment: only increment if under the limit, return the updated row.
  const { data: updated, error: rpcError } = await (service as any).rpc('increment_verification_attempt', {
    p_token: token,
    p_purpose: 'doc_share',
    p_max_attempts: MAX_ATTEMPTS,
  }) as { data: VerifyRow[] | null; error: { code?: string; message?: string } | null };

  // Fallback: if the RPC doesn't exist yet, use the non-atomic path
  if (rpcError?.code === '42883') {
    return verifyFallback(service, token, code, request);
  }

  if (rpcError) {
    console.error('[doc-share/verify] rpc error:', rpcError);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }

  if (!updated || updated.length === 0) {
    // RPC returned nothing — either invite not found, wrong status, or attempts exhausted
    const { data: invite } = await (service
      .from('external_signing_invites') as any)
      .select('id, status, verification_attempts')
      .eq('token', token)
      .eq('purpose', 'doc_share')
      .single();

    if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    if (invite.status === 'verified') {
      return NextResponse.json({ error: 'Invite has already been verified' }, { status: 409 });
    }
    if (invite.verification_attempts >= MAX_ATTEMPTS) {
      return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 });
    }
    return NextResponse.json({ error: 'Invite is no longer available' }, { status: 400 });
  }

  const invite = updated[0];

  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    await (service.from('external_signing_invites') as any).update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
  }

  // Verify code
  const valid = await bcrypt.compare(code, invite.verification_code);
  if (!valid) {
    const remaining = MAX_ATTEMPTS - invite.verification_attempts;
    return NextResponse.json(
      { error: `Invalid code. ${Math.max(remaining, 0)} attempt${remaining !== 1 ? 's' : ''} remaining.` },
      { status: 400 }
    );
  }

  // Generate session token
  const sessionToken = randomBytes(32).toString('base64url');

  // Extract IP from x-forwarded-for (last IP = client)
  const forwarded = request.headers.get('x-forwarded-for');
  const sessionIp = forwarded ? forwarded.split(',').pop()?.trim() || null : null;
  const sessionUserAgent = request.headers.get('user-agent') || null;

  // Mark as verified with session
  await (service
    .from('external_signing_invites') as any)
    .update({
      status: 'verified',
      verified_at: new Date().toISOString(),
      session_token: sessionToken,
      session_ip: sessionIp,
      session_user_agent: sessionUserAgent,
      session_started_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  // Set session cookie
  const isProduction = process.env.NODE_ENV === 'production';
  const response = NextResponse.json({ success: true });
  response.cookies.set('doc_share_session', sessionToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    expires: new Date(invite.expires_at),
    path: '/',
  });

  return response;
}

// Non-atomic fallback (used if the RPC hasn't been deployed yet)
async function verifyFallback(
  service: ReturnType<typeof getServiceClient>,
  token: string,
  code: string,
  request: NextRequest
) {
  const { data: invite } = await (service
    .from('external_signing_invites') as any)
    .select('id, token, status, expires_at, verification_code, verification_attempts')
    .eq('token', token)
    .eq('purpose', 'doc_share')
    .single() as { data: VerifyRow | null };

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });

  if (invite.status === 'verified') {
    return NextResponse.json({ error: 'Invite has already been verified' }, { status: 409 });
  }

  if (invite.status !== 'pending') {
    return NextResponse.json({ error: 'Invite is no longer available' }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    await (service.from('external_signing_invites') as any).update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
  }

  if (invite.verification_attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 });
  }

  // Increment attempts (non-atomic fallback)
  await (service
    .from('external_signing_invites') as any)
    .update({ verification_attempts: invite.verification_attempts + 1 })
    .eq('id', invite.id);

  // Verify code
  const valid = await bcrypt.compare(code, invite.verification_code);
  if (!valid) {
    const remaining = MAX_ATTEMPTS - 1 - invite.verification_attempts;
    return NextResponse.json(
      { error: `Invalid code. ${Math.max(remaining, 0)} attempt${remaining !== 1 ? 's' : ''} remaining.` },
      { status: 400 }
    );
  }

  // Generate session token
  const sessionToken = randomBytes(32).toString('base64url');

  // Extract IP from x-forwarded-for (last IP = client)
  const forwarded = request.headers.get('x-forwarded-for');
  const sessionIp = forwarded ? forwarded.split(',').pop()?.trim() || null : null;
  const sessionUserAgent = request.headers.get('user-agent') || null;

  // Mark as verified with session
  await (service
    .from('external_signing_invites') as any)
    .update({
      status: 'verified',
      verified_at: new Date().toISOString(),
      session_token: sessionToken,
      session_ip: sessionIp,
      session_user_agent: sessionUserAgent,
      session_started_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  // Set session cookie
  const isProduction = process.env.NODE_ENV === 'production';
  const response = NextResponse.json({ success: true });
  response.cookies.set('doc_share_session', sessionToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    expires: new Date(invite.expires_at),
    path: '/',
  });

  return response;
}
