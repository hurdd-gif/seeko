import { getServiceClient } from '@/lib/supabase/service';
import type { Priority, TaskStatus } from './types';

export class ContractorAccessError extends Error {
  constructor(public readonly code: 'profile_not_found' | 'contractor_required') {
    super(code);
    this.name = 'ContractorAccessError';
  }
}

export type ContractorProfile = {
  id: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isContractor: boolean;
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
};

export type ContractorOverviewData = {
  profile: ContractorProfile;
  deliverables: ContractorDeliverable[];
};

const CONTRACTOR_PROFILE_SELECT =
  'id, display_name, email, avatar_url, is_admin, is_contractor' as const;
const CONTRACTOR_TASK_SELECT =
  'id, name, department, status, priority, deadline, progress, description' as const;

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
    throw new ContractorAccessError('contractor_required');
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
  if (!data) throw new ContractorAccessError('profile_not_found');

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

  const deliverables: ContractorDeliverable[] = (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    department: t.department ?? null,
    status: t.status,
    priority: t.priority ?? null,
    deadline: t.deadline ?? null,
    progress: typeof t.progress === 'number' ? t.progress : 0,
    description: t.description ?? null,
  }));

  return { profile, deliverables };
}
