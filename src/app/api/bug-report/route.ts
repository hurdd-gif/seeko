import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendBugReportEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const description = formData.get('description') as string;
  const pageUrl = formData.get('pageUrl') as string || '';
  const userAgent = formData.get('userAgent') as string || '';
  const screenSize = formData.get('screenSize') as string || '';
  const isPwa = formData.get('isPwa') === 'true';
  const reporterName = formData.get('reporterName') as string || '';
  const reporterEmail = formData.get('reporterEmail') as string || user.email || '';
  const screenshot = formData.get('screenshot') as File | null;

  if (!description?.trim()) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 });
  }
  if (description.trim().length > 5000) {
    return NextResponse.json({ error: 'Description must be under 5000 characters' }, { status: 400 });
  }

  const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024; // 5 MB
  const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

  let screenshotUrl: string | undefined;

  if (screenshot && screenshot.size > 0) {
    if (screenshot.size > MAX_SCREENSHOT_SIZE) {
      return NextResponse.json({ error: 'Screenshot must be under 5 MB' }, { status: 413 });
    }
    if (!ALLOWED_IMAGE_TYPES.includes(screenshot.type)) {
      return NextResponse.json({ error: 'Screenshot must be an image (PNG, JPEG, GIF, or WebP)' }, { status: 400 });
    }
    const ext = screenshot.name.split('.').pop() || 'png';
    const path = `bug-reports/${user.id}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await screenshot.arrayBuffer());

    const { error: uploadErr } = await supabase.storage
      .from('bug-reports')
      .upload(path, buffer, { contentType: screenshot.type });

    if (!uploadErr) {
      const { data } = supabase.storage.from('bug-reports').getPublicUrl(path);
      screenshotUrl = data.publicUrl;
    }
  }

  await sendBugReportEmail({
    description: description.trim(),
    pageUrl,
    screenshotUrl,
    userAgent,
    screenSize,
    isPwa,
    reporterName,
    reporterEmail,
  });

  return NextResponse.json({ ok: true });
}
