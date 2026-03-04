import { createClient } from '@/lib/supabase/server';
import { fetchTasks } from '@/lib/notion';
import { TaskList } from '@/components/dashboard/TaskList';

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let assigneeName: string | undefined;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('notion_assignee_name')
      .eq('id', user.id)
      .single();
    assigneeName = profile?.notion_assignee_name;
  }

  const tasks = await fetchTasks(assigneeName).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {assigneeName ? `Showing tasks for ${assigneeName}` : 'All tasks'}
        </p>
      </div>
      <TaskList tasks={tasks} assigneeName={assigneeName} />
    </div>
  );
}
