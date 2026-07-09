import type { ExternalSigningInvite } from '@/lib/types';
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

type InvoiceInviteRow = ExternalSigningInvite & {
  prefilled_items: InvoiceLineItem[] | null;
  session_token: string | null;
  submitted_payment_id: string | null;
};

type QueryBuilder = {
  select: (columns: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  single: () => Promise<{ data: unknown | null; error?: unknown }>;
  update: (values: Record<string, unknown>) => QueryBuilder;
};

type InvoiceServiceClient = {
  from: (table: string) => QueryBuilder;
};

type LoadInvoiceRequestOptions = {
  service?: InvoiceServiceClient;
  now?: Date;
  sessionToken?: string | null;
};

export async function loadInvoiceRequest(
  token: string,
  options: LoadInvoiceRequestOptions = {}
): Promise<InvoiceRequestLoadResult> {
  const service = options.service ?? (getServiceClient() as unknown as InvoiceServiceClient);
  const now = options.now ?? new Date();

  const { data } = await service
    .from('external_signing_invites')
    .select('id, recipient_email, status, expires_at, personal_note, prefilled_items, session_token, submitted_payment_id')
    .eq('token', token)
    .eq('purpose', 'invoice')
    .single();

  const invite = data as InvoiceInviteRow | null;

  if (!invite) {
    return { found: false, initialData: { status: 'not_found' } };
  }

  if (new Date(invite.expires_at) < now && invite.status === 'pending') {
    await service
      .from('external_signing_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id);

    return { found: true, initialData: { status: 'expired' } };
  }

  if (invite.status === 'expired' || invite.status === 'revoked') {
    return { found: true, initialData: { status: invite.status } };
  }

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

export function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;
}
