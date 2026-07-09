import { getServiceClient } from '@/lib/supabase/service';
import { AccessError } from '@/lib/access-error';
import type { Database } from '@/lib/supabase/database.types';

const PROFILE_SELECT =
  'id, display_name, email, department, role, avatar_url, is_admin, is_contractor, is_investor, onboarded, tour_completed, must_set_password, timezone, paypal_email' as const;
const TEAM_SELECT = 'id, display_name, department, role, avatar_url, is_admin, is_contractor, is_investor, paypal_email' as const;

type ProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  | 'id'
  | 'display_name'
  | 'email'
  | 'department'
  | 'role'
  | 'avatar_url'
  | 'is_admin'
  | 'is_contractor'
  | 'is_investor'
  | 'onboarded'
  | 'tour_completed'
  | 'must_set_password'
  | 'timezone'
  | 'paypal_email'
>;

type ActivityRow = Pick<
  Database['public']['Tables']['activity_log']['Row'],
  'id' | 'user_id' | 'action' | 'target' | 'created_at' | 'task_id' | 'doc_id'
> & {
  profiles?: Pick<Database['public']['Tables']['profiles']['Row'], 'display_name' | 'avatar_url'> | null;
};

type NotificationRow = Database['public']['Tables']['notifications']['Row'];
type AreaRow = Database['public']['Tables']['areas']['Row'] & { target_date?: string | null };
type TeamRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'display_name' | 'department' | 'role' | 'avatar_url' | 'is_admin' | 'is_contractor' | 'is_investor' | 'paypal_email'
>;

export type DashboardProfile = {
  id: string;
  displayName: string | null;
  email: string | null;
  department: string | null;
  role: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isContractor: boolean;
  timezone: string | null;
  paypalEmail: string | null;
};

export type ActivityIndexData = {
  profile: DashboardProfile;
  activity: {
    id: string;
    action: string;
    target: string;
    createdAt: string | null;
    actorName: string | null;
    actorAvatarUrl: string | null;
    taskId: string | null;
    docId: string | null;
  }[];
};

export type NotificationsIndexData = {
  profile: DashboardProfile;
  unreadCount: number;
  notifications: {
    id: string;
    kind: string;
    title: string;
    body: string | null;
    link: string | null;
    read: boolean;
    createdAt: string;
  }[];
};

export type SettingsIndexData = {
  profile: DashboardProfile;
  team: {
    id: string;
    displayName: string | null;
    department: string | null;
    avatarUrl: string | null;
    isContractor: boolean;
  }[];
  completedTasks: {
    id: string;
    name: string;
    bounty: number | null;
  }[];
};

export type ProgressIndexData = {
  profile: DashboardProfile;
  areas: {
    id: string;
    name: string;
    status: string | null;
    progress: number;
    description: string | null;
    phase: string | null;
    targetDate: string | null;
  }[];
  overallProgress: number;
  activeCount: number;
};

export async function loadActivityIndex(currentUser: { id: string }): Promise<ActivityIndexData> {
  const { profile } = await loadDashboardProfile(currentUser.id);
  const service = getServiceClient();
  const { data, error } = await service
    .from('activity_log')
    .select('id, user_id, action, target, created_at, task_id, doc_id, profiles(display_name, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return {
    profile,
    activity: ((data ?? []) as unknown as ActivityRow[]).map((item) => ({
      id: item.id,
      action: item.action,
      target: item.target,
      createdAt: item.created_at,
      actorName: item.profiles?.display_name ?? null,
      actorAvatarUrl: item.profiles?.avatar_url ?? null,
      taskId: item.task_id,
      docId: item.doc_id,
    })),
  };
}

export async function loadNotificationsIndex(currentUser: { id: string }): Promise<NotificationsIndexData> {
  const { profile } = await loadDashboardProfile(currentUser.id);
  const service = getServiceClient();
  const { data, error } = await service
    .from('notifications')
    .select('id, user_id, kind, title, body, link, read, created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  const notifications = (data ?? []) as NotificationRow[];
  return {
    profile,
    unreadCount: notifications.filter((notification) => !notification.read).length,
    notifications: notifications.map((notification) => ({
      id: notification.id,
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      read: notification.read,
      createdAt: notification.created_at,
    })),
  };
}

export async function loadSettingsIndex(currentUser: { id: string }): Promise<SettingsIndexData> {
  const { profile, rawProfile } = await loadDashboardProfile(currentUser.id);
  const service = getServiceClient();
  const [teamResult, tasksResult] = await Promise.all([
    rawProfile.is_admin
      ? service.from('profiles').select(TEAM_SELECT).order('display_name', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    service
      .from('tasks')
      .select('id, name, bounty')
      .eq('assignee_id', currentUser.id)
      .eq('status', 'Complete')
      .order('created_at', { ascending: false }),
  ]);

  if (teamResult.error) throw teamResult.error;
  if (tasksResult.error) throw tasksResult.error;

  return {
    profile,
    team: ((teamResult.data ?? []) as TeamRow[])
      .filter((member) => !member.is_investor)
      .map((member) => ({
        id: member.id,
        displayName: member.display_name,
        department: member.department,
        avatarUrl: member.avatar_url,
        isContractor: member.is_contractor,
      })),
    completedTasks: ((tasksResult.data ?? []) as { id: string; name: string; bounty: number | null }[]).map((task) => ({
      id: task.id,
      name: task.name,
      bounty: task.bounty,
    })),
  };
}

export async function loadProgressIndex(currentUser: { id: string }): Promise<ProgressIndexData> {
  const { profile } = await loadDashboardProfile(currentUser.id);
  const service = getServiceClient();
  const { data, error } = await service
    .from('areas')
    .select('id, name, status, progress, description, phase, target_date')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;

  const areas = ((data ?? []) as unknown as AreaRow[]).map((area) => ({
    id: area.id,
    name: area.name,
    status: area.status,
    progress: area.progress ?? 0,
    description: area.description,
    phase: area.phase,
    targetDate: area.target_date ?? null,
  }));

  return {
    profile,
    areas,
    overallProgress: areas.length
      ? Math.round(areas.reduce((sum, area) => sum + area.progress, 0) / areas.length)
      : 0,
    activeCount: areas.filter((area) => area.status !== 'Complete').length,
  };
}

async function loadDashboardProfile(userId: string) {
  const service = getServiceClient();
  const { data, error } = await service
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AccessError('profile_not_found');
  if (data.is_investor && !data.is_admin) throw new AccessError('forbidden', 'investor_forbidden');

  return {
    rawProfile: data as ProfileRow,
    profile: toDashboardProfile(data as ProfileRow),
  };
}

function toDashboardProfile(profile: ProfileRow): DashboardProfile {
  return {
    id: profile.id,
    displayName: profile.display_name,
    email: profile.email,
    department: profile.department,
    role: profile.role,
    avatarUrl: profile.avatar_url,
    isAdmin: profile.is_admin,
    isContractor: profile.is_contractor,
    timezone: profile.timezone,
    paypalEmail: profile.paypal_email,
  };
}
