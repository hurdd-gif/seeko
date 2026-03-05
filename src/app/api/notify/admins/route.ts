import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { NotificationKind } from '@/lib/types';

async function getAuthenticatedUser() {
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
  return user;
}

/** POST: Notify all admins. Body: { kind, title, body?, link? }. Call after task complete or deliverable upload. */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { kind: NotificationKind; title: string; body?: string; link?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { kind, title, body: notifBody, link } = body;
  if (!kind || !title) return NextResponse.json({ error: 'kind and title required' }, { status: 400 });

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: admins, error: adminError } = await service
    .from('profiles')
    .select('id')
    .eq('is_admin', true);

  if (adminError) {
    console.error('[notify/admins] profiles query failed:', adminError);
    return NextResponse.json({ error: adminError.message }, { status: 500 });
  }
  if (!admins?.length) return NextResponse.json({ success: true, count: 0 });

  const rows = admins.map(({ id }) => ({
    user_id: id,
    kind,
    title,
    body: notifBody ?? null,
    link: link ?? null,
    read: false,
  }));

  const { error: insertError } = await service.from('notifications').insert(rows);
  if (insertError) {
    console.error('[notify/admins] notifications insert failed:', insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, count: rows.length });
}
