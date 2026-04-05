import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAdminSupabase() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) return null;
  return supabase;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getAdminSupabase();
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: areaId } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { name, progress, sort_order } = body;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  const progressVal = typeof progress === 'number' ? Math.max(0, Math.min(100, Math.round(progress))) : 0;
  const sortVal = typeof sort_order === 'number' ? sort_order : 0;

  const { data, error } = await supabase
    .from('area_sections')
    .insert({ area_id: areaId, name: name.trim(), progress: progressVal, sort_order: sortVal })
    .select()
    .single();

  if (error) {
    console.error('Section create error:', error);
    return NextResponse.json({ error: 'Failed to create section' }, { status: 400 });
  }
  return NextResponse.json(data);
}
