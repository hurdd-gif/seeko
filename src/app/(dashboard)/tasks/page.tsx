import { createClient } from '@/lib/supabase/server';
import { fetchTasks, fetchAllTasksWithAssignees, fetchTeam, fetchProfile } from '@/lib/supabase/data';
import { TaskList } from '@/components/dashboard/TaskList';

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const profile = user ? await fetchProfile(user.id) : null;
  const isAdmin = profile?.is_admin ?? false;

  const tasks = isAdmin
    ? await fetchAllTasksWithAssignees().catch(() => [])
    : await fetchTasks(user?.id).catch(() => []);

  const team = await fetchTeam().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {isAdmin ? 'All Tasks' : 'My Tasks'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin ? 'Manage and assign tasks to team members.' : 'Showing your assigned tasks.'}
        </p>
      </div>
      <TaskList
        tasks={tasks}
        isAdmin={isAdmin}
        team={team}
        currentUserId={user?.id ?? ''}
      />
    </div>
  );
}
