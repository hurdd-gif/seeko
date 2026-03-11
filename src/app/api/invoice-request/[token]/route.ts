import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import type { ExternalSigningInvite } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, recipient_email, status, expires_at, personal_note, prefilled_items, submitted_payment_id')
    .eq('token', token)
    .eq('purpose', 'invoice')
    .single() as { data: (ExternalSigningInvite & { prefilled_items: { label: string; amount: number }[] | null; submitted_payment_id: string | null }) | null };

  if (!invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  // Check expiration
  if (new Date(invite.expires_at) < new Date() && invite.status === 'pending') {
    await (service
      .from('external_signing_invites') as any)
      .update({ status: 'expired' })
      .eq('id', invite.id);
    return NextResponse.json({ status: 'expired' });
  }

  if (invite.status === 'expired' || invite.status === 'revoked') {
    return NextResponse.json({ status: invite.status });
  }

  // Mask email: j***@example.com
  const [local, domain] = invite.recipient_email.split('@');
  const maskedEmail = `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;

  // Submitted (signed) — fetch linked payment status
  if (invite.status === 'signed' && invite.submitted_payment_id) {
    const { data: payment } = await service
      .from('payments')
      .select('status, amount')
      .eq('id', invite.submitted_payment_id)
      .single();

    return NextResponse.json({
      status: 'submitted',
      paymentStatus: payment?.status || 'pending',
      paymentAmount: payment?.amount || null,
    });
  }

  // Verified — show prefilled items so recipient can fill invoice form
  if (invite.status === 'verified') {
    return NextResponse.json({
      status: invite.status,
      maskedEmail,
      personalNote: invite.personal_note,
      prefilledItems: invite.prefilled_items,
      expiresAt: invite.expires_at,
    });
  }

  // Pending — show masked email only (note hidden until verified)
  return NextResponse.json({
    status: invite.status,
    maskedEmail,
    expiresAt: invite.expires_at,
  });
}
