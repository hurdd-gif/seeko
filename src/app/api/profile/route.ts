import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function PATCH(request: NextRequest) {
  // Verify the caller is an authenticated admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { userId?: string; department?: string; is_contractor?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { userId, department, is_contractor } = body;
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const updates: { department?: string; is_contractor?: boolean } = {};
  if (department !== undefined) updates.department = department;
  if (is_contractor !== undefined) updates.is_contractor = is_contractor;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const admin = getServiceClient();

  const { error } = await admin
    .from('profiles')
    .update(updates as never)
    .eq('id', userId);

  if (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
