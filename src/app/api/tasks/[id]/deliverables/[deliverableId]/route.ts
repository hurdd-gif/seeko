import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const BUCKET = 'task-deliverables';

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
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return null;
  return { supabase, user };
}

/** DELETE: Remove a deliverable. Admin only. Deletes DB row and storage object. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; deliverableId: string }> }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: taskId, deliverableId } = await params;

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: row, error: fetchError } = await service
    .from('task_deliverables')
    .select('id, task_id, storage_path')
    .eq('id', deliverableId)
    .eq('task_id', taskId)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Deliverable not found' }, { status: 404 });
  }

  const { error: storageError } = await service.storage.from(BUCKET).remove([row.storage_path as string]);
  if (storageError) {
    console.error('Deliverable storage delete error:', storageError);
    return NextResponse.json({ error: 'Failed to delete file from storage' }, { status: 500 });
  }

  const { error: deleteError } = await service
    .from('task_deliverables')
    .delete()
    .eq('id', deliverableId)
    .eq('task_id', taskId);

  if (deleteError) {
    console.error('Deliverable record delete error:', deleteError);
    return NextResponse.json({ error: 'Failed to delete deliverable record' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
