import { createClient } from './server';
import type { Task, Area, Profile, Doc, TaskHandoff } from '../types';

export type ActivityItem = {
  id: string;
  user_id?: string;
  action: string;
  target: string;
  created_at: string;
  task_id?: string | null;
  doc_id?: string | null;
  profiles?: Pick<Profile, 'display_name' | 'avatar_url'>;
};

export async function fetchTasks(assigneeId?: string): Promise<Task[]> {
  const supabase = await createClient();

  let query = supabase
    .from('tasks')
    .select('*')
    .order('deadline', { ascending: true, nullsFirst: false });

  if (assigneeId) {
    query = query.eq('assignee_id', assigneeId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function fetchAreas(): Promise<Area[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Area[];
}

export async function fetchTeam(): Promise<Profile[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('display_name', { ascending: true });

  if (error) throw error;
  const all = (data ?? []) as Profile[];
  // Investors are not shown on the team roster (discreet).
  return all.filter(p => !p.is_investor);
}

export async function fetchAllDocs(): Promise<Doc[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('docs')
    .select('id, title')
    .order('title', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Doc[];
}

export async function fetchDocs(parentId?: string): Promise<Doc[]> {
  const supabase = await createClient();

  let query = supabase
    .from('docs')
    .select('*')
    .order('sort_order', { ascending: true });

  if (parentId) {
    query = query.eq('parent_id', parentId);
  } else {
    query = query.is('parent_id', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Doc[];
}

export async function fetchActivity(limit = 20): Promise<ActivityItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('activity_log')
    .select('*, profiles(display_name, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ActivityItem[];
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data as Profile;
}

export async function fetchAllTasksWithAssignees(): Promise<import('../types').TaskWithAssignee[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id, display_name, avatar_url)')
    .order('deadline', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as import('../types').TaskWithAssignee[];
}

export async function fetchTaskHandoffs(taskId: string): Promise<TaskHandoff[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('task_handoffs')
    .select(`
      *,
      from_profile:profiles!task_handoffs_from_user_id_fkey(id, display_name, avatar_url),
      to_profile:profiles!task_handoffs_to_user_id_fkey(id, display_name, avatar_url)
    `)
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  return (data ?? []) as TaskHandoff[];
}

export async function fetchTaskComments(taskId: string): Promise<import('../types').TaskComment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('task_comments')
    .select('*, profiles(id, display_name, avatar_url)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as import('../types').TaskComment[];
}

export async function fetchNotifications(userId: string, limit = 20): Promise<import('../types').Notification[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as import('../types').Notification[];
}

export async function fetchUnreadNotificationCount(userId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) return 0;
  return count ?? 0;
}
