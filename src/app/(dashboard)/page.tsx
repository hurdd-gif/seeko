import { fetchTasks, fetchAreas } from '@/lib/notion';

export const dynamic = 'force-dynamic';
import { StatsRow } from '@/components/dashboard/StatsRow';
import { DepartmentsCard } from '@/components/dashboard/DepartmentsCard';
import { GameAreasCard } from '@/components/dashboard/GameAreasCard';
import { TasksTable } from '@/components/dashboard/TasksTable';

export default async function OverviewPage() {
  const [tasks, areas] = await Promise.all([
    fetchTasks().catch(() => []),
    fetchAreas().catch(() => []),
  ]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Overview</h1>
        <p className="text-sm text-zinc-500 mt-1">Studio-wide tasks and game area progress</p>
      </div>

      <StatsRow tasks={tasks} areas={areas} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <DepartmentsCard tasks={tasks} />
        <GameAreasCard areas={areas} />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-zinc-400 mb-4">Recent Tasks</h3>
        <TasksTable tasks={tasks.slice(0, 10)} />
      </div>
    </>
  );
}
