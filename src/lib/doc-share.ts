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

type DocShareInviteRow = {
  id: string;
  recipient_email: string;
  status: 'pending' | 'verified' | 'signed' | 'expired' | 'revoked';
  expires_at: string;
  shared_doc_id: string;
};

type QueryBuilder = {
  select: (columns: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  single: () => Promise<{ data: unknown | null; error?: unknown }>;
  update: (values: Record<string, unknown>) => QueryBuilder;
};

type DocShareServiceClient = {
  from: (table: string) => QueryBuilder;
};

type LoadDocShareOptions = {
  service?: DocShareServiceClient;
  now?: Date;
};

export async function loadDocShare(
  token: string,
  options: LoadDocShareOptions = {}
): Promise<DocShareLoadResult> {
  const service = options.service ?? (getServiceClient() as unknown as DocShareServiceClient);
  const now = options.now ?? new Date();

  const { data } = await service
    .from('external_signing_invites')
    .select('id, recipient_email, status, expires_at, shared_doc_id')
    .eq('token', token)
    .eq('purpose', 'doc_share')
    .single();

  const invite = data as DocShareInviteRow | null;

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

export function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;
}
