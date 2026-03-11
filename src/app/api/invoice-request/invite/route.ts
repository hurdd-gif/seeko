import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { randomBytes, randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { sendInvoiceRequestEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  // 1. Auth — admin only
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 2. Validate body
  const body = await request.json();
  const { recipientEmail, items, personalNote, expiresAt } = body;

  // Email validation
  if (!recipientEmail || typeof recipientEmail !== 'string' || recipientEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  // Items validation
  if (items !== undefined) {
    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
    }
    if (items.length > 20) {
      return NextResponse.json({ error: 'Maximum 20 items allowed' }, { status: 400 });
    }
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        return NextResponse.json({ error: 'Each item must be an object' }, { status: 400 });
      }
      if (!item.label || typeof item.label !== 'string' || item.label.trim().length === 0) {
        return NextResponse.json({ error: 'Each item must have a non-empty label' }, { status: 400 });
      }
      if (item.label.length > 200) {
        return NextResponse.json({ error: 'Item label must be under 200 characters' }, { status: 400 });
      }
      if (typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0 || item.amount > 50_000) {
        return NextResponse.json({ error: 'Each item must have a positive amount (max $50,000)' }, { status: 400 });
      }
    }
  }

  // Personal note validation
  if (personalNote && typeof personalNote === 'string' && personalNote.length > 1000) {
    return NextResponse.json({ error: 'Personal note must be under 1000 characters' }, { status: 400 });
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
  const service = getServiceClient();
  const { error: insertError } = await service
    .from('external_signing_invites')
    .insert({
      token,
      recipient_email: recipientEmail,
      template_type: 'invoice',
      purpose: 'invoice',
      prefilled_items: items || null,
      personal_note: personalNote || null,
      expires_at: expiresDate.toISOString(),
      verification_code: hashedCode,
      status: 'pending',
      created_by: user.id,
    } as never);

  if (insertError) {
    console.error('Failed to create invoice invite:', insertError);
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }

  // 5. Send email (non-blocking)
  sendInvoiceRequestEmail({
    recipientEmail,
    token,
    personalNote: personalNote || null,
    expiresAt: expiresDate,
  }).catch((err) => console.error('[invoice-request/invite] Failed to send email:', err));

  return NextResponse.json({ success: true });
}
