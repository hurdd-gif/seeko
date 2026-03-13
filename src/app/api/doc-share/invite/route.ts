import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { randomBytes, randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { sendDocShareEmail } from '@/lib/email';
import { isValidEmail } from '@/lib/validation';

export async function POST(request: NextRequest) {
  // 1. Auth — admin only
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 2. Validate body
  const body = await request.json();
  const { recipientEmail, docId, personalNote, expiresAt } = body;

  // Email validation
  if (!isValidEmail(recipientEmail)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  // Doc ID validation
  if (!docId || typeof docId !== 'string') {
    return NextResponse.json({ error: 'docId required' }, { status: 400 });
  }

  // Personal note validation
  if (personalNote && typeof personalNote === 'string' && personalNote.length > 1000) {
    return NextResponse.json({ error: 'Personal note must be under 1000 characters' }, { status: 400 });
  }

  // Verify doc exists
  const service = getServiceClient();
  const { data: doc } = await service
    .from('docs')
    .select('id, title')
    .eq('id', docId)
    .single();

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Expiry — default 30 days, set to end of day
  let expiresDate: Date;
  if (expiresAt) {
    expiresDate = new Date(expiresAt);
  } else {
    expiresDate = new Date();
    expiresDate.setDate(expiresDate.getDate() + 30);
  }
  // Set to end-of-day so the expiration date is valid for the rest of the day
  if (expiresDate.getHours() === 0 && expiresDate.getMinutes() === 0) {
    expiresDate.setHours(23, 59, 59, 999);
  }
  if (expiresDate <= new Date()) {
    return NextResponse.json({ error: 'expires_at must be in the future' }, { status: 400 });
  }

  // 3. Generate token and verification code
  const token = randomBytes(32).toString('base64url');
  const verificationCode = String(randomInt(100000, 1000000));
  const hashedCode = await bcrypt.hash(verificationCode, 10);

  // 4. Insert invite
  const { error: insertError } = await service
    .from('external_signing_invites')
    .insert({
      token,
      recipient_email: recipientEmail,
      template_type: 'doc_share',
      purpose: 'doc_share',
      shared_doc_id: docId,
      personal_note: personalNote || null,
      expires_at: expiresDate.toISOString(),
      verification_code: hashedCode,
      status: 'pending',
      created_by: user.id,
    } as never);

  if (insertError) {
    console.error('Failed to create doc share invite:', insertError);
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }

  // 5. Send email (non-blocking)
  sendDocShareEmail({
    recipientEmail,
    token,
    docTitle: doc.title,
    personalNote: personalNote || null,
    expiresAt: expiresDate,
  }).catch((err) => console.error('[doc-share/invite] Failed to send email:', err));

  return NextResponse.json({ success: true });
}
