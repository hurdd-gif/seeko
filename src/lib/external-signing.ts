import { getTemplateById } from '@/lib/external-agreement-templates';
import { isLocalSigningInvite } from '@/lib/invite-filters';
import { getServiceClient } from '@/lib/supabase/service';
import type { ExternalAgreementSection, ExternalSigningInvite } from '@/lib/types';

export type ExternalSigningInitialData =
  | { status: 'notfound' }
  | { status: 'expired' | 'revoked' | 'signed' }
  | {
      status: 'pending' | 'verified';
      maskedEmail: string;
      templateName: string;
      personalNote?: string;
      sections?: ExternalAgreementSection[];
      isGuardianSigning?: boolean;
    };

export type ExternalSigningLoadResult =
  | { found: false; initialData: Extract<ExternalSigningInitialData, { status: 'notfound' }> }
  | { found: true; initialData: Exclude<ExternalSigningInitialData, { status: 'notfound' }> };

type SigningInviteRow = ExternalSigningInvite & {
  custom_sections?: ExternalAgreementSection[] | null;
};

type QueryBuilder = {
  select: (columns: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  single: () => Promise<{ data: unknown | null; error?: unknown }>;
  update: (values: Record<string, unknown>) => QueryBuilder;
};

type SigningServiceClient = {
  from: (table: string) => QueryBuilder;
};

type LoadExternalSigningOptions = {
  service?: SigningServiceClient;
  now?: Date;
};

export async function loadExternalSigningInvite(
  token: string,
  options: LoadExternalSigningOptions = {}
): Promise<ExternalSigningLoadResult> {
  const service = options.service ?? (getServiceClient() as unknown as SigningServiceClient);
  const now = options.now ?? new Date();

  const { data } = await service
    .from('external_signing_invites')
    .select('id, recipient_email, status, expires_at, template_type, template_id, custom_title, custom_sections, personal_note, is_guardian_signing, signing_provider')
    .eq('token', token)
    .single();

  const invite = data as SigningInviteRow | null;

  if (!isLocalSigningInvite(invite)) {
    return { found: false, initialData: { status: 'notfound' } };
  }

  if (new Date(invite.expires_at) < now && invite.status === 'pending') {
    await service
      .from('external_signing_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id);

    return { found: true, initialData: { status: 'expired' } };
  }

  if (invite.status === 'expired' || invite.status === 'revoked' || invite.status === 'signed') {
    return { found: true, initialData: { status: invite.status } };
  }

  const template = invite.template_type === 'preset' && invite.template_id
    ? getTemplateById(invite.template_id)
    : null;
  const templateName = template?.name || invite.custom_title || 'Document';
  const sections = invite.status === 'verified'
    ? template?.sections ?? invite.custom_sections ?? undefined
    : undefined;

  return {
    found: true,
    initialData: {
      status: invite.status === 'verified' ? 'verified' : 'pending',
      maskedEmail: maskEmail(invite.recipient_email),
      templateName,
      personalNote: invite.personal_note ?? undefined,
      isGuardianSigning: invite.is_guardian_signing ?? false,
      ...(sections ? { sections } : {}),
    },
  };
}

export function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;
}
