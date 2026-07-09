import { loadInviteByToken, maskEmail } from '@/lib/invites-repo';
import type { ServiceClient } from '@/lib/invites-repo';
import { getServiceClient } from '@/lib/supabase/service';

export type InvoiceLineItem = {
  label: string;
  amount: number;
};

export type InvoiceRequestInitialData =
  | { status: 'not_found' }
  | { status: 'expired' | 'revoked' }
  | {
      status: 'submitted';
      paymentStatus: string;
      paymentAmount: number | null;
    }
  | {
      status: 'verified';
      maskedEmail: string;
      personalNote?: string;
      prefilledItems?: InvoiceLineItem[];
      expiresAt: string;
    }
  | {
      status: 'pending';
      maskedEmail: string;
      expiresAt: string;
    };

export type InvoiceRequestLoadResult =
  | { found: false; initialData: Extract<InvoiceRequestInitialData, { status: 'not_found' }> }
  | { found: true; initialData: Exclude<InvoiceRequestInitialData, { status: 'not_found' }> };

type LoadInvoiceRequestOptions = {
  service?: ServiceClient;
  now?: Date;
  sessionToken?: string | null;
};

export async function loadInvoiceRequest(
  token: string,
  options: LoadInvoiceRequestOptions = {}
): Promise<InvoiceRequestLoadResult> {
  const result = await loadInviteByToken({
    token,
    purpose: 'invoice_request',
    service: options.service,
    now: options.now,
  });

  if (!result.ok) {
    if (result.reason === 'not_found') {
      return { found: false, initialData: { status: 'not_found' } };
    }
    return { found: true, initialData: { status: result.reason } };
  }

  const invite = result.invite;
  const service = options.service ?? (getServiceClient() as unknown as ServiceClient);

  if (invite.status === 'signed' && invite.submitted_payment_id) {
    const { data: payment } = await service
      .from('payments')
      .select('status, amount')
      .eq('id', invite.submitted_payment_id)
      .single();

    const submittedPayment = payment as { status?: string; amount?: number | null } | null;

    return {
      found: true,
      initialData: {
        status: 'submitted',
        paymentStatus: submittedPayment?.status || 'pending',
        paymentAmount: submittedPayment?.amount ?? null,
      },
    };
  }

  const maskedEmail = maskEmail(invite.recipient_email);

  if (invite.status === 'verified' && invite.session_token && options.sessionToken === invite.session_token) {
    return {
      found: true,
      initialData: {
        status: invite.status,
        maskedEmail,
        personalNote: invite.personal_note ?? undefined,
        prefilledItems: invite.prefilled_items ?? undefined,
        expiresAt: invite.expires_at,
      },
    };
  }

  return {
    found: true,
    initialData: {
      status: 'pending',
      maskedEmail,
      expiresAt: invite.expires_at,
    },
  };
}

export { maskEmail } from '@/lib/invites-repo';
