import { getServiceClient } from '@/lib/supabase/service';
import { AccessError } from '@/lib/access-error';
import type { Profile } from '@/lib/types';

export const TEAM_DEPARTMENT_ORDER = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'] as const;
const TEAM_ROSTER_SELECT =
  'id, display_name, department, role, avatar_url, is_admin, is_contractor, is_investor, onboarded, tour_completed, must_set_password, last_seen_at, timezone, nda_accepted_at' as const;

export type TeamRosterMember = Pick<
  Profile,
  | 'id'
  | 'display_name'
  | 'department'
  | 'role'
  | 'avatar_url'
  | 'is_admin'
  | 'is_contractor'
  | 'is_investor'
  | 'onboarded'
  | 'tour_completed'
  | 'must_set_password'
  | 'last_seen_at'
  | 'timezone'
  | 'nda_accepted_at'
>;

export type TeamRosterData = {
  currentUser: {
    id: string;
    email?: string | null;
  };
  currentProfile: TeamRosterMember | null;
  isAdmin: boolean;
  team: TeamRosterMember[];
  members: TeamRosterMember[];
  contractors: TeamRosterMember[];
  onlineCount: number;
};

export async function loadTeamRoster(currentUser: {
  id: string;
  email?: string | null;
}): Promise<TeamRosterData> {
  const service = getServiceClient();
  const { data, error } = await service
    .from('profiles')
    .select(TEAM_ROSTER_SELECT)
    .order('display_name', { ascending: true });

  if (error) throw error;

  const profiles = (data ?? []) as TeamRosterMember[];
  const currentProfile = profiles.find((profile) => profile.id === currentUser.id) ?? null;

  if (!currentProfile) {
    throw new AccessError('profile_not_found');
  }

  if (currentProfile.is_investor && !currentProfile.is_admin) {
    throw new AccessError('forbidden', 'investor_forbidden');
  }

  const team = profiles
    .filter((profile) => !profile.is_investor)
    .sort(compareTeamRosterMembers);
  const members = team.filter((profile) => !profile.is_contractor);
  const contractors = team.filter((profile) => profile.is_contractor);

  return {
    currentUser,
    currentProfile,
    isAdmin: currentProfile.is_admin,
    team,
    members,
    contractors,
    onlineCount: team.filter((profile) => isRosterMemberOnline(profile.last_seen_at)).length,
  };
}

export function compareTeamRosterMembers(a: TeamRosterMember, b: TeamRosterMember) {
  const rank = departmentRank(a.department) - departmentRank(b.department);
  if (rank !== 0) return rank;
  return (a.display_name ?? '').localeCompare(b.display_name ?? '');
}

export function isRosterMemberOnline(lastSeen?: string) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
}

function departmentRank(department?: string) {
  const index = TEAM_DEPARTMENT_ORDER.indexOf(department as (typeof TEAM_DEPARTMENT_ORDER)[number]);
  return index === -1 ? TEAM_DEPARTMENT_ORDER.length : index;
}
