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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { title, content, restricted_department, granted_user_ids } = body;

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;
  if ('restricted_department' in body) updates.restricted_department = restricted_department ?? null;
  if ('granted_user_ids' in body) updates.granted_user_ids = Array.isArray(granted_user_ids) && granted_user_ids.length ? granted_user_ids : null;
  if ('slides' in body) updates.slides = body.slides;
  if ('deck_orientation' in body) updates.deck_orientation = body.deck_orientation;
  updates.updated_at = new Date().toISOString();

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // If slides are being replaced, clean up orphaned slide files in storage
  if ('slides' in body) {
    const { data: existing } = await service.from('docs').select('slides').eq('id', id).single();
    const oldSlides = (existing?.slides as { sort_order: number }[] | null) ?? [];
    const newSlides = (body.slides as { sort_order: number }[] | null) ?? [];
    if (oldSlides.length > newSlides.length) {
      const orphanPaths = Array.from(
        { length: oldSlides.length - newSlides.length },
        (_, i) => `${id}/${newSlides.length + i}.webp`
      );
      await service.storage.from('deck-slides').remove(orphanPaths);
    }
  }

  const { data, error } = await service
    .from('docs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Doc operation error:', error);
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await service.from('docs').delete().eq('id', id);
  if (error) {
    console.error('Doc operation error:', error);
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
