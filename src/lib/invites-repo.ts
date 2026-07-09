import { isDocShareInvite, isInvoiceInvite, isLocalSigningInvite } from '@/lib/invite-filters';
import { getServiceClient } from '@/lib/supabase/service';
import type { ExternalAgreementSection } from '@/lib/types';

/**
 * The one loader behind the shared `external_signing_invites` table. Three
 * sibling products — external signing, doc sharing, invoice requests — each
 * hand-rolled the same anatomy over this table: token lookup, purpose guard,
 * expiry branch, `maskEmail`. This is that anatomy, parameterized by
 * `InvitePurpose`; everything that genuinely diverges between the three
 * products (status shaping, extra joins, session-token checks) stays in
 * their respective veneers (`external-signing.ts`, `doc-share.ts`,
 * `invoice-request.ts`).
 */
export type InvitePurpose = 'signing' | 'doc_share' | 'invoice_request';

/**
 * Widest row shape shared across the three products' `select()` lists,
 * plus the `purpose` column (needed by the doc-share/invoice guards, which
 * previously filtered on it at the query level instead of selecting it).
 */
export type InviteRow = {
  id: string;
  recipient_email: string;
  status: 'pending' | 'verified' | 'signed' | 'expired' | 'revoked';
  expires_at: string;
  purpose: string;
  template_type: 'preset' | 'custom' | 'invoice' | 'doc_share';
  template_id?: string | null;
  custom_title?: string | null;
  custom_sections?: ExternalAgreementSection[] | null;
  personal_note?: string | null;
  is_guardian_signing?: boolean | null;
  signing_provider?: string | null;
  shared_doc_id?: string | null;
  prefilled_items?: { label: string; amount: number }[] | null;
  session_token?: string | null;
  submitted_payment_id?: string | null;
};

const INVITE_COLUMNS =
  'id, recipient_email, status, expires_at, purpose, template_type, template_id, custom_title, ' +
  'custom_sections, personal_note, is_guardian_signing, signing_provider, shared_doc_id, ' +
  'prefilled_items, session_token, submitted_payment_id';

export type QueryBuilder = {
  select: (columns: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  single: () => Promise<{ data: unknown | null; error?: unknown }>;
  update: (values: Record<string, unknown>) => QueryBuilder;
};

export type ServiceClient = {
  from: (table: string) => QueryBuilder;
};

export type LoadInviteByTokenOptions = {
  token: string;
  purpose: InvitePurpose;
  service?: ServiceClient;
  now?: Date;
};

export type LoadInviteByTokenResult =
  | { ok: true; invite: InviteRow }
  | { ok: false; reason: 'not_found' | 'expired' | 'revoked' };

/**
 * Cross-product isolation guard, applied INSIDE the seam. A row of the
 * wrong purpose is `not_found`, never returned — this is enforced here so
 * no caller can forget it. `signing` reuses `isLocalSigningInvite` (the
 * exact predicate `loadExternalSigningInvite` uses today, which also
 * excludes DocuSign-backed rows from this legacy/local flow — that
 * exclusion is signing-specific, not cross-product isolation, but keeping
 * it here preserves the current behavior exactly, including that a
 * DocuSign row is rejected before the expiry branch ever runs).
 */
function matchesPurpose(purpose: InvitePurpose, row: InviteRow | null): row is InviteRow {
  if (purpose === 'signing') return isLocalSigningInvite(row);
  if (purpose === 'doc_share') return isDocShareInvite(row);
  return isInvoiceInvite(row);
}

/**
 * Loads one invite row by token for the given purpose. Applies the
 * cross-product isolation guard INSIDE the seam (a row of the wrong
 * purpose is not_found, never leaked) and the shared expire-if-past
 * branch (mutates status to 'expired' when past due and still pending,
 * best-effort) and revoked short-circuit. Everything else — status
 * shaping, additional joins, session-token checks — is veneer territory.
 */
export async function loadInviteByToken(opts: LoadInviteByTokenOptions): Promise<LoadInviteByTokenResult> {
  const service = opts.service ?? (getServiceClient() as unknown as ServiceClient);
  const now = opts.now ?? new Date();

  const { data } = await service
    .from('external_signing_invites')
    .select(INVITE_COLUMNS)
    .eq('token', opts.token)
    .single();

  const row = data as InviteRow | null;

  if (!matchesPurpose(opts.purpose, row)) {
    return { ok: false, reason: 'not_found' };
  }

  if (new Date(row.expires_at) < now && row.status === 'pending') {
    await service
      .from('external_signing_invites')
      .update({ status: 'expired' })
      .eq('id', row.id);

    return { ok: false, reason: 'expired' };
  }

  if (row.status === 'expired') {
    return { ok: false, reason: 'expired' };
  }

  if (row.status === 'revoked') {
    return { ok: false, reason: 'revoked' };
  }

  return { ok: true, invite: row };
}

export function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;
}
