import { attributedOnly } from '@/lib/activity-log';
import { getServiceClient } from '@/lib/supabase/service';
import { AccessError } from '@/lib/access-error';
import type { Database } from '@/lib/supabase/database.types';
import { TASKS_INDEX_SELECT, toTasksIndexItem, type TasksIndexItem } from '@/lib/tasks-index';
import type { Doc, Profile } from '@/lib/types';

const PROFILE_SELECT =
  'id, display_name, email, department, avatar_url, is_admin, is_investor, timezone, paypal_email' as const;
// Full Doc columns (incl. parent_id) so the shared <DocList> can build the tree
// and render the read/deck view — matches dashboard-views' DOC_SELECT.
const DOC_FULL_SELECT =
  'id, title, content, parent_id, sort_order, restricted_department, granted_user_ids, type, slides, deck_orientation, created_at, updated_at' as const;
const AREA_SELECT = 'id, name, status, progress, description, phase, sort_order, target_date' as const;

type ProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  | 'id'
  | 'display_name'
  | 'email'
  | 'department'
  | 'avatar_url'
  | 'is_admin'
  | 'is_investor'
  | 'timezone'
  | 'paypal_email'
>;

type AreaRow = Database['public']['Tables']['areas']['Row'] & { target_date?: string | null };

type ActivityRow = Pick<
  Database['public']['Tables']['activity_log']['Row'],
  'id' | 'action' | 'target' | 'created_at' | 'task_id' | 'doc_id'
>;

type PaymentRow = Pick<
  Database['public']['Tables']['payments']['Row'],
  'id' | 'recipient_id' | 'amount' | 'currency' | 'description' | 'status' | 'paid_at' | 'created_at'
> & {
  recipient?: Pick<
    Database['public']['Tables']['profiles']['Row'],
    'id' | 'display_name' | 'avatar_url' | 'department'
  > | null;
  items?: {
    id: string;
    payment_id: string;
    task_id: string | null;
    label: string;
    amount: number;
  }[];
};

export type InvestorProfile = {
  id: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  timezone: string | null;
  paypalEmail: string | null;
  isAdmin: boolean;
  isInvestor: boolean;
};

export type InvestorOverviewData = {
  profile: InvestorProfile;
  stats: {
    totalTasks: number;
    completedTasks: number;
    overallProgress: number;
    blockedTasks: number;
    overdueTasks: number;
    activeAreas: number;
    completedThisWeek: number;
  };
  areas: {
    id: string;
    name: string;
    status: string | null;
    progress: number;
    description: string | null;
    phase: string | null;
    targetDate: string | null;
    taskCount: number;
    completedTaskCount: number;
  }[];
  recentActivity: {
    id: string;
    action: string;
    target: string;
    createdAt: string | null;
    taskId: string | null;
    docId: string | null;
  }[];
  /** Ordered by sort_order then target_date; counts exclude Canceled/Duplicate. */
  milestones: {
    id: string;
    name: string;
    targetDate: string | null;
    taskCount: number;
    doneCount: number;
  }[];
  healthSummary: string;
};

export type InvestorDocsData = {
  profile: InvestorProfile;
  /** Full Doc rows (content + slides) so the shared <DocList> read view works. */
  docs: Doc[];
  /** Roster slice <DocList> uses to label granted-access users (admin features). */
  team: Pick<Profile, 'id' | 'display_name'>[];
  docCount: number;
  deckCount: number;
};

export type InvestorPaymentsData = {
  profile: InvestorProfile;
  stats: {
    thisMonth: number;
    lastMonth: number;
    allTime: number;
    peoplePaid: number;
    paymentCount: number;
    /** Distinct calendar months that have at least one paid disbursement — drives Avg / Month. */
    monthCount: number;
    /** Distinct recipients paid in the current calendar month — drives the summary line. */
    thisMonthRecipients: number;
  };
  payments: {
    id: string;
    recipientId: string | null;
    recipientName: string | null;
    recipientAvatarUrl: string | null;
    recipientDepartment: string | null;
    amount: number;
    currency: string;
    description: string | null;
    paidAt: string | null;
    createdAt: string | null;
    itemCount: number;
  }[];
};

export type InvestorSettingsData = {
  profile: InvestorProfile;
};

export type InvestorSettingsInput = {
  displayName: string;
  avatarUrl?: string | null;
  timezone?: string | null;
  paypalEmail?: string | null;
};

export async function loadInvestorOverview(currentUser: { id: string }): Promise<InvestorOverviewData> {
  const service = getServiceClient();
  const profile = await loadInvestorProfile(currentUser.id);
  const [tasksResult, areasResult, activityResult, milestonesResult, milestoneLinksResult] = await Promise.all([
    service
      .from('tasks')
      .select(TASKS_INDEX_SELECT)
      .order('created_at', { ascending: false }),
    service
      .from('areas')
      .select(AREA_SELECT)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    attributedOnly(service.from('activity_log').select('id, action, target, created_at, task_id, doc_id'))
      .order('created_at', { ascending: false })
      .limit(30),
    // milestones/task_milestone aren't in the generated database types yet —
    // same seam as tasks-board.ts.
    (service as any)
      .from('milestones')
      .select('id, name, target_date, sort_order')
      .order('sort_order', { ascending: true })
      .order('target_date', { ascending: true }),
    (service as any).from('task_milestone').select('task_id, milestone_id'),
  ]);

  if (tasksResult.error) throw tasksResult.error;
  if (areasResult.error) throw areasResult.error;
  if (activityResult.error) throw activityResult.error;
  if (milestonesResult.error) throw milestonesResult.error;
  if (milestoneLinksResult.error) throw milestoneLinksResult.error;

  const tasks = ((tasksResult.data ?? []) as unknown[]).map((row) => toTasksIndexItem(row as Parameters<typeof toTasksIndexItem>[0]));
  const areas = ((areasResult.data ?? []) as unknown as AreaRow[]).map((area) => {
    const tasksInArea = tasks.filter((task) => task.areaId === area.id);
    return {
      id: area.id,
      name: area.name,
      status: area.status,
      progress: area.progress ?? 0,
      description: area.description,
      phase: area.phase,
      targetDate: area.target_date ?? null,
      taskCount: tasksInArea.length,
      completedTaskCount: tasksInArea.filter((task) => task.status === 'Done').length,
    };
  });
  const recentActivity = ((activityResult.data ?? []) as ActivityRow[]).map((item) => ({
    id: item.id,
    action: item.action,
    target: item.target,
    createdAt: item.created_at,
    taskId: item.task_id,
    docId: item.doc_id,
  }));

  // Milestone progress = linked-task completion. Canceled/Duplicate links are
  // dropped entirely — they aren't work, so they shouldn't inflate "remaining".
  const statusById = new Map<string, string>(tasks.map((task) => [task.id, task.status]));
  const linksByMilestone = new Map<string, string[]>();
  for (const link of (milestoneLinksResult.data ?? []) as { task_id: string; milestone_id: string }[]) {
    const list = linksByMilestone.get(link.milestone_id) ?? [];
    list.push(link.task_id);
    linksByMilestone.set(link.milestone_id, list);
  }
  const milestones = (
    (milestonesResult.data ?? []) as { id: string; name: string; target_date: string | null; sort_order: number | null }[]
  ).map((milestone) => {
    const statuses = (linksByMilestone.get(milestone.id) ?? [])
      .map((taskId) => statusById.get(taskId))
      .filter((status): status is string => Boolean(status) && status !== 'Canceled' && status !== 'Duplicate');
    return {
      id: milestone.id,
      name: milestone.name,
      targetDate: milestone.target_date,
      taskCount: statuses.length,
      doneCount: statuses.filter((status) => status === 'Done').length,
    };
  });

  const stats = buildOverviewStats(tasks, areas, recentActivity);

  return {
    profile,
    stats,
    areas,
    recentActivity,
    milestones,
    healthSummary: buildHealthSummary(stats, areas),
  };
}

export async function loadInvestorDocs(currentUser: { id: string }): Promise<InvestorDocsData> {
  const service = getServiceClient();
  const [profile, docsResult, teamResult] = await Promise.all([
    loadInvestorProfile(currentUser.id),
    // Fetch ALL docs (not just top-level) so <DocList> can build the parent/child
    // tree exactly like the team /docs page — restricted docs render locked for
    // the investor (userDepartment=null, isAdmin=false) via DocList's own logic.
    service.from('docs').select(DOC_FULL_SELECT).order('sort_order', { ascending: true }),
    service.from('profiles').select('id, display_name').order('display_name', { ascending: true }),
  ]);

  if (docsResult.error) throw docsResult.error;
  if (teamResult.error) throw teamResult.error;

  const docs = (docsResult.data ?? []) as unknown as Doc[];
  const team = (teamResult.data ?? []) as Pick<Profile, 'id' | 'display_name'>[];

  return {
    profile,
    docs,
    team,
    // Top-level counts only — these are informational; <DocList> derives its own
    // tab counts internally from the same data.
    docCount: docs.filter((doc) => !doc.parent_id && doc.type !== 'deck').length,
    deckCount: docs.filter((doc) => !doc.parent_id && doc.type === 'deck').length,
  };
}

export async function loadInvestorPayments(currentUser: { id: string }): Promise<InvestorPaymentsData> {
  const service = getServiceClient();
  const profile = await loadInvestorProfile(currentUser.id);
  const { data, error } = await service
    .from('payments')
    .select('id, recipient_id, amount, currency, description, status, paid_at, created_at, recipient:profiles!payments_recipient_id_fkey(id, display_name, avatar_url, department), items:payment_items(id, payment_id, task_id, label, amount)')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false });

  if (error) throw error;

  const payments = ((data ?? []) as unknown as PaymentRow[]).map((payment) => ({
    id: payment.id,
    recipientId: payment.recipient_id,
    recipientName: payment.recipient?.display_name ?? null,
    recipientAvatarUrl: payment.recipient?.avatar_url ?? null,
    recipientDepartment: payment.recipient?.department ?? null,
    amount: Number(payment.amount),
    currency: payment.currency,
    description: payment.description,
    paidAt: payment.paid_at,
    createdAt: payment.created_at,
    itemCount: payment.items?.length ?? 0,
  }));

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const thisMonth = payments.filter((payment) => payment.paidAt && payment.paidAt >= monthStart);
  const lastMonth = payments.filter((payment) => payment.paidAt && payment.paidAt >= lastMonthStart && payment.paidAt < monthStart);

  const monthCount = new Set(
    payments
      .filter((payment) => payment.paidAt)
      .map((payment) => {
        const date = new Date(payment.paidAt!);
        return `${date.getFullYear()}-${date.getMonth()}`;
      }),
  ).size;

  return {
    profile,
    stats: {
      thisMonth: sumPayments(thisMonth),
      lastMonth: sumPayments(lastMonth),
      allTime: sumPayments(payments),
      peoplePaid: new Set(payments.map((payment) => payment.recipientId).filter(Boolean)).size,
      paymentCount: payments.length,
      monthCount,
      thisMonthRecipients: new Set(thisMonth.map((payment) => payment.recipientId).filter(Boolean)).size,
    },
    payments,
  };
}

export async function loadInvestorSettings(currentUser: { id: string }): Promise<InvestorSettingsData> {
  return {
    profile: await loadInvestorProfile(currentUser.id),
  };
}

export async function updateInvestorSettings(
  currentUser: { id: string },
  input: InvestorSettingsInput,
): Promise<InvestorSettingsData> {
  const profile = await loadInvestorProfile(currentUser.id);
  const displayName = input.displayName.trim();

  if (!displayName) throw new Error('display_name_required');
  if (looksLikeEmail(displayName)) throw new Error('display_name_cannot_be_email');

  const service = getServiceClient();
  const { error } = await service
    .from('profiles')
    .update({
      display_name: displayName,
      avatar_url: input.avatarUrl || null,
      timezone: input.timezone || null,
      paypal_email: input.paypalEmail?.trim() || null,
    } as never)
    .eq('id', profile.id);

  if (error) throw error;

  return loadInvestorSettings(currentUser);
}

async function loadInvestorProfile(userId: string): Promise<InvestorProfile> {
  const service = getServiceClient();
  const { data, error } = await service
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AccessError('profile_not_found');

  const profile = data as ProfileRow;
  if (!profile.is_investor && !profile.is_admin) throw new AccessError('forbidden', 'investor_required');

  return {
    id: profile.id,
    displayName: profile.display_name,
    email: profile.email,
    avatarUrl: profile.avatar_url,
    timezone: profile.timezone,
    paypalEmail: profile.paypal_email,
    isAdmin: profile.is_admin,
    isInvestor: profile.is_investor,
  };
}

function buildOverviewStats(
  tasks: TasksIndexItem[],
  areas: InvestorOverviewData['areas'],
  recentActivity: InvestorOverviewData['recentActivity'],
): InvestorOverviewData['stats'] {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === 'Done').length;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return {
    totalTasks,
    completedTasks,
    overallProgress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    blockedTasks: tasks.filter((task) => task.status === 'Backlog').length,
    overdueTasks: tasks.filter((task) => task.overdue).length,
    activeAreas: areas.filter((area) => area.status === 'Active').length,
    completedThisWeek: recentActivity.filter(
      (item) => item.action === 'Completed' && item.createdAt && new Date(item.createdAt).getTime() > weekAgo
    ).length,
  };
}

function buildHealthSummary(stats: InvestorOverviewData['stats'], areas: InvestorOverviewData['areas']) {
  const parts: string[] = [];

  if (stats.completedThisWeek > 0) {
    parts.push(`${stats.completedThisWeek} task${stats.completedThisWeek === 1 ? '' : 's'} completed this week`);
  }

  const progressingAreas = areas.filter((area) => area.progress > 0).length;
  if (areas.length > 0 && progressingAreas === areas.length) {
    parts.push('all areas progressing');
  } else if (progressingAreas > 0) {
    parts.push(`${progressingAreas} of ${areas.length} areas progressing`);
  }

  if (stats.blockedTasks > 0) parts.push(`${stats.blockedTasks} blocked`);
  if (stats.overdueTasks > 0) parts.push(`${stats.overdueTasks} overdue`);

  if (parts.length === 0) return 'No investor-visible activity this week yet.';
  const sentence = `${parts.join(', ')}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function sumPayments(payments: { amount: number }[]) {
  return payments.reduce((sum, payment) => sum + payment.amount, 0);
}

function looksLikeEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}
