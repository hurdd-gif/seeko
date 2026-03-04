import type { Task } from '@/lib/types';

const STATUS_COLORS: Record<string, string> = {
  Complete: '#6ee7b7',
  'In Progress': '#fbbf24',
  'In Review': '#93c5fd',
  Blocked: '#f87171',
};

const PRIORITY_COLORS: Record<string, string> = {
  High: '#f87171',
  Medium: '#fbbf24',
  Low: '#6b7280',
};

export function TasksTable({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-600 text-sm">
        No tasks found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            {['Task', 'Department', 'Status', 'Priority', 'Deadline'].map((h) => (
              <th
                key={h}
                className="text-left text-xs font-medium text-zinc-500 pb-3 pr-4"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {tasks.map((task) => (
            <tr key={task.id} className="group hover:bg-zinc-900/50 transition-colors">
              <td className="py-3 pr-4 text-zinc-200 font-medium">{task.name}</td>
              <td className="py-3 pr-4 text-zinc-400">{task.department}</td>
              <td className="py-3 pr-4">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                  style={{
                    backgroundColor: (STATUS_COLORS[task.status] ?? '#6b7280') + '20',
                    color: STATUS_COLORS[task.status] ?? '#6b7280',
                  }}
                >
                  {task.status}
                </span>
              </td>
              <td className="py-3 pr-4">
                <span
                  className="text-xs font-mono"
                  style={{ color: PRIORITY_COLORS[task.priority] ?? '#6b7280' }}
                >
                  {task.priority}
                </span>
              </td>
              <td className="py-3 text-zinc-500 font-mono text-xs">
                {task.deadline ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
