'use client';

import React, { useState } from 'react';
import { Circle, CheckCircle2, Timer, AlertCircle } from 'lucide-react';
import { Task, Profile, Doc } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatDeadline } from '@/lib/format-deadline';
import { Stagger, StaggerItem } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { TaskDetail } from '@/components/dashboard/TaskDetail';

const STATUS_ICONS: Record<string, { icon: typeof Circle; className: string; bg: string }> = {
  'Complete':     { icon: CheckCircle2, className: 'text-[var(--color-status-complete)]', bg: 'bg-emerald-500/10' },
  'In Progress':  { icon: Timer,        className: 'text-[var(--color-status-progress)]', bg: 'bg-amber-500/10' },
  'In Review':    { icon: AlertCircle,   className: 'text-[var(--color-status-review)]',  bg: 'bg-blue-500/10' },
  'Blocked':      { icon: Circle,        className: 'text-[var(--color-status-blocked)]', bg: 'bg-red-500/10' },
};

const PRIORITY_COLOR: Record<string, string> = {
  High:   'text-red-400',
  Urgent: 'text-red-400',
  Medium: 'text-muted-foreground',
  Low:    'text-muted-foreground/60',
};


interface UpcomingTasksProps {
  tasks: Task[];
  team: Profile[];
  docs: Doc[];
  currentUserId: string;
  emptyAction?: React.ReactNode;
}

export function UpcomingTasks({ tasks, team, docs, currentUserId, emptyAction }: UpcomingTasksProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon="CheckCircle2"
        title="No upcoming tasks"
        description="You're all caught up."
        action={emptyAction}
      />
    );
  }

  return (
    <>
      <Stagger className="flex flex-col divide-y divide-border/30" staggerMs={0.06} delayMs={0.05}>
        {tasks.map(task => {
          const cfg = STATUS_ICONS[task.status] ?? STATUS_ICONS['In Progress'];
          const Icon = cfg.icon;
          const dl = task.deadline ? formatDeadline(task.deadline) : null;
          const DlIcon = dl?.icon;
          return (
            <StaggerItem key={task.id}>
              <button
                onClick={() => setSelectedTask(task)}
                className="flex w-full cursor-pointer items-center justify-between rounded-lg p-3 text-left transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`} title={task.status}>
                    <Icon className={`size-3.5 ${cfg.className}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{task.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {task.department ?? 'Unassigned'}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 ml-2">
                  <span className={cn('text-xs', PRIORITY_COLOR[task.priority] ?? 'text-muted-foreground')}>
                    {task.priority}
                  </span>
                  {dl && (
                    <span className={cn('inline-flex items-center gap-1 text-xs', dl.className)} title={task.deadline}>
                      {dl.className === 'text-red-400' && DlIcon && <DlIcon className="size-3" />}
                      {dl.label}
                    </span>
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
