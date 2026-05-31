import { ListTodo, ChevronsUp, ChevronUp, ChevronDown } from 'lucide-react';
import type { Task } from '@/lib/types';
import { SplitPanel } from './SplitPanel';
import { PanelPromo } from './PanelPromo';
import { PanelList } from './PanelList';

const priorityIcon = { high: ChevronsUp, medium: ChevronUp, low: ChevronDown } as const;

export function TodaysTasksPanel({ tasks, totalOpen }: { tasks: Task[]; totalOpen: number }) {
  return (
    <SplitPanel
      icon={ListTodo}
      eyebrow="Today's tasks"
      left={
        <PanelPromo
          title={`${tasks.length} due soon`}
          body={`${totalOpen} open across the studio`}
          cta={{ href: '/tasks', label: 'View all tasks →' }}
        />
      }
      right={
        <PanelList
          rows={tasks.map((t) => {
            const key = (t.priority ?? 'medium').toString().toLowerCase() as keyof typeof priorityIcon;
            const Icon = priorityIcon[key] ?? ChevronUp;
            return {
              id: t.id,
              leading: <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />,
              primary: t.name,
              meta: t.status,
            };
          })}
        />
      }
    />
  );
}
