import { NextResponse } from 'next/server';
import { fetchMilestones, fetchTaskActivity } from '@/lib/supabase/data';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const [milestones, activity] = await Promise.all([
    fetchMilestones(id).catch(() => []),
    fetchTaskActivity(id, 25).catch(() => []),
  ]);

  return NextResponse.json({ milestones, activity });
}
