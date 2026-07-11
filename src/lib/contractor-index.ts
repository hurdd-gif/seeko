import { getServiceClient } from '@/lib/supabase/service';
import { AccessError } from '@/lib/access-error';
import type { ContractorStep, ContractorStepDeliverable } from './contractor-steps';
import type { Priority, TaskStatus } from './types';

export type ContractorProfile = {
  id: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isContractor: boolean;
};

export type LatestExtension = {
  id: string;
  status: 'pending' | 'approved' | 'denied';
  requested_deadline: string;
  reason: string | null;
  denial_reason: string | null;
};

export type ContractorDeliverable = {
  id: string;
  name: string;
  department: string | null;
  status: TaskStatus;
  priority: Priority | null;
  deadline: string | null;
  progress: number;
  description: string | null;
  latestExtension: LatestExtension | null;
};

export type ContractorOverviewData = {
  profile: ContractorProfile;
  deliverables: ContractorStepDeliverable[];
};

const CONTRACTOR_PROFILE_SELECT =
  'id, display_name, email, avatar_url, is_admin, is_contractor' as const;
const CONTRACTOR_TASK_SELECT =
  'id, name, department, status, priority, deadline, progress, description' as const;
const CONTRACTOR_STEP_SELECT = 'id, task_id, name, deadline, state, sort_order' as const;
const CONTRACTOR_EXT_SELECT =
  'id, task_id, status, requested_deadline, reason, denial_reason, created_at' as const;

// `progress` exists on public.tasks (docs/supabase-schema.sql) but is missing from the
// generated Database types, so the select-string parser can't infer it — override the
// result type explicitly rather than widening it with `as any`/`Record<string, unknown>`.
type ContractorTaskRow = {
  id: string;
  name: string;
  department: string | null;
  status: TaskStatus;
  priority: Priority | null;
  deadline: string | null;
  progress: number;
  description: string | null;
};

export function assertContractorAccess(profile: {
  is_contractor: boolean | null;
  is_admin: boolean | null;
}): void {
  if (!profile.is_contractor && !profile.is_admin) {
    throw new AccessError('forbidden', 'contractor_required');
  }
}

async function loadContractorProfile(userId: string): Promise<ContractorProfile> {
  const service = getServiceClient();
  const { data, error } = await service
    .from('profiles')
    .select(CONTRACTOR_PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AccessError('profile_not_found');

  const p = data as {
    id: string;
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
    is_admin: boolean | null;
    is_contractor: boolean | null;
  };
  assertContractorAccess(p);

  return {
    id: p.id,
    displayName: p.display_name,
    email: p.email,
    avatarUrl: p.avatar_url,
    isAdmin: !!p.is_admin,
    isContractor: !!p.is_contractor,
  };
}

export async function loadContractorOverview(currentUser: {
  id: string;
}): Promise<ContractorOverviewData> {
  const service = getServiceClient();
  const profile = await loadContractorProfile(currentUser.id);

  const { data, error } = await service
    .from('tasks')
    .select(CONTRACTOR_TASK_SELECT)
    .eq('assignee_id', currentUser.id)
    .order('deadline', { ascending: true, nullsFirst: false })
    .overrideTypes<ContractorTaskRow[], { merge: false }>();

  if (error) throw error;

  const taskRows = data ?? [];
  const taskIds = taskRows.map((t) => t.id);

  // One extra query pulls every step for the caller's tasks, then we bucket them
  // by task_id. Ordered by sort_order so each deliverable's spine reads top-down.
  const stepsByTask = new Map<string, ContractorStep[]>();
  if (taskIds.length > 0) {
    const { data: stepRows, error: stepError } = await service
      .from('task_steps')
      .select(CONTRACTOR_STEP_SELECT)
      .in('task_id', taskIds)
      .order('sort_order', { ascending: true });
    if (stepError) throw stepError;

    // Sort by sort_order in code too: the invariant "a deliverable's steps read
    // top-down by sort_order" shouldn't depend on the transport preserving order.
    const sortedRows = [...(stepRows ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    for (const row of sortedRows) {
      const list = stepsByTask.get(row.task_id) ?? [];
      list.push({
        id: row.id,
        name: row.name,
        deadline: row.deadline ?? null,
        state: row.state,
        sort_order: row.sort_order,
      });
      stepsByTask.set(row.task_id, list);
    }
  }

  // Newest extension row per task (ordered created_at desc; first wins).
  const extByTask = new Map<string, LatestExtension>();
  if (taskIds.length > 0) {
    const { data: extRows, error: extError } = await service
      .from('deadline_extensions')
      .select(CONTRACTOR_EXT_SELECT)
      .in('task_id', taskIds)
      .order('created_at', { ascending: false });
    if (extError) throw extError;
    for (const row of extRows ?? []) {
      if (!extByTask.has(row.task_id)) {
        extByTask.set(row.task_id, {
          id: row.id,
          status: row.status as LatestExtension['status'],
          requested_deadline: row.requested_deadline,
          reason: row.reason ?? null,
          denial_reason: row.denial_reason ?? null,
        });
      }
    }
  }

  const deliverables: ContractorStepDeliverable[] = taskRows.map((t) => ({
    id: t.id,
    name: t.name,
    department: t.department ?? null,
    status: t.status,
    priority: t.priority ?? null,
    deadline: t.deadline ?? null,
    progress: typeof t.progress === 'number' ? t.progress : 0,
    description: t.description ?? null,
    latestExtension: extByTask.get(t.id) ?? null,
    steps: stepsByTask.get(t.id) ?? [],
  }));

  return { profile, deliverables };
}
