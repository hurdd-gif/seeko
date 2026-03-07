import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { fetchTasks, fetchAllTasksWithAssignees, fetchTeam, fetchProfile, fetchDocs } from '@/lib/supabase/data';
import { TaskList } from '@/components/dashboard/TaskList';

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const profile = user ? await fetchProfile(user.id) : null;
  const isAdmin = profile?.is_admin ?? false;

  const tasks = isAdmin
    ? await fetchAllTasksWithAssignees().catch(() => [])
    : await fetchTasks(user?.id).catch(() => []);

  const [team, docs] = await Promise.all([
    fetchTeam().catch(() => []),
    fetchDocs().catch(() => []),
  ]);

  return (
    <Suspense>
      <TaskList
        tasks={tasks}
        isAdmin={isAdmin}
        team={team}
        docs={docs}
        currentUserId={user?.id ?? ''}
      />
    </Suspense>
  );
}
