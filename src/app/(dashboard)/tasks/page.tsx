import { createClient } from '@/lib/supabase/server';
import { fetchTasks } from '@/lib/supabase/data';
import { TaskList } from '@/components/dashboard/TaskList';

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const tasks = await fetchTasks(user?.id).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {user ? 'Showing your assigned tasks' : 'All tasks'}
        </p>
      </div>
      <TaskList tasks={tasks} />
    </div>
  );
}
