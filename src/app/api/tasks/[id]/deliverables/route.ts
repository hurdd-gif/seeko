import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { TaskDeliverable } from '@/lib/types';

const BUCKET = 'task-deliverables';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const SIGNED_URL_EXPIRY_SEC = 3600; // 1 hour

async function getSupabaseAndUser() {
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
  return { supabase, user };
}

async function getAdminUser() {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return null;
  return { supabase, user };
}

/** GET: List deliverables for a task. Admin only. Returns rows with signed download URLs. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: taskId } = await params;
  const { supabase } = admin;

  const { data: rows, error } = await supabase
    .from('task_deliverables')
    .select('id, task_id, file_name, storage_path, uploaded_by, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const withUrls: (TaskDeliverable & { download_url?: string })[] = await Promise.all(
    (rows ?? []).map(async (row: Record<string, unknown>) => {
      const path = row.storage_path as string;
      const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_EXPIRY_SEC);
      return {
        ...row,
        download_url: signed?.signedUrl ?? null,
      } as TaskDeliverable & { download_url?: string };
    })
  );

  return NextResponse.json(withUrls);
}

/** POST: Upload a deliverable for a task. Caller must be task assignee or admin. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: taskId } = await params;

  const { data: profile } = await supabase.from('profiles').select('is_admin, display_name').eq('id', user.id).single();
  const { data: task } = await supabase.from('tasks').select('id, assignee_id, name').eq('id', taskId).single();

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const isAdmin = profile?.is_admin ?? false;
  const isAssignee = task.assignee_id === user.id;
  if (!isAdmin && !isAssignee) {
    return NextResponse.json({ error: 'Only the assignee or an admin can upload deliverables for this task' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 25 MB)' }, { status: 400 });
  }

  const storagePath = `${taskId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error: uploadError } = await service.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: inserted, error: insertError } = await service
    .from('task_deliverables')
    .insert({
      task_id: taskId,
      file_name: file.name,
      storage_path: storagePath,
      uploaded_by: user.id,
    })
    .select('id, task_id, file_name, storage_path, uploaded_by, created_at')
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const uploaderName = profile?.display_name ?? 'Someone';
  const taskName = task.name ?? 'Task';
  const { data: admins } = await service.from('profiles').select('id').eq('is_admin', true);
  if (admins?.length) {
    await service.from('notifications').insert(
      admins.map(({ id }) => ({
        user_id: id,
        kind: 'deliverable_uploaded',
        title: 'Deliverable uploaded',
        body: `${uploaderName} uploaded a deliverable for "${taskName}"`,
        link: `/tasks?task=${taskId}`,
        read: false,
      }))
    );
  }

  return NextResponse.json(inserted, { status: 201 });
}
