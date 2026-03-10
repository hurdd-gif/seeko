import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { TaskDeliverable } from '@/lib/types';

const BUCKET = 'task-deliverables';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

// Rate limiter: max 10 uploads per user per hour
const UPLOAD_RATE = { max: 10, windowMs: 60 * 60 * 1000 };
const uploadHits = new Map<string, { count: number; resetAt: number }>();

function isUploadRateLimited(userId: string): boolean {
  const now = Date.now();
  if (uploadHits.size > 100) {
    for (const [key, entry] of uploadHits) { if (now > entry.resetAt) uploadHits.delete(key); }
  }
  const entry = uploadHits.get(userId);
  if (!entry || now > entry.resetAt) {
    uploadHits.set(userId, { count: 1, resetAt: now + UPLOAD_RATE.windowMs });
    return false;
  }
  if (entry.count >= UPLOAD_RATE.max) return true;
  entry.count++;
  return false;
}

// Allowlisted MIME prefixes for uploads — blocks HTML, SVG, and executable types
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'application/pdf', 'application/zip', 'application/x-zip', 'text/plain', 'application/octet-stream'];
const BLOCKED_EXTENSIONS = ['.html', '.htm', '.svg', '.js', '.exe', '.bat', '.sh', '.cmd', '.msi', '.php'];

function isAllowedFile(file: File): boolean {
  const ext = ('.' + (file.name.split('.').pop() ?? '').toLowerCase());
  if (BLOCKED_EXTENSIONS.includes(ext)) return false;
  const mime = (file.type || 'application/octet-stream').toLowerCase();
  return ALLOWED_MIME_PREFIXES.some(prefix => mime.startsWith(prefix));
}
const SIGNED_URL_EXPIRY_SEC = 365 * 24 * 3600; // 1 year — deliverables are long-lived; 1 h caused links to expire before admins could review them

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

  if (error) {
    console.error('Deliverables query error:', error);
    return NextResponse.json({ error: 'Failed to fetch deliverables' }, { status: 500 });
  }

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

  if (isUploadRateLimited(user.id)) {
    return NextResponse.json({ error: 'Too many uploads. Try again later.' }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 25 MB)' }, { status: 400 });
  }
  if (!isAllowedFile(file)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
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

  if (uploadError) {
    console.error('Deliverable upload error:', uploadError);
    return NextResponse.json({ error: 'Failed to upload deliverable' }, { status: 500 });
  }

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

  if (insertError) {
    console.error('Deliverable insert error:', insertError);
    return NextResponse.json({ error: 'Failed to save deliverable record' }, { status: 500 });
  }

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
