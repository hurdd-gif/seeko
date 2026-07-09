import { createClient } from '@/lib/supabase/client';
import type { Department, Priority, Task, TaskStatus } from '@/lib/types';

export type CreateTaskInput = {
  name: string;
  department: Department;
  priority: Priority;
  status?: TaskStatus;
  area_id?: string;
  assignee_id?: string;
  deadline?: string;
  description?: string;
};

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) throw new Error('Forbidden');

  const payload = {
    name: input.name.trim(),
    department: input.department,
    priority: input.priority,
    status: input.status ?? 'Todo',
    area_id: input.area_id || null,
    assignee_id: input.assignee_id || null,
    deadline: input.deadline || null,
    description: input.description?.trim() || null,
  };

  const { data, error } = await supabase
    .from('tasks')
    .insert(payload as never)
    .select('*')
    .single();
  if (error) throw error;

  return data as Task;
}

export async function revalidateDashboard() {
  return Promise.resolve();
}
