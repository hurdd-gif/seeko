import { cache } from 'react';
import { createClient } from './server';
import type { Task, Area, Profile, Doc, TaskHandoff, Note, NoteSource, Priority, Milestone, TaskActivity } from '../types';

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

export const fetchTasks = cache(async (assigneeId?: string): Promise<Task[]> => {
  const supabase = await createClient();

  let query = supabase
    .from('tasks')
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id, display_name, avatar_url)')
    .order('deadline', { ascending: true, nullsFirst: false });

  if (assigneeId) {
    query = query.eq('assignee_id', assigneeId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Task[];
});

export const fetchAreas = cache(async (): Promise<Area[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('areas')
    .select('id, name, status, progress, description, phase, created_at, sort_order, target_date')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as Area[];
});

export const fetchTeam = cache(async (): Promise<Profile[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, department, role, avatar_url, is_admin, is_contractor, is_investor, onboarded, tour_completed, last_seen_at, timezone, created_at')
    .order('display_name', { ascending: true });

  if (error) throw error;
  const all = (data ?? []) as Profile[];
  // Investors are not shown on the team roster (discreet).
  return all.filter(p => !p.is_investor);
});

export const fetchDocs = cache(async (parentId?: string): Promise<Doc[]> => {
  const supabase = await createClient();

  let query = supabase
    .from('docs')
    .select('id, title, content, parent_id, sort_order, restricted_department, granted_user_ids, type, slides, deck_orientation, created_at, updated_at')
    .order('sort_order', { ascending: true });

  if (parentId) {
    query = query.eq('parent_id', parentId);
  } else {
    query = query.is('parent_id', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Doc[];
});

export const fetchAllDocs = cache(async (): Promise<Doc[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('docs')
    .select('id, title, content, parent_id, sort_order, restricted_department, granted_user_ids, type, slides, deck_orientation, created_at, updated_at')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Doc[];
});

// Lightweight projection of `docs` for the global CommandPalette in the
// dashboard layout. The layout only needs the access-filter fields plus the
// id/title/type used to split docs vs decks — it never touches `content` or
// `slides`, so we omit those (large) columns here to avoid over-fetching on
// every dashboard route. Use `fetchAllDocs` when full doc content is required.
export type PaletteDoc = Pick<
  Doc,
  'id' | 'title' | 'type' | 'restricted_department' | 'granted_user_ids'
>;

export const fetchDocsForPalette = cache(async (): Promise<PaletteDoc[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('docs')
    .select('id, title, type, restricted_department, granted_user_ids')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PaletteDoc[];
});

export const fetchActivity = cache(async (limit = 20): Promise<ActivityItem[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('activity_log')
    .select('*, profiles(display_name, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ActivityItem[];
});

export const fetchMilestones = cache(async (taskId?: string): Promise<Milestone[]> => {
  const supabase = await createClient();

  if (taskId) {
    const { data, error } = await (supabase as any)
      .from('task_milestone')
      .select('milestone:milestones(id, name, target_date, area_id, sort_order, health, created_at)')
      .eq('task_id', taskId);
    if (error) throw error;
    return ((data ?? [])
      .map((r: { milestone: Milestone | Milestone[] | null }) =>
        Array.isArray(r.milestone) ? r.milestone[0] : r.milestone,
      )
      .filter(Boolean) as Milestone[]).sort((a, b) => a.sort_order - b.sort_order);
  }

  const { data, error } = await (supabase as any)
    .from('milestones')
    .select('id, name, target_date, area_id, sort_order, health, created_at')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Milestone[];
});

export const fetchTaskActivity = cache(async (
  taskId: string,
  limit = 10,
): Promise<TaskActivity[]> => {
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('activity_log')
    .select(
      'id, user_id, action, target, task_id, doc_id, kind, before_value, after_value, source, created_at, profiles(display_name, avatar_url)',
    )
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as TaskActivity[];
});

export const fetchProfile = cache(async (userId: string): Promise<Profile | null> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, department, role, avatar_url, is_admin, is_contractor, is_investor, onboarded, tour_completed, must_set_password, last_seen_at, timezone, created_at')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data as Profile;
});

export const fetchAllTasksWithAssignees = cache(async (): Promise<import('../types').TaskWithAssignee[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id, display_name, avatar_url)')
    .order('deadline', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as import('../types').TaskWithAssignee[];
});

// Same select+join+order as fetchAllTasksWithAssignees, but scoped to a single
// assignee server-side. Used by the tasks board for non-admins so we no longer
// fetch every row and filter in memory. Keeps the assignee join intact so board
// cards still render avatar chips and the shape stays TaskWithAssignee[].
export const fetchTasksForAssignee = cache(async (
  assigneeId: string,
): Promise<import('../types').TaskWithAssignee[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id, display_name, avatar_url)')
    .eq('assignee_id', assigneeId)
    .order('deadline', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as import('../types').TaskWithAssignee[];
});

export async function fetchTaskById(
  id: string,
): Promise<import('../types').TaskWithAssignee | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id, display_name, avatar_url)')
    .eq('id', id)
    .maybeSingle();
  if (error) return null;
  return (data ?? null) as import('../types').TaskWithAssignee | null;
}

export async function fetchTaskMilestones(taskId: string): Promise<Milestone[]> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('task_milestone')
    .select('milestone:milestones(*)')
    .eq('task_id', taskId);
  if (error) return [];
  return ((data ?? []) as unknown as { milestone: Milestone | null }[])
    .map((r) => r.milestone)
    .filter((m): m is Milestone => !!m);
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

export const fetchNotifications = cache(async (userId: string, limit = 20): Promise<import('../types').Notification[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, kind, title, body, link, read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as import('../types').Notification[];
});

export const fetchUnreadNotificationCount = cache(async (userId: string): Promise<number> => {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) return 0;
  return count ?? 0;
});

export const fetchTeamWithPaypalEmails = cache(async (): Promise<(Profile & { paypal_email?: string })[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, department, role, avatar_url, is_admin, is_contractor, is_investor, onboarded, tour_completed, paypal_email, created_at')
    .order('display_name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as (Profile & { paypal_email?: string })[];
});

export async function fetchInboxNotes(): Promise<Note[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Note[];
}

export async function fetchArchivedNotes(limit = 50): Promise<Note[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Note[];
}

export async function archiveNote(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('notes').update({ status: 'archived' }).eq('id', id);
  if (error) throw error;
}

export async function createNote(body: string, source: NoteSource = 'web'): Promise<Note> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');
  const { data, error } = await supabase
    .from('notes')
    .insert({ body, source, created_by: user.id })
    .select('*')
    .single();
  if (error) throw error;
  return data as Note;
}

export async function convertNoteToTask(
  noteId: string,
  task: { name: string; department: string; description?: string; assignee_id?: string; deadline?: string; priority?: Priority }
): Promise<Task> {
  const supabase = await createClient();
  const { data: created, error: insertErr } = await supabase
    .from('tasks')
    .insert({ ...task, status: 'In Progress', priority: task.priority ?? 'Medium' } as never)
    .select('*')
    .single();
  if (insertErr) throw insertErr;
  const { error: updateErr } = await supabase
    .from('notes')
    .update({ status: 'archived', converted_to_task_id: created.id })
    .eq('id', noteId);
  if (updateErr) throw updateErr;
  return created as Task;
}

export type RecentItem = {
  id: string;
  kind: 'task';
  title: string;
  updated_at: string;
  href: string;
};

export async function fetchRecentItems(_userId: string, limit = 6): Promise<RecentItem[]> {
  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((tasks ?? []) as { id: string; name: string; created_at: string }[])
    .map((t) => ({
      id: t.id,
      kind: 'task' as const,
      title: t.name,
      updated_at: t.created_at,
      href: `/tasks/${t.id}`,
    }))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, limit);
}

export async function fetchTodayTasks(limit = 5): Promise<Task[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .in('status', ['In Progress', 'In Review'])
    .order('priority', { ascending: false })
    .limit(limit);
  return (data ?? []) as Task[];
}
