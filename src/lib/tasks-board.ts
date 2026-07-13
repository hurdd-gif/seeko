import { attributedOnly } from '@/lib/activity-log';
import { getServiceClient } from '@/lib/supabase/service';
import { getInitials } from '@/lib/utils';
import { AccessError } from '@/lib/access-error';
import type {
  Area,
  LinkedTask,
  Milestone,
  Notification,
  PendingExtension,
  Profile,
  TaskActivity,
  TaskComment,
  TaskWithAssignee,
} from '@/lib/types';

/**
 * Rich payload for the original `<TasksBoard>` (the Linear/Height-style board on
 * /tasks). This mirrors the data the legacy Next.js server component composed via
 * `Promise.all` (tasks-with-assignees + team + areas + milestones + activity +
 * notifications), so the React Router route can render the SAME component with the
 * SAME props — keeping the migrated board pixel-faithful to the shipped page.
 *
 * `account` is the global header cluster (StudioHeaderActions) Issues now owns.
 * `userId` is the signed-in user's id — present so the header mounts the live
 * realtime NotificationBell (it opens a Supabase channel on the `notifications`
 * table at mount), rather than the static Inbox glyph.
 */
export type TasksBoardAccount = {
  email: string;
  initials: string;
  displayName?: string;
  avatarUrl?: string;
  userId?: string;
  isAdmin: boolean;
  unreadCount: number;
  notifications: Notification[];
  team: { id: string; display_name?: string | null }[];
  areas: { id: string; name: string }[];
};

export type TasksBoardData = {
  tasks: TaskWithAssignee[];
  team: Profile[];
  areas: Area[];
  projectMilestones: Milestone[];
  projectActivity: TaskActivity[];
  isAdmin: boolean;
  currentUserId: string;
  account: TasksBoardAccount;
};

const PROFILE_SELECT =
  'id, display_name, department, avatar_url, is_admin, is_investor' as const;
const TASK_SELECT =
  '*, assignee:profiles!tasks_assignee_id_fkey(id, display_name, avatar_url)' as const;
const TEAM_SELECT =
  'id, display_name, department, role, avatar_url, is_admin, is_contractor, is_investor, onboarded, tour_completed, last_seen_at, timezone, created_at' as const;
const AREA_SELECT =
  'id, name, status, progress, description, phase, created_at, sort_order, target_date' as const;
const MILESTONE_SELECT =
  'id, name, target_date, area_id, sort_order, health, created_at' as const;
const NOTIFICATION_SELECT =
  'id, user_id, kind, title, body, link, read, created_at' as const;

export async function loadTasksBoard(currentUser: {
  id: string;
  email?: string | null;
}): Promise<TasksBoardData> {
  const service = getServiceClient();

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', currentUser.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throw new AccessError('profile_not_found');
  if (profile.is_investor && !profile.is_admin) {
    throw new AccessError('forbidden', 'investor_forbidden');
  }

  const isAdmin = Boolean(profile.is_admin);

  // Admins see every task; non-admins are scoped to their own server-side (same
  // join + deadline order, just an extra assignee_id filter) so the board cards
  // still render avatar chips and the shape stays TaskWithAssignee[].
  let taskQuery = service
    .from('tasks')
    .select(TASK_SELECT)
    .order('deadline', { ascending: true, nullsFirst: false });
  if (!isAdmin) {
    taskQuery = taskQuery.eq('assignee_id', currentUser.id);
  }

  const [
    tasksResult,
    teamResult,
    areasResult,
    milestonesResult,
    activityResult,
    notificationsResult,
    unreadResult,
  ] = await Promise.all([
    taskQuery,
    service.from('profiles').select(TEAM_SELECT).order('display_name', { ascending: true }),
    service
      .from('areas')
      .select(AREA_SELECT)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    // milestones isn't in the generated Database types yet — same cast as data.ts.
    (service as any).from('milestones').select(MILESTONE_SELECT).order('sort_order', { ascending: true }),
    attributedOnly(service.from('activity_log').select('*, profiles(display_name, avatar_url)'))
      .order('created_at', { ascending: false })
      .limit(15),
    service
      .from('notifications')
      .select(NOTIFICATION_SELECT)
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(20),
    service
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .eq('read', false),
  ]);

  if (tasksResult.error) throw tasksResult.error;

  const tasks = (tasksResult.data ?? []) as unknown as TaskWithAssignee[];
  // Investors are not shown on the roster (discreet), matching fetchTeam().
  const team = ((teamResult.data ?? []) as unknown as Profile[]).filter((p) => !p.is_investor);
  const areas = (areasResult.data ?? []) as unknown as Area[];
  const projectMilestones = (milestonesResult.data ?? []) as unknown as Milestone[];
  const projectActivity = (activityResult.data ?? []) as unknown as TaskActivity[];
  const notifications = (notificationsResult.data ?? []) as unknown as Notification[];
  const unreadCount = unreadResult.count ?? 0;

  const account: TasksBoardAccount = {
    email: currentUser.email ?? '',
    initials: getInitials(profile.display_name ?? currentUser.email ?? 'U'),
    displayName: profile.display_name ?? undefined,
    avatarUrl: profile.avatar_url ?? undefined,
    // userId drives the live realtime NotificationBell (vs. the static Inbox
    // glyph) in StudioHeaderActions — see the doc comment on TasksBoardData.
    userId: currentUser.id,
    isAdmin,
    unreadCount,
    notifications,
    team: team.map((m) => ({ id: m.id, display_name: m.display_name })),
    areas: areas.map((a) => ({ id: a.id, name: a.name })),
  };

  return {
    tasks,
    team,
    areas,
    projectMilestones,
    projectActivity,
    isAdmin,
    currentUserId: currentUser.id,
    account,
  };
}

/**
 * Rich payload for the original `<TaskDetailPage>` (full-page Linear-style issue
 * detail at /tasks/:id). Mirrors the data the legacy Next.js server component
 * (`tasks/[id]/page.tsx`) composed: the task-with-assignee plus team, areas,
 * the task's linked milestones, and its activity — so the React Router route
 * renders the SAME component with the SAME props.
 */
export type TaskDetailFullData = {
  task: TaskWithAssignee;
  areas: Area[];
  team: Profile[];
  milestones: Milestone[];
  activity: TaskActivity[];
  comments: TaskComment[];
  currentUserId: string;
  isAdmin: boolean;
  pendingExtension: PendingExtension | null;
  /** The tasks this task is connected to (symmetric — see fetchTaskLinks). */
  links: LinkedTask[];
  /**
   * Every OTHER task, for the link picker — minus this task and minus anything
   * already linked. Ordered newest-first (task_number desc) so the picker's
   * default list is useful before the user types a single character.
   */
  linkCandidates: LinkedTask[];
};

type ServiceClient = ReturnType<typeof getServiceClient>;

const LINKED_TASK_SELECT = 'id, task_number, name, status' as const;
// Two FKs from task_links → tasks, so each embed must name its constraint or
// PostgREST can't tell which one to follow.
const TASK_LINK_SELECT =
  `task_a:tasks!task_links_task_a_fkey(${LINKED_TASK_SELECT}), task_b:tasks!task_links_task_b_fkey(${LINKED_TASK_SELECT})` as const;

/**
 * The ONE place the LinkedTask[] shape is produced. Used by loadTaskDetailFull
 * AND by both link-write routes (which return the full list after the write), so
 * the shape cannot drift between the initial load and a post-write replacement.
 *
 * Links are symmetric and stored canonically (smaller uuid in task_a — see
 * 20260713120000_task_links.sql), so "what is X connected to?" must read BOTH
 * columns and then take whichever side ISN'T X. Which side that is depends on the
 * uuids, not on who asked — hence the per-row id comparison rather than a fixed
 * column.
 */
export async function fetchTaskLinks(
  service: ServiceClient,
  taskId: string,
): Promise<LinkedTask[]> {
  // task_links isn't in the generated Database types yet — same cast as
  // task_milestone below.
  const { data, error } = await (service as any)
    .from('task_links')
    .select(TASK_LINK_SELECT)
    .or(`task_a.eq.${taskId},task_b.eq.${taskId}`);
  if (error) throw error;

  const rows = (data ?? []) as { task_a: LinkedTask | null; task_b: LinkedTask | null }[];
  return rows
    .map((row) => (row.task_a?.id === taskId ? row.task_b : row.task_a))
    .filter((linked): linked is LinkedTask => Boolean(linked))
    .sort((a, b) => (b.task_number ?? 0) - (a.task_number ?? 0));
}

const TASK_ACTIVITY_SELECT =
  'id, user_id, action, target, task_id, doc_id, kind, before_value, after_value, source, created_at, profiles(display_name, avatar_url)' as const;
// Same joins the legacy TaskDetail sheet used client-side; loaded server-side
// here so the thread renders (and is dev-testable) without a browser session.
const TASK_COMMENT_SELECT =
  '*, profiles(id, display_name, avatar_url), task_comment_reactions(id, emoji, user_id), task_comment_attachments(id, file_url, file_name, file_type, file_size)' as const;
const PENDING_EXT_SELECT =
  'id, requested_by, original_deadline, requested_deadline, reason, status, profiles!requested_by(display_name)' as const;

export async function loadTaskDetailFull(
  currentUser: { id: string; email?: string | null },
  taskId: string,
): Promise<TaskDetailFullData> {
  const service = getServiceClient();

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', currentUser.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throw new AccessError('profile_not_found');
  if (profile.is_investor && !profile.is_admin) {
    throw new AccessError('forbidden', 'investor_forbidden');
  }

  const isAdmin = Boolean(profile.is_admin);

  const { data: taskRow, error: taskError } = await service
    .from('tasks')
    .select(TASK_SELECT)
    .eq('id', taskId)
    .maybeSingle();

  if (taskError) throw taskError;
  if (!taskRow) throw new AccessError('not_found');

  const task = taskRow as unknown as TaskWithAssignee;

  // Non-admins may only open their own assigned tasks (matches the original
  // page's notFound() guard).
  if (!isAdmin && task.assignee_id !== currentUser.id) {
    throw new AccessError('forbidden');
  }

  const [
    teamResult,
    areasResult,
    milestonesResult,
    activityResult,
    commentsResult,
    extResult,
    links,
    candidatesResult,
  ] = await Promise.all([
    service.from('profiles').select(TEAM_SELECT).order('display_name', { ascending: true }),
    service
      .from('areas')
      .select(AREA_SELECT)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    // task_milestone isn't in the generated Database types yet — same cast as data.ts.
    (service as any).from('task_milestone').select('milestone:milestones(*)').eq('task_id', taskId),
    attributedOnly(
      service
        .from('activity_log')
        .select(TASK_ACTIVITY_SELECT)
        .eq('task_id', taskId),
    )
      .order('created_at', { ascending: false })
      .limit(50),
    service
      .from('task_comments')
      .select(TASK_COMMENT_SELECT)
      .eq('task_id', taskId)
      .order('created_at', { ascending: true }),
    service
      .from('deadline_extensions')
      .select(PENDING_EXT_SELECT)
      .eq('task_id', taskId)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle(),
    fetchTaskLinks(service, taskId),
    // Picker candidates: every task but this one. The "already linked" exclusion
    // is applied in memory below — it depends on `links`, and folding it into the
    // query would cost a round trip by serialising two independent reads.
    service
      .from('tasks')
      .select(LINKED_TASK_SELECT)
      .neq('id', taskId)
      .order('task_number', { ascending: false, nullsFirst: false }),
  ]);

  // Investors are not shown on the roster (discreet), matching fetchTeam().
  const team = ((teamResult.data ?? []) as unknown as Profile[]).filter((p) => !p.is_investor);
  const areas = (areasResult.data ?? []) as unknown as Area[];
  const milestones = ((milestonesResult.data ?? []) as unknown as { milestone: Milestone | null }[])
    .map((row) => row.milestone)
    .filter((m): m is Milestone => Boolean(m));
  const activity = (activityResult.data ?? []) as unknown as TaskActivity[];
  const comments = ((commentsResult.data ?? []) as unknown as Record<string, unknown>[]).map(
    (c) => ({
      ...c,
      reactions: c.task_comment_reactions ?? [],
      attachments: c.task_comment_attachments ?? [],
    }),
  ) as unknown as TaskComment[];

  const extRow = (extResult.data ?? null) as unknown as {
    id: string;
    original_deadline: string;
    requested_deadline: string;
    reason: string | null;
    profiles?: { display_name?: string | null };
  } | null;
  const pendingExtension: PendingExtension | null = extRow
    ? {
        id: extRow.id,
        requesterName: extRow.profiles?.display_name ?? 'Someone',
        originalDeadline: extRow.original_deadline,
        requestedDeadline: extRow.requested_deadline,
        reason: extRow.reason ?? null,
      }
    : null;

  const linkedIds = new Set(links.map((linked) => linked.id));
  const linkCandidates = ((candidatesResult.data ?? []) as unknown as LinkedTask[]).filter(
    (candidate) => !linkedIds.has(candidate.id),
  );

  return {
    task,
    areas,
    team,
    milestones,
    activity,
    comments,
    currentUserId: currentUser.id,
    isAdmin,
    pendingExtension,
    links,
    linkCandidates,
  };
}
