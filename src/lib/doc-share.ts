import { loadInviteByToken, maskEmail } from '@/lib/invites-repo';
import type { ServiceClient } from '@/lib/invites-repo';
import { getServiceClient } from '@/lib/supabase/service';

export type DocShareInitialData =
  | { status: 'not_found' }
  | { status: 'expired' | 'revoked' }
  | {
      status: 'pending' | 'verified';
      maskedEmail: string;
      docTitle: string;
      docType: string;
      expiresAt: string;
    };

export type DocShareLoadResult =
  | { found: false; initialData: Extract<DocShareInitialData, { status: 'not_found' }> }
  | { found: true; initialData: Exclude<DocShareInitialData, { status: 'not_found' }> };

type LoadDocShareOptions = {
  service?: ServiceClient;
  now?: Date;
};

export async function loadDocShare(
  token: string,
  options: LoadDocShareOptions = {}
): Promise<DocShareLoadResult> {
  const result = await loadInviteByToken({
    token,
    purpose: 'doc_share',
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

  // doc-share-specific join: the shared doc's title/type live on a
  // separate table, not on the invite row.
  const service = options.service ?? (getServiceClient() as unknown as ServiceClient);
  const { data: doc } = await service
    .from('docs')
    .select('title, type')
    .eq('id', invite.shared_doc_id)
    .single();

  const sharedDoc = doc as { title?: string | null; type?: string | null } | null;

  return {
    found: true,
    initialData: {
      status: invite.status === 'verified' ? 'verified' : 'pending',
      maskedEmail: maskEmail(invite.recipient_email),
      docTitle: sharedDoc?.title || 'Document',
      docType: sharedDoc?.type || 'doc',
      expiresAt: invite.expires_at,
    },
  };
}

export { maskEmail } from '@/lib/invites-repo';
