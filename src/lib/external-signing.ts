import { getTemplateById } from '@/lib/external-agreement-templates';
import { loadInviteByToken, maskEmail } from '@/lib/invites-repo';
import type { ServiceClient } from '@/lib/invites-repo';
import type { ExternalAgreementSection } from '@/lib/types';

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

type LoadExternalSigningOptions = {
  service?: ServiceClient;
  now?: Date;
};

export async function loadExternalSigningInvite(
  token: string,
  options: LoadExternalSigningOptions = {}
): Promise<ExternalSigningLoadResult> {
  const result = await loadInviteByToken({
    token,
    purpose: 'signing',
    service: options.service,
    now: options.now,
  });

  if (!result.ok) {
    if (result.reason === 'not_found') {
      return { found: false, initialData: { status: 'notfound' } };
    }
    return { found: true, initialData: { status: result.reason } };
  }

  const invite = result.invite;

  if (invite.status === 'signed') {
    return { found: true, initialData: { status: 'signed' } };
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

export { maskEmail } from '@/lib/invites-repo';
