import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { getTemplateById, withGuardianSection } from '@/lib/external-agreement-templates';
import { generateAgreementPdf } from '@/lib/agreement-pdf';
import { sendAgreementEmail } from '@/lib/email';
import type { ExternalSigningInvite } from '@/lib/types';

// Rate limiter: max 5 sign attempts per IP per hour (PDF generation is expensive)
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const ipHits = new Map<string, { count: number; resetAt: number }>();

function isSignRateLimited(ip: string): boolean {
  const now = Date.now();
  if (ipHits.size > 100) {
    for (const [key, entry] of ipHits) { if (now > entry.resetAt) ipHits.delete(key); }
  }
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  if (entry.count >= RATE_LIMIT.max) return true;
  entry.count++;
  return false;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, full_name, address, minor_name } = body;

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  const clientIp = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'unknown';
  if (isSignRateLimited(clientIp)) {
    return NextResponse.json({ error: 'Too many sign attempts. Try again later.' }, { status: 429 });
  }
  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    return NextResponse.json({ error: 'Full name required' }, { status: 400 });
  }
  if (full_name.length > 200) {
    return NextResponse.json({ error: 'Full name must be under 200 characters' }, { status: 400 });
  }
  if (!address || typeof address !== 'string' || !address.trim()) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 });
  }
  if (address.length > 500) {
    return NextResponse.json({ error: 'Address must be under 500 characters' }, { status: 400 });
  }

  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, token, status, expires_at, recipient_email, template_type, template_id, custom_sections, custom_title, personal_note, is_guardian_signing')
    .eq('token', token)
    .single() as { data: ExternalSigningInvite | null };

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });

  if (invite.status === 'signed') {
    return NextResponse.json({ error: 'This agreement has already been signed' }, { status: 409 });
  }

  if (invite.status !== 'verified') {
    return NextResponse.json({ error: 'Invite must be verified before signing' }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    await (service.from('external_signing_invites') as any).update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
  }

  if (invite.is_guardian_signing) {
    if (!minor_name || typeof minor_name !== 'string' || !minor_name.trim()) {
      return NextResponse.json({ error: "Minor's full name is required for guardian signing" }, { status: 400 });
    }
    if (minor_name.length > 200) {
      return NextResponse.json({ error: "Minor's full name must be under 200 characters" }, { status: 400 });
    }
  }

  // Capture IP + user agent
  const ip = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Resolve sections
  let sections;
  let title;
  if (invite.template_type === 'preset') {
    const template = getTemplateById(invite.template_id!);
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 400 });
    sections = template.sections;
    title = template.name;
  } else {
    sections = invite.custom_sections || [];
    title = invite.custom_title || 'Agreement';
  }

  if (invite.is_guardian_signing) {
    sections = withGuardianSection(sections);
  }

  // Generate PDF
  const pdfBytes = await generateAgreementPdf({
    title,
    sections,
    signer: {
      fullName: full_name.trim(),
      address: address.trim(),
      email: invite.recipient_email,
      signedAt: new Date(),
      minorName: invite.is_guardian_signing ? minor_name.trim() : undefined,
    },
  });

  // Upload to storage
  const { error: uploadError } = await service.storage
    .from('agreements')
    .upload(`external/${invite.id}/agreement.pdf`, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('PDF upload error:', uploadError);
  }

  // Update invite record
  await (service
    .from('external_signing_invites') as any)
    .update({
      status: 'signed',
      signer_name: full_name.trim(),
      signer_address: address.trim(),
      minor_name: invite.is_guardian_signing ? minor_name.trim() : null,
      signer_ip: ip,
      signer_user_agent: userAgent,
      signed_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  // Send emails (non-blocking)
  sendAgreementEmail({
    recipientEmail: invite.recipient_email,
    signerName: full_name.trim(),
    pdfBytes,
    title,
    sections,
  }).catch(console.error);

  return NextResponse.json({ success: true });
}
