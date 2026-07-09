import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { TaskDetailPage } from '@/components/dashboard/tasks/TaskDetailPage';
import type { TaskDetailFullData } from '@/lib/tasks-board';

type TaskDetailLoaderData =
  | { status: 'ready'; detail: TaskDetailFullData }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'not_found' };

export async function taskDetailLoader({ params }: LoaderFunctionArgs): Promise<TaskDetailLoaderData> {
  const id = params.id;
  if (!id) return { status: 'not_found' };

  const response = await fetch(`/api/task-detail/${encodeURIComponent(id)}`);
  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status === 403) return { status: 'forbidden' };
  if (response.status === 404) return { status: 'not_found' };
  if (!response.ok) throw new Response('Unable to load task', { status: response.status });
  return { status: 'ready', detail: (await response.json()) as TaskDetailFullData };
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

  const { task, areas, team, milestones, activity, isAdmin } = data.detail;
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

/**
 * Self-contained state surface. TaskDetailPage owns full-bleed chrome
 * (`overview-light fixed inset-0`), so its non-ready states match that bare
 * Paper canvas rather than relying on a shared shell.
 */
function TaskDetailState({ title, description }: { title: string; description: string }) {
  return (
    <div className="overview-light fixed inset-0 z-40 flex items-center justify-center bg-[var(--ov-bg)] px-6 antialiased">
      <div className="w-full max-w-sm rounded-2xl bg-white px-8 py-10 text-center shadow-seeko">
        <h1 className="text-[20px] font-medium tracking-[-0.01em] text-[#1a1a1a]">{title}</h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-[#6a6a6a]">{description}</p>
      </div>
    </div>
  );
}
