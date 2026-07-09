import { filterSigningInvites } from '@/lib/invite-filters';
import { getServiceClient } from '@/lib/supabase/service';
import { AccessError } from '@/lib/access-error';
import type { Database } from '@/lib/supabase/database.types';
import type { ExternalSigningInvite } from '@/lib/types';

const PROFILE_SELECT = 'id, display_name, email, is_admin, is_investor' as const;
const SIGNING_INVITE_SELECT =
  'id, token, recipient_email, template_type, template_id, custom_sections, custom_title, personal_note, expires_at, verification_attempts, verified_at, status, signer_name, signer_address, signer_ip, signer_user_agent, signed_at, created_by, created_at, is_guardian_signing, minor_name' as const;

type ProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'display_name' | 'email' | 'is_admin' | 'is_investor'
>;

export type ExternalSigningAdminInvite = {
  id: string;
  recipient_email: string;
  template_type: ExternalSigningInvite['template_type'];
  template_id: string | null;
  custom_title: string | null;
  personal_note: string | null;
  expires_at: string;
  verification_attempts: number;
  verified_at: string | null;
  status: ExternalSigningInvite['status'];
  signer_name: string | null;
  signed_at: string | null;
  created_at: string;
  is_guardian_signing: boolean | null;
  minor_name: string | null;
  expired: boolean;
  title: string;
};

export type ExternalSigningAdminData = {
  profile: {
    id: string;
    displayName: string | null;
    email: string | null;
    isAdmin: boolean;
  };
  invites: ExternalSigningAdminInvite[];
  stats: {
    total: number;
    active: number;
    verified: number;
    signed: number;
    archive: number;
  };
};

export async function loadExternalSigningAdminIndex(currentUser: { id: string }): Promise<ExternalSigningAdminData> {
  const service = getServiceClient();
  const { data: profileData, error: profileError } = await service
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', currentUser.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profileData) throw new AccessError('profile_not_found');

  const profile = profileData as ProfileRow;
  if (!profile.is_admin) throw new AccessError('forbidden', 'admin_required');

  const { data, error } = await service
    .from('external_signing_invites')
    .select(SIGNING_INVITE_SELECT)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;

  const now = Date.now();
  const invites = filterSigningInvites((data ?? []) as unknown as ExternalSigningInvite[]).map((invite) =>
    toAdminInvite(invite, now)
  );

  return {
    profile: {
      id: profile.id,
      displayName: profile.display_name,
      email: profile.email,
      isAdmin: profile.is_admin,
    },
    invites,
    stats: {
      total: invites.length,
      active: invites.filter((invite) => invite.status === 'pending' || invite.status === 'verified').length,
      verified: invites.filter((invite) => invite.status === 'verified').length,
      signed: invites.filter((invite) => invite.status === 'signed').length,
      archive: invites.filter((invite) => invite.status === 'expired' || invite.status === 'revoked' || invite.expired)
        .length,
    },
  };
}

function toAdminInvite(invite: ExternalSigningInvite, now: number): ExternalSigningAdminInvite {
  const expired = invite.status !== 'signed' && invite.status !== 'revoked' && Date.parse(invite.expires_at) < now;

  return {
    id: invite.id,
    recipient_email: invite.recipient_email,
    template_type: invite.template_type,
    template_id: invite.template_id ?? null,
    custom_title: invite.custom_title ?? null,
    personal_note: invite.personal_note ?? null,
    expires_at: invite.expires_at,
    verification_attempts: invite.verification_attempts,
    verified_at: invite.verified_at ?? null,
    status: expired && invite.status === 'pending' ? 'expired' : invite.status,
    signer_name: invite.signer_name ?? null,
    signed_at: invite.signed_at ?? null,
    created_at: invite.created_at,
    is_guardian_signing: invite.is_guardian_signing ?? null,
    minor_name: invite.minor_name ?? null,
    expired,
    title: invite.custom_title || invite.template_id || (invite.template_type === 'custom' ? 'Custom agreement' : 'Preset agreement'),
  };
}
