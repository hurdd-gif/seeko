import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { generateAgreementPdf } from '@/lib/agreement-pdf';
import { sendAgreementEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  // 1. Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Check profile — reject admins, reject already-signed
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, nda_accepted_at, department, role, onboarded')
    .eq('id', user.id)
    .single();

  if (profile?.is_admin) {
    return NextResponse.json({ error: 'Admins are exempt from NDA' }, { status: 400 });
  }
  if (profile?.nda_accepted_at) {
    return NextResponse.json({ error: 'Already signed' }, { status: 400 });
  }

  // 3. Parse and validate body
  let body: { full_name?: string; address?: string; engagement_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { full_name, address, engagement_type } = body;

  if (!full_name || typeof full_name !== 'string' || full_name.trim().length === 0) {
    return NextResponse.json({ error: 'full_name is required' }, { status: 400 });
  }
  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 });
  }
  if (!engagement_type || !['team_member', 'contractor'].includes(engagement_type)) {
    return NextResponse.json({ error: 'engagement_type must be team_member or contractor' }, { status: 400 });
  }

  // 4. Capture IP and user agent
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  const now = new Date();

  // 5. Update profile with NDA data
  const service = getServiceClient();
  const { error: updateError } = await service
    .from('profiles')
    .update({
      nda_accepted_at: now.toISOString(),
      nda_signer_name: full_name.trim(),
      nda_signer_address: address.trim(),
      nda_ip: ip,
      nda_user_agent: userAgent,
    } as never)
    .eq('id', user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 6. Generate PDF
  const pdfBytes = await generateAgreementPdf({
    fullName: full_name.trim(),
    address: address.trim(),
    email: user.email ?? '',
    department: profile?.department ?? '',
    role: profile?.role ?? '',
    engagementType: engagement_type as 'team_member' | 'contractor',
    signedAt: now,
  });

  // 7. Upload PDF to Supabase Storage
  const storagePath = `${user.id}/agreement.pdf`;
  const { error: uploadError } = await service.storage
    .from('agreements')
    .upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('Failed to upload agreement PDF:', uploadError.message);
  }

  // 8. Send email (non-blocking — don't fail the request if email fails)
  try {
    await sendAgreementEmail({
      recipientEmail: user.email ?? '',
      signerName: full_name.trim(),
      pdfBytes,
    });
  } catch (emailErr) {
    console.error('Failed to send agreement email:', emailErr);
  }

  // 9. Return redirect path
  const redirect = profile?.onboarded === 0 ? '/onboarding' : '/';
  return NextResponse.json({ success: true, redirect });
}
