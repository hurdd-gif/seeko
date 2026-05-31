import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import {
  fetchAllTasksWithAssignees,
  fetchTeam,
  fetchProfile,
  fetchAreas,
  fetchMilestones,
  fetchActivity,
} from '@/lib/supabase/data';
import { TasksBoard } from '@/components/dashboard/tasks/TasksBoard';
import type { TaskActivity } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const profile = user ? await fetchProfile(user.id) : null;
  const isAdmin = profile?.is_admin ?? false;

  // Always fetch tasks-with-assignees so the board cards get avatar chips.
  // For non-admins, narrow to the user's own tasks in-memory (parity with the
  // old fetchTasks behavior, but without losing the assignee join).
  const allTasks = await fetchAllTasksWithAssignees().catch(() => []);
  const tasks = isAdmin ? allTasks : allTasks.filter((t) => t.assignee_id === user?.id);

  const [team, areas, projectMilestones, recentActivity] = await Promise.all([
    fetchTeam().catch(() => []),
    fetchAreas().catch(() => []),
    fetchMilestones().catch(() => []),
    fetchActivity(15).catch(() => []),
  ]);

  // ActivityItem rows from activity_log are structurally TaskActivity (Phase A
  // added kind/before_value/after_value columns); the typed fields just aren't
  // surfaced by the legacy fetchActivity type signature.
  const projectActivity = recentActivity as unknown as TaskActivity[];

  return (
    <Suspense>
      <TasksBoard
        tasks={tasks}
        team={team}
        areas={areas}
        projectActivity={projectActivity}
        projectMilestones={projectMilestones}
        isAdmin={isAdmin}
        currentUserId={user?.id ?? ''}
      />
    </Suspense>
  );
}
