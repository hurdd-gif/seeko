'use client';

import { useState } from 'react';
import { Circle, CheckCircle2, Timer, AlertCircle } from 'lucide-react';
import { Task, Profile, Doc } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Stagger, StaggerItem } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { TaskDetail } from '@/components/dashboard/TaskDetail';

const STATUS_ICONS: Record<string, { icon: typeof Circle; className: string; bg: string }> = {
  'Complete':     { icon: CheckCircle2, className: 'text-[var(--color-status-complete)]', bg: 'bg-emerald-500/10' },
  'In Progress':  { icon: Timer,        className: 'text-[var(--color-status-progress)]', bg: 'bg-amber-500/10' },
  'In Review':    { icon: AlertCircle,   className: 'text-[var(--color-status-review)]',  bg: 'bg-blue-500/10' },
  'Blocked':      { icon: Circle,        className: 'text-[var(--color-status-blocked)]', bg: 'bg-red-500/10' },
};

const PRIORITY_VARIANT: Record<string, 'destructive' | 'default' | 'outline'> = {
  High: 'destructive',
  Urgent: 'destructive',
  Medium: 'default',
  Low: 'outline',
};

/** Same format as TaskList / TaskDetail: Month, day, year */
function formatDeadlineDisplay(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

interface UpcomingTasksProps {
  tasks: Task[];
  team: Profile[];
  docs: Doc[];
  currentUserId: string;
}

export function UpcomingTasks({ tasks, team, docs, currentUserId }: UpcomingTasksProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon="CheckCircle2"
        title="No upcoming tasks"
        description="You're all caught up."
      />
    );
  }

  return (
    <>
      <Stagger className="flex flex-col gap-3" staggerMs={0.06} delayMs={0.05}>
        {tasks.map(task => {
          const cfg = STATUS_ICONS[task.status] ?? STATUS_ICONS['In Progress'];
          const Icon = cfg.icon;
          return (
            <StaggerItem key={task.id}>
              <button
                onClick={() => setSelectedTask(task)}
                className="flex w-full cursor-pointer items-center justify-between rounded-lg p-3 text-left transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`} title={task.status}>
                    <Icon className={`size-4 ${cfg.className}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{task.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {task.department ?? 'Unassigned'}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 ml-2">
                  <Badge
                    variant={PRIORITY_VARIANT[task.priority] ?? 'outline'}
                    className="text-xs"
                  >
                    {task.priority}
                  </Badge>
                  {task.deadline && (
                    <p className="text-xs text-muted-foreground">Due {formatDeadlineDisplay(task.deadline)}</p>
                  )}
                </div>
              </button>
            </StaggerItem>
          );
        })}
      </Stagger>

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          open={!!selectedTask}
          onOpenChange={open => { if (!open) setSelectedTask(null); }}
          team={team}
          docs={docs}
          currentUserId={currentUserId}
        />
      )}
    </>
  );
}
