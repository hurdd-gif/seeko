import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { TaskDetailPage } from '@/components/dashboard/tasks/TaskDetailPage';
import type { TaskDetailFullData } from '@/lib/tasks-board';
import { loadView, type ViewState } from '../load-view';

type TaskDetailLoaderData = ViewState<TaskDetailFullData>;

export async function taskDetailLoader({ params }: LoaderFunctionArgs): Promise<TaskDetailLoaderData> {
  const id = params.id;
  if (!id) return { status: 'not_found' };

  return loadView<TaskDetailFullData>(`/api/task-detail/${encodeURIComponent(id)}`, 'Unable to load task');
}

export function TaskDetailRoute() {
  const data = useLoaderData() as TaskDetailLoaderData;
  return <TaskDetailRouteContent data={data} />;
}

export function TaskDetailRouteContent({ data }: { data: TaskDetailLoaderData }) {
  if (data.status === 'unauthorized') {
    return (
      <TaskDetailState
        title="Sign in required"
        description="Use your SEEKO account to view this task."
      />
    );
  }
  if (data.status === 'forbidden') {
    return (
      <TaskDetailState
        title="Task unavailable"
        description="This task is assigned to another teammate."
      />
    );
  }
  if (data.status === 'not_found') {
    return (
      <TaskDetailState
        title="Task not found"
        description="This task may have been deleted or never existed."
      />
    );
  }

  const { task, areas, team, milestones, activity, comments, currentUserId, isAdmin, pendingExtension } = data.data;
  return (
    <TaskDetailPage
      task={task}
      areas={areas}
      team={team}
      milestones={milestones}
      activity={activity}
      comments={comments}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      pendingExtension={pendingExtension}
    />
  );
}

/**
 * Self-contained state surface. TaskDetailPage owns full-bleed chrome
 * (`overview-light fixed inset-0`), so its non-ready states match that bare
 * Paper canvas rather than relying on a shared shell.
 */
function TaskDetailState({ title, description }: { title: string; description: string }) {
  return (
    <div className="overview-light fixed inset-0 z-40 flex items-center justify-center bg-[var(--ov-bg)] px-6 antialiased">
      <div className="w-full max-w-sm rounded-2xl bg-surface-1 px-8 py-10 text-center shadow-seeko">
        <h1 className="text-[20px] font-medium tracking-[-0.01em] text-ink-title">{title}</h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-[#6a6a6a] dark:text-ink-muted-strong">{description}</p>
      </div>
    </div>
  );
}
