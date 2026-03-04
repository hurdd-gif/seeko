import type { Task } from '@/lib/types';

const DEPT_COLORS: Record<string, string> = {
  Coding: '#6ee7b7',
  'Visual Art': '#93c5fd',
  'UI/UX': '#c4b5fd',
  Animation: '#fbbf24',
  'Asset Creation': '#f9a8d4',
};

export function DepartmentsCard({ tasks }: { tasks: Task[] }) {
  const deptCounts = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.department] = (acc[t.department] ?? 0) + 1;
    return acc;
  }, {});

  const departments = Object.entries(deptCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-400 mb-4">By Department</h3>
      {departments.length === 0 ? (
        <p className="text-sm text-zinc-600">No tasks</p>
      ) : (
        <ul className="space-y-3">
          {departments.map(([dept, count]) => (
            <li key={dept} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: DEPT_COLORS[dept] ?? '#6b7280' }}
                />
                <span className="text-sm text-zinc-300">{dept}</span>
              </div>
              <span
                className="text-sm font-mono font-semibold"
                style={{ color: DEPT_COLORS[dept] ?? '#6b7280' }}
              >
                {count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
