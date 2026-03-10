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
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getAdminSupabase();
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { progress, phase, status, description } = body;

  const updates: Record<string, unknown> = {};
  if (typeof progress === 'number' && progress >= 0 && progress <= 100) updates.progress = progress;
  if (phase !== undefined) updates.phase = phase === '' ? null : phase;
  if (status !== undefined) updates.status = status === '' ? null : status;
  if (description !== undefined) updates.description = description === '' ? null : description;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('areas')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Area update error:', error);
    return NextResponse.json({ error: 'Failed to update area' }, { status: 400 });
  }
  return NextResponse.json(data);
}
