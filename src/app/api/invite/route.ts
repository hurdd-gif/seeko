import type { Department } from '@/lib/types';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { sendInviteEmail } from '@/lib/email';

const VALID_DEPARTMENTS: Department[] = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ─── In-memory rate limiter ────────────────────────────────
 * 5 invite requests per IP per hour.
 * Use rightmost IP in x-forwarded-for (trusted proxy appends last).
 * Prune expired entries to avoid unbounded memory growth.
 * Fine for a single Render instance; swap for Upstash if horizontal scale.
 * ─────────────────────────────────────────────────────────── */
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const ipHits = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) return 'unknown';
  const parts = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : 'unknown';
}

function pruneExpiredRateLimitEntries(): void {
  const now = Date.now();
  for (const [key, entry] of ipHits.entries()) {
    if (now > entry.resetAt) ipHits.delete(key);
  }
}

function isRateLimited(ip: string): boolean {
  pruneExpiredRateLimitEntries();
  const now = Date.now();
  const entry = ipHits.get(ip);

  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }

  if (entry.count >= RATE_LIMIT.max) return true;

  entry.count++;
  return false;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let body: { email: string; department: string; isContractor: boolean; isInvestor?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { email: rawEmail, department, isContractor, isInvestor } = body;

  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  const emailLower = email.toLowerCase();
  const departmentVal = department && VALID_DEPARTMENTS.includes(department as Department) ? department : null;

  const admin = getServiceClient();

  // Insert pending_invites first so role is applied on signup or on next login (profile/init).
  // Table may be missing from generated Supabase types; assert payload for upsert.
  const { error: insertError } = await admin
    .from('pending_invites')
    .upsert(
      {
        email: emailLower,
        department: departmentVal,
        is_contractor: isContractor ?? false,
        is_investor: isInvestor ?? false,
      } as never,
      { onConflict: 'email' }
    );

  if (insertError) {
    console.error('[invite] pending_invites upsert error:', insertError);
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  // Generate invite link via Supabase (creates auth user if needed, does NOT send email).
  // Then send the email ourselves via Resend for reliable delivery.
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const redirectTo = siteOrigin + '/login';

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: emailLower,
    options: { redirectTo },
  });

  if (linkError) {
    console.error('[invite] generateLink error:', linkError);
    return NextResponse.json({ error: linkError.message }, { status: 400 });
  }

  const inviteCode = linkData.properties.email_otp;
  if (!inviteCode) {
    console.error('[invite] No OTP in generateLink response:', linkData.properties);
    return NextResponse.json({ error: 'Failed to generate invite code' }, { status: 500 });
  }

  try {
    await sendInviteEmail({ recipientEmail: emailLower, inviteCode });
  } catch (emailErr) {
    console.error('[invite] Resend email error:', emailErr);
    return NextResponse.json({ error: 'Failed to send invite email' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
