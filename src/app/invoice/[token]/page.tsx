import type { Metadata } from 'next';
import { getServiceClient } from '@/lib/supabase/service';
import { InvoicePageClient } from './client';
import type { ExternalSigningInvite } from '@/lib/types';

// Prevent token leaking via Referer header
export const metadata: Metadata = {
  referrer: 'no-referrer',
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvoicePage({ params }: Props) {
  const { token } = await params;

  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, recipient_email, status, expires_at, personal_note, prefilled_items, submitted_payment_id')
    .eq('token', token)
    .eq('purpose', 'invoice')
    .single() as { data: (ExternalSigningInvite & { prefilled_items: { label: string; amount: number }[] | null; submitted_payment_id: string | null }) | null };

  if (!invite) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">Link not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This invoice link is invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  // Check expiration
  if (new Date(invite.expires_at) < new Date() && invite.status === 'pending') {
    await (service
      .from('external_signing_invites') as any)
      .update({ status: 'expired' })
      .eq('id', invite.id);

    return <InvoicePageClient token={token} initialData={{ status: 'expired' }} />;
  }

  if (invite.status === 'expired' || invite.status === 'revoked') {
    return <InvoicePageClient token={token} initialData={{ status: invite.status }} />;
  }

  // Submitted (signed) — fetch linked payment status
  if (invite.status === 'signed' && invite.submitted_payment_id) {
    const { data: payment } = await service
      .from('payments')
      .select('status, amount')
      .eq('id', invite.submitted_payment_id)
      .single();

    return (
      <InvoicePageClient
        token={token}
        initialData={{
          status: 'submitted',
          paymentStatus: payment?.status || 'pending',
          paymentAmount: payment?.amount || null,
        }}
      />
    );
  }

  // Mask email: j***@example.com
  const [local, domain] = invite.recipient_email.split('@');
  const maskedEmail = `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;

  // Verified — show prefilled items so recipient can fill invoice form
  if (invite.status === 'verified') {
    return (
      <InvoicePageClient
        token={token}
        initialData={{
          status: invite.status,
          maskedEmail,
          personalNote: invite.personal_note ?? undefined,
          prefilledItems: invite.prefilled_items ?? undefined,
          expiresAt: invite.expires_at,
        }}
      />
    );
  }

  // Pending — show masked email only (note hidden until verified)
  return (
    <InvoicePageClient
      token={token}
      initialData={{
        status: invite.status,
        maskedEmail,
        expiresAt: invite.expires_at,
      }}
    />
  );
}
