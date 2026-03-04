import type { Task, Area } from '@/lib/types';

type Props = {
  tasks: Task[];
  areas: Area[];
};

const STATUS_COLORS: Record<string, string> = {
  Complete: '#6ee7b7',
  'In Progress': '#fbbf24',
  'In Review': '#93c5fd',
  Blocked: '#f87171',
};

export function StatsRow({ tasks, areas }: Props) {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'Complete').length;
  const blockedTasks = tasks.filter((t) => t.status === 'Blocked').length;
  const avgProgress =
    areas.length > 0
      ? Math.round(areas.reduce((sum, a) => sum + a.progress, 0) / areas.length)
      : 0;

  const stats = [
    { label: 'Total Tasks', value: totalTasks, color: '#f9fafb' },
    { label: 'Completed', value: completedTasks, color: STATUS_COLORS.Complete },
    { label: 'In Progress', value: tasks.filter(t => t.status === 'In Progress').length, color: STATUS_COLORS['In Progress'] },
    { label: 'Blocked', value: blockedTasks, color: STATUS_COLORS.Blocked },
    { label: 'Avg Area Progress', value: `${avgProgress}%`, color: '#c4b5fd' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6 animate-[fadeIn_0.6s_ease-out]">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
        >
          <p className="text-xs text-zinc-500 mb-1">{stat.label}</p>
          <p
            className="text-2xl font-bold font-mono"
            style={{ color: stat.color }}
          >
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}
