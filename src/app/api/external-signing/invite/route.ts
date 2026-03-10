import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { randomBytes, randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { getTemplateById } from '@/lib/external-agreement-templates';
import { sendExternalInviteEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  // 1. Auth — admin only
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 2. Validate body
  const body = await request.json();
  const { recipient_email, template_type, template_id, custom_sections, custom_title, personal_note, expires_at } = body;

  if (!recipient_email || typeof recipient_email !== 'string' || recipient_email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (personal_note && typeof personal_note === 'string' && personal_note.length > 1000) {
    return NextResponse.json({ error: 'Personal note must be under 1000 characters' }, { status: 400 });
  }
  if (custom_title && typeof custom_title === 'string' && custom_title.length > 200) {
    return NextResponse.json({ error: 'Title must be under 200 characters' }, { status: 400 });
  }
  if (!template_type || !['preset', 'custom'].includes(template_type)) {
    return NextResponse.json({ error: 'template_type must be "preset" or "custom"' }, { status: 400 });
  }
  if (template_type === 'preset' && (!template_id || !getTemplateById(template_id))) {
    return NextResponse.json({ error: 'Invalid template_id' }, { status: 400 });
  }
  if (template_type === 'custom' && (!custom_sections || !Array.isArray(custom_sections) || custom_sections.length === 0)) {
    return NextResponse.json({ error: 'custom_sections required for custom template' }, { status: 400 });
  }
  if (template_type === 'custom' && custom_sections) {
    if (custom_sections.length > 20) {
      return NextResponse.json({ error: 'Maximum 20 sections allowed' }, { status: 400 });
    }
    for (const section of custom_sections) {
      if (!section || typeof section !== 'object') {
        return NextResponse.json({ error: 'Each section must be an object' }, { status: 400 });
      }
      if (typeof section.title === 'string' && section.title.length > 200) {
        return NextResponse.json({ error: 'Section title must be under 200 characters' }, { status: 400 });
      }
      if (typeof section.content === 'string' && section.content.length > 10000) {
        return NextResponse.json({ error: 'Section content must be under 10000 characters' }, { status: 400 });
      }
    }
  }
  if (!expires_at) return NextResponse.json({ error: 'expires_at required' }, { status: 400 });
  const expiresDate = new Date(expires_at);
  // Set to end-of-day so "today" as expiration is valid for the rest of the day
  if (expiresDate.getHours() === 0 && expiresDate.getMinutes() === 0) {
    expiresDate.setHours(23, 59, 59, 999);
  }
  if (expiresDate <= new Date()) return NextResponse.json({ error: 'expires_at must be in the future' }, { status: 400 });

  // 3. Generate token and verification code
  const token = randomBytes(32).toString('base64url');
  const verificationCode = String(randomInt(100000, 1000000));
  const hashedCode = await bcrypt.hash(verificationCode, 10);

  // 4. Get template name for email
  let templateName = custom_title || 'Document';
  if (template_type === 'preset') {
    const template = getTemplateById(template_id);
    templateName = template!.name;
  }

  // 5. Insert invite
  const service = getServiceClient();
  const { error: insertError } = await service
    .from('external_signing_invites')
    .insert({
      token,
      recipient_email,
      template_type,
      template_id: template_type === 'preset' ? template_id : null,
      custom_sections: template_type === 'custom' ? custom_sections : null,
      custom_title: template_type === 'custom' ? custom_title : null,
      personal_note: personal_note || null,
      expires_at: expiresDate.toISOString(),
      verification_code: hashedCode,
      status: 'pending',
      created_by: user.id,
    });

  if (insertError) {
    console.error('Failed to create invite:', insertError);
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }

  // 6. Send invite email (non-blocking)
  sendExternalInviteEmail({
    recipientEmail: recipient_email,
    token,
    personalNote: personal_note,
    templateName,
    expiresAt: expiresDate,
  }).catch(console.error);

  return NextResponse.json({ success: true });
}
