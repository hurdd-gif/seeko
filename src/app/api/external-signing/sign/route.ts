import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { getTemplateById } from '@/lib/external-agreement-templates';
import { generateAgreementPdf } from '@/lib/agreement-pdf';
import { sendAgreementEmail } from '@/lib/email';
import type { ExternalSigningInvite } from '@/lib/types';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, full_name, address } = body;

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });
  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    return NextResponse.json({ error: 'Full name required' }, { status: 400 });
  }
  if (!address || typeof address !== 'string' || !address.trim()) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 });
  }

  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('*')
    .eq('token', token)
    .single() as { data: ExternalSigningInvite | null };

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });

  if (invite.status !== 'verified') {
    return NextResponse.json({ error: 'Invite must be verified before signing' }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    await (service.from('external_signing_invites') as any).update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
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
    sections = template!.sections;
    title = template!.name;
  } else {
    sections = invite.custom_sections || [];
    title = invite.custom_title || 'Agreement';
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
