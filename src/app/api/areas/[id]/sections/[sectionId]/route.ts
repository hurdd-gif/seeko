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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const supabase = await getAdminSupabase();
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { sectionId } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { name, progress, sort_order } = body;

  const updates: Record<string, unknown> = {};
  if (typeof name === 'string' && name.trim().length > 0) updates.name = name.trim();
  if (typeof progress === 'number') updates.progress = Math.max(0, Math.min(100, Math.round(progress)));
  if (typeof sort_order === 'number') updates.sort_order = sort_order;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('area_sections')
    .update(updates)
    .eq('id', sectionId)
    .select()
    .single();

  if (error) {
    console.error('Section update error:', error);
    return NextResponse.json({ error: 'Failed to update section' }, { status: 400 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const supabase = await getAdminSupabase();
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { sectionId } = await params;
  const { error } = await supabase.from('area_sections').delete().eq('id', sectionId);

  if (error) {
    console.error('Section delete error:', error);
    return NextResponse.json({ error: 'Failed to delete section' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
