import { attributedOnly } from '@/lib/activity-log';
import { getServiceClient } from '@/lib/supabase/service';
import { AccessError } from '@/lib/access-error';
import type { Database } from '@/lib/supabase/database.types';
import type { Priority, TaskStatus } from '@/lib/types';
import { TASK_STATUSES } from '@/lib/types';

const PROFILE_SELECT = 'id, display_name, department, avatar_url, is_admin, is_investor' as const;
export const TASKS_INDEX_SELECT =
  'id, name, department, status, priority, area_id, assignee_id, deadline, description, bounty, created_at, assignee:profiles!tasks_assignee_id_fkey(id, display_name, avatar_url), area:areas!tasks_area_id_fkey(id, name)' as const;

type ProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'display_name' | 'department' | 'avatar_url' | 'is_admin' | 'is_investor'
>;

type TaskIndexRow = Pick<
  Database['public']['Tables']['tasks']['Row'],
  | 'id'
  | 'name'
  | 'department'
  | 'status'
  | 'priority'
  | 'area_id'
  | 'assignee_id'
  | 'deadline'
  | 'description'
  | 'bounty'
  | 'created_at'
> & {
  assignee: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  area: {
    id: string;
    name: string;
  } | null;
};

export type TasksIndexItem = {
  id: string;
  name: string;
  department: string | null;
  status: TaskStatus;
  priority: Priority | null;
  areaId: string | null;
  areaName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatarUrl: string | null;
  deadline: string | null;
  description: string;
  bounty: number | null;
  createdAt: string | null;
  overdue: boolean;
};

export type TasksIndexData = {
  currentUser: {
    id: string;
    email?: string | null;
  };
  profile: {
    id: string;
    displayName: string | null;
    department: string | null;
    avatarUrl: string | null;
    isAdmin: boolean;
  };
  tasks: TasksIndexItem[];
  columns: { status: TaskStatus; tasks: TasksIndexItem[] }[];
  totalCount: number;
  overdueCount: number;
};

export type TaskDetailData = {
  profile: TasksIndexData['profile'];
  task: TasksIndexItem;
  activity: {
    id: string;
    action: string;
    target: string;
    createdAt: string | null;
  }[];
};

export async function loadTasksIndex(currentUser: {
  id: string;
  email?: string | null;
}): Promise<TasksIndexData> {
  const service = getServiceClient();
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', currentUser.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throw new AccessError('profile_not_found');
  if (profile.is_investor && !profile.is_admin) throw new AccessError('forbidden', 'investor_forbidden');

  let query = service
    .from('tasks')
    .select(TASKS_INDEX_SELECT)
    .order('deadline', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (!profile.is_admin) {
    query = query.eq('assignee_id', currentUser.id);
  }

  const { data, error } = await query;
  if (error) throw error;

  const tasks = ((data ?? []) as unknown as TaskIndexRow[]).map(toTasksIndexItem);

  return {
    currentUser,
    profile: toProfile(profile),
    tasks,
    columns: TASK_STATUSES.map((status) => ({
      status,
      tasks: tasks.filter((task) => task.status === status),
    })),
    totalCount: tasks.length,
    overdueCount: tasks.filter((task) => task.overdue).length,
  };
}

export async function loadTaskDetail(
  currentUser: {
    id: string;
    email?: string | null;
  },
  taskId: string,
): Promise<TaskDetailData> {
  const service = getServiceClient();
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', currentUser.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throw new AccessError('profile_not_found');
  if (profile.is_investor && !profile.is_admin) throw new AccessError('forbidden', 'investor_forbidden');

  const { data, error } = await service
    .from('tasks')
    .select(TASKS_INDEX_SELECT)
    .eq('id', taskId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AccessError('not_found');

  const task = toTasksIndexItem(data as unknown as TaskIndexRow);

  if (!profile.is_admin && task.assigneeId !== currentUser.id) {
    throw new AccessError('forbidden');
  }

  const { data: activity } = await attributedOnly(
    service
      .from('activity_log')
      .select('id, action, target, created_at')
      .eq('task_id', taskId),
  )
    .order('created_at', { ascending: false })
    .limit(50);

  return {
    profile: toProfile(profile),
    task,
    activity: ((activity ?? []) as { id: string; action: string; target: string; created_at: string | null }[]).map((item) => ({
      id: item.id,
      action: item.action,
      target: item.target,
      createdAt: item.created_at,
    })),
  };
}

export function toTasksIndexItem(row: TaskIndexRow): TasksIndexItem {
  const status = normalizeTaskStatus(row.status);
  const priority = isPriority(row.priority) ? row.priority : null;
  const deadline = row.deadline;

  return {
    id: row.id,
    name: row.name,
    department: row.department,
    status,
    priority,
    areaId: row.area_id,
    areaName: row.area?.name ?? null,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee?.display_name ?? null,
    assigneeAvatarUrl: row.assignee?.avatar_url ?? null,
    deadline,
    description: (row.description ?? '').trim(),
    bounty: row.bounty,
    createdAt: row.created_at,
    overdue: !!deadline && new Date(deadline).getTime() < startOfToday().getTime() && status !== 'Done',
  };
}

function toProfile(profile: ProfileRow): TasksIndexData['profile'] {
  return {
    id: profile.id,
    displayName: profile.display_name,
    department: profile.department,
    avatarUrl: profile.avatar_url,
    isAdmin: profile.is_admin,
  };
}

function normalizeTaskStatus(status: string | null): TaskStatus {
  if (status === 'Complete') return 'Done';
  if (status === 'Blocked') return 'Backlog';
  if (isTaskStatus(status)) return status;
  return 'Backlog';
}

function isTaskStatus(status: string | null): status is TaskStatus {
  return TASK_STATUSES.includes(status as TaskStatus);
}

function isPriority(priority: string | null): priority is Priority {
  return priority === 'Urgent' || priority === 'High' || priority === 'Medium' || priority === 'Low';
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
