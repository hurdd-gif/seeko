import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { NotificationKind } from '@/lib/types';
import { isValidNotificationKind } from '@/lib/notification-kinds';

// Rate limiter: 30 notifications per user per minute
const RATE_LIMIT = { max: 30, windowMs: 60 * 1000 };
const userHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = userHits.get(userId);
  if (!entry || now > entry.resetAt) {
    userHits.set(userId, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  if (entry.count >= RATE_LIMIT.max) return true;
  entry.count++;
  return false;
}

/** POST: Notify a specific user. Body: { userId, kind, title, body?, link? } */
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

  if (isRateLimited(user.id)) {
    return NextResponse.json({ error: 'Too many notifications. Try again later.' }, { status: 429 });
  }

  let body: { userId: string; kind: NotificationKind; title: string; body?: string; link?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { userId, kind, title, body: notifBody, link } = body;
  if (!userId || !kind || !title) {
    return NextResponse.json({ error: 'userId, kind, and title required' }, { status: 400 });
  }

  if (!isValidNotificationKind(kind)) {
    return NextResponse.json({ error: 'Invalid notification kind' }, { status: 400 });
  }

  // Only allow internal relative paths as notification links (no external URLs)
  if (link && (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//'))) {
    return NextResponse.json({ error: 'link must be a relative path starting with /' }, { status: 400 });
  }

  // Don't notify yourself
  if (userId === user.id) return NextResponse.json({ success: true, skipped: true });

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await service.from('notifications').insert({
    user_id: userId,
    kind,
    title,
    body: notifBody ?? null,
    link: link ?? null,
    read: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
