import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/* ─── In-memory rate limiter ────────────────────────────────
 * 5 invite requests per IP per hour.
 * Fine for a single Render instance; swap for Upstash if
 * the service ever scales horizontally.
 * ─────────────────────────────────────────────────────────── */
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const ipHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
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
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  if (isRateLimited(ip)) {
    // TODO: Replace with proper logging system
    // Rate limit exceeded - IP blocked temporarily
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
    // TODO: Replace with proper logging system
    // Non-admin user attempted invite
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json();
  const { email, department, isContractor } = body as {
    email: string;
    department: string;
    isContractor: boolean;
  };

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error: otpError } = await admin.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (otpError) {
    // TODO: Replace with proper logging system
    // OTP send failed for email invitation
    const hint = otpError.message.toLowerCase().includes('confirmation email')
      ? ' If SMTP is already configured, check Supabase Auth logs and your SMTP provider dashboard (see docs/auth-email-troubleshooting.md).'
      : '';
    return NextResponse.json(
      { error: otpError.message + hint },
      { status: 400 }
    );
  }

  const { error: insertError } = await admin
    .from('pending_invites')
    .upsert(
      { email, department: department || null, is_contractor: isContractor ?? false },
      { onConflict: 'email' }
    );

  if (insertError) {
    // TODO: Replace with proper logging system
    // Failed to insert pending invite record
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  // TODO: Replace with proper logging system
  // Invite sent successfully
  return NextResponse.json({ success: true });
}
