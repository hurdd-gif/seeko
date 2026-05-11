import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { issuePaymentsCookie } from '@/lib/payments-passkey';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const attemptLog = new Map<string, number[]>();

function recordAttempt(userId: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (attemptLog.get(userId) ?? []).filter((t) => t > cutoff);
  if (recent.length >= RATE_LIMIT_MAX) {
    attemptLog.set(userId, recent);
    const earliest = recent[0];
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((earliest + RATE_LIMIT_WINDOW_MS - now) / 1000)) };
  }
  recent.push(now);
  attemptLog.set(userId, recent);
  return { ok: true };
}

async function getSupabaseAndUser() {
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
  return { supabase, user };
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const rate = recordAttempt(user.id);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
    );
  }

  let body: { password: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { password } = body;
  if (!password) {
    return NextResponse.json({ error: 'Password required' }, { status: 400 });
  }

  const hash = process.env.PAYMENTS_ACCESS_HASH;
  if (!hash) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 500 });
  }

  const valid = await bcrypt.compare(password, hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const cookie = await issuePaymentsCookie(user.id);
  const response = NextResponse.json({ success: true, recovered: true });
  response.cookies.set(cookie.name, cookie.value, cookie.options);

  return response;
}
