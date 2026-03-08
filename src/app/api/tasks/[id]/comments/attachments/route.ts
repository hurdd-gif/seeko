import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const BUCKET = 'chat-attachments';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'application/pdf', 'application/zip', 'application/x-zip', 'text/plain', 'application/octet-stream'];
const BLOCKED_EXTENSIONS = ['.html', '.htm', '.svg', '.js', '.exe', '.bat', '.sh', '.cmd', '.msi', '.php'];

function isAllowedFile(file: File): boolean {
  const ext = ('.' + (file.name.split('.').pop() ?? '').toLowerCase());
  if (BLOCKED_EXTENSIONS.includes(ext)) return false;
  const mime = (file.type || 'application/octet-stream').toLowerCase();
  return ALLOWED_MIME_PREFIXES.some(prefix => mime.startsWith(prefix));
}
// Use 1 year expiry so stored file_url values don't go stale in the DB.
// The frontend reads file_url directly from task_comment_attachments via Supabase query,
// so a short expiry causes all attachment links to break after the signed URL expires.
const SIGNED_URL_EXPIRY_SEC = 365 * 24 * 60 * 60; // 1 year

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

/** POST: Upload an attachment for a task comment. Requires authenticated user. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getSupabaseAndUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: taskId } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }
  const file = formData.get('file') as File | null;
  const commentId = formData.get('comment_id') as string | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!commentId) return NextResponse.json({ error: 'No comment_id provided' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 });
  }
  if (!isAllowedFile(file)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${taskId}/${commentId}/${Date.now()}-${sanitizedName}`;
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

  const { data: signedUrlData } = await service.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SEC);
  const fileUrl = signedUrlData?.signedUrl ?? '';

  const { data: inserted, error: insertError } = await service
    .from('task_comment_attachments')
    .insert({
      comment_id: commentId,
      file_url: fileUrl,
      file_name: file.name,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      storage_path: storagePath,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json(inserted, { status: 201 });
}
