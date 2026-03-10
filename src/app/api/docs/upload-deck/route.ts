import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB per slide image

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

  const formData = await req.formData();
  const deckId = formData.get('deckId') as string;
  const slideIndex = formData.get('slideIndex') as string;
  const file = formData.get('file') as File | null;

  if (!deckId || slideIndex == null || !file) {
    return NextResponse.json({ error: 'Missing deckId, slideIndex, or file' }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `${deckId}/${slideIndex}.webp`;

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await service.storage
    .from('deck-slides')
    .upload(path, buffer, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (error) {
    console.error('Deck slide upload error:', error);
    return NextResponse.json({ error: 'Failed to upload slide' }, { status: 500 });
  }

  const { data: urlData } = service.storage
    .from('deck-slides')
    .getPublicUrl(path);

  return NextResponse.json({ url: urlData.publicUrl, sort_order: Number(slideIndex) }, { status: 201 });
}
