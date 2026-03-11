import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const PAYMENTS_COOKIE = 'payments-token';

// Rate limiter: 5 attempts per user per 15 minutes
const RATE_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };
const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  if (attempts.size > 100) {
    for (const [key, entry] of attempts) { if (now > entry.resetAt) attempts.delete(key); }
  }
  const entry = attempts.get(userId);
  if (!entry || now > entry.resetAt) {
    attempts.set(userId, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  if (entry.count >= RATE_LIMIT.max) return true;
  entry.count++;
  return false;
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

  if (isRateLimited(user.id)) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
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

  const jwtSecret = process.env.PAYMENTS_JWT_SECRET;
  if (!jwtSecret) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 500 });
  }
  const secret = new TextEncoder().encode(jwtSecret);
  const token = await new SignJWT({ sub: user.id, scope: 'payments' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .setIssuedAt()
    .sign(secret);

  const isProduction = process.env.NODE_ENV === 'production';

  const response = NextResponse.json({ success: true });
  response.cookies.set(PAYMENTS_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/payments',
    maxAge: 24 * 60 * 60, // 24 hours
  });

  return response;
}
