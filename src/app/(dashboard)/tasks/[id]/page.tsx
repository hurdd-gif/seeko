import { notFound } from 'next/navigation';
import {
  fetchAreas,
  fetchProfile,
  fetchTaskById,
  fetchTaskMilestones,
  fetchTaskActivity,
  fetchTeam,
} from '@/lib/supabase/data';
import { createClient } from '@/lib/supabase/server';
import { TaskDetailPage } from '@/components/dashboard/tasks/TaskDetailPage';

export const dynamic = 'force-dynamic';

export default async function TaskRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = user ? await fetchProfile(user.id) : null;
  const isAdmin = profile?.is_admin ?? false;

  const task = await fetchTaskById(id);
  if (!task) notFound();
  if (!isAdmin && task.assignee_id !== user?.id) notFound();

  const [team, areas, milestones, activity] = await Promise.all([
    fetchTeam().catch(() => []),
    fetchAreas().catch(() => []),
    fetchTaskMilestones(id).catch(() => []),
    fetchTaskActivity(id, 50).catch(() => []),
  ]);

  return (
    <TaskDetailPage
      task={task}
      areas={areas}
      team={team}
      milestones={milestones}
      activity={activity}
      isAdmin={isAdmin}
    />
  );
}
