import { createTask as storeCreateTask } from '@/lib/task-store';
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

/**
 * Create a task through the one write door: POST /api/tasks (served by the
 * service-role tasks-repo). No direct browser Supabase write — the DB's task
 * write policies are staff-scoped and, at deploy, drop to API-only. The three
 * create dialogs stay admin-gated in the UI. Returns the created Task; throws
 * on failure so callers' existing try/catch contract is preserved.
 */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const result = await storeCreateTask({
    name: input.name.trim(),
    department: input.department,
    priority: input.priority,
    status: input.status ?? 'Todo',
    area_id: input.area_id || null,
    assignee_id: input.assignee_id || null,
    deadline: input.deadline || null,
    description: input.description?.trim() || null,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data.task as Task;
}

export async function revalidateDashboard() {
  return Promise.resolve();
}
