import type { Department } from '@/lib/types';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';

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
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  // Check if user exists (getUserByEmail not in all client versions; use listUsers and filter).
  const { data: listData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existingUser = listData?.users?.find((u) => u.email?.toLowerCase() === emailLower) ?? null;

  if (existingUser) {
    // Existing user: send magic link so they can log in; profile/init will apply invite metadata.
    const { error: otpError } = await admin.auth.signInWithOtp({
      email: emailLower,
      options: { shouldCreateUser: false },
    });
    if (otpError) {
      const hint = otpError.message.toLowerCase().includes('confirmation email')
        ? ' If SMTP is configured, check Supabase Auth logs and SMTP dashboard (see docs/auth-email-troubleshooting.md).'
        : '';
      return NextResponse.json({ error: otpError.message + hint }, { status: 400 });
    }
  } else {
    // New user: use invite email (dedicated invite flow).
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(emailLower, {
      redirectTo: request.nextUrl.origin + '/login',
    });
    if (inviteError) {
      const hint = inviteError.message.toLowerCase().includes('confirmation email')
        ? ' If SMTP is configured, check Supabase Auth logs and SMTP dashboard (see docs/auth-email-troubleshooting.md).'
        : '';
      return NextResponse.json({ error: inviteError.message + hint }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true });
}
