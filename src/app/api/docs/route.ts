import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

async function getAdminUser() {
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
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) return null;
  return user;
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { title, content, sort_order, restricted_department, granted_user_ids, type, slides, deck_orientation } = body;

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await service
    .from('docs')
    .insert({
      title,
      content,
      sort_order: sort_order ?? 0,
      restricted_department: restricted_department ?? null,
      granted_user_ids: Array.isArray(granted_user_ids) && granted_user_ids.length ? granted_user_ids : null,
      ...(type === 'deck' ? { type: 'deck' } : {}),
      ...(slides ? { slides } : {}),
      ...(deck_orientation ? { deck_orientation } : {}),
    })
    .select()
    .single();

  if (error) {
    console.error('Doc create error:', error);
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
