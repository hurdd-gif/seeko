import { createClient } from '@/lib/supabase/server';
import { fetchTasks } from '@/lib/notion';
import { TasksTable } from '@/components/dashboard/TasksTable';

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
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">My Tasks</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {assigneeName ? `Showing tasks for ${assigneeName}` : 'All tasks'}
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <TasksTable tasks={tasks} />
      </div>
    </>
  );
}
