import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { TasksBoard } from '@/components/dashboard/tasks/TasksBoard';
import { useTasksRealtimeRefresh } from '@/lib/hooks/useTasksRealtimeRefresh';
import type { TasksBoardData } from '@/lib/tasks-board';
import { loadView, type ViewState } from '../load-view';

type TasksLoaderData = ViewState<TasksBoardData>;

export async function tasksLoader(_args: LoaderFunctionArgs): Promise<TasksLoaderData> {
  return loadView<TasksBoardData>('/api/tasks-board', 'Unable to load tasks');
}

export function TasksRoute() {
  const data = useLoaderData() as TasksLoaderData;
  // Live board: any INSERT/UPDATE/DELETE on `tasks` revalidates the loader, so
  // issues added or removed elsewhere (EKO, another tab) appear without refresh.
  useTasksRealtimeRefresh();
  return <TasksRouteContent data={data} />;
}

export function TasksRouteContent({ data }: { data: TasksLoaderData }) {
  if (data.status === 'unauthorized') {
    return <TasksState title="Sign in required" description="Use your SEEKO account to view tasks." />;
  }

  if (data.status === 'forbidden') {
    return (
      <TasksState
        title="Tasks unavailable"
        description="The studio task board is only available to the team."
      />
    );
  }

  if (data.status === 'not_found') {
    return (
      <TasksState
        title="Profile not found"
        description="Your account does not have a team profile yet."
      />
    );
  }

  // The original Linear/Height-style board. <TasksBoard> renders its OWN
  // full-bleed <LightShell> chrome (Issues/Docs tabs + account cluster + board
  // controls), so this route mounts OUTSIDE the shared ShellFrame — exactly like
  // the shipped Next.js /tasks page, which was the landing surface that owned the
  // global chrome.
  return <TasksBoard {...data.data} />;
}

// Tasks owns full-screen chrome, so its access states stand alone on the bare
// Paper canvas (no ShellFrame to inherit) — a centered card in the light system,
// matching StandaloneErrorBoundary's treatment.
function TasksState({ title, description }: { title: string; description: string }) {
  return (
    <div className="overview-light fixed inset-0 z-40 flex items-center justify-center bg-[var(--ov-bg)] px-6 antialiased">
      <div className="rr-panel w-full max-w-md">
        <h1 className="m-0 text-xl font-semibold text-ink-title">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-body">{description}</p>
      </div>
    </div>
  );
}
