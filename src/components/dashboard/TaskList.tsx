'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  MoreHorizontal,
  Circle,
  Timer,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Task } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Circle; className: string }> = {
  'Complete':    { label: 'Done', icon: CheckCircle2, className: 'text-foreground/50' },
  'In Progress': { label: 'In Progress', icon: Timer, className: 'text-foreground' },
  'In Review':   { label: 'In Review', icon: AlertCircle, className: 'text-muted-foreground' },
  'Blocked':     { label: 'Blocked', icon: Circle, className: 'text-destructive' },
};

const PRIORITY_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  High:   'default',
  Medium: 'outline',
  Low:    'secondary',
};

const STATUSES = ['All', 'Complete', 'In Progress', 'In Review', 'Blocked'] as const;

export function filterTasks(tasks: Task[], query: string, status: string): Task[] {
  return tasks.filter(t => {
    const matchesQuery = !query || t.name.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === 'All' || t.status === status;
    return matchesQuery && matchesStatus;
  });
}

export function TaskList({ tasks }: { tasks: Task[] }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = filter === 'All' || t.status === filter;
      return matchesSearch && matchesStatus;
    });
  }, [tasks, search, filter]);

  const counts = useMemo(() => ({
    All: tasks.length,
    'Complete': tasks.filter(t => t.status === 'Complete').length,
    'In Progress': tasks.filter(t => t.status === 'In Progress').length,
    'In Review': tasks.filter(t => t.status === 'In Review').length,
    'Blocked': tasks.filter(t => t.status === 'Blocked').length,
  }), [tasks]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={filter} onChange={e => setFilter(e.target.value)}>
          {STATUSES.map(s => (
            <option key={s} value={s}>
              {s} ({counts[s]})
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {filtered.map(task => {
              const config = STATUS_CONFIG[task.status] ?? STATUS_CONFIG['In Progress'];
              const StatusIcon = config.icon;
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    checked={task.status === 'Complete'}
                    className="shrink-0"
                    aria-label={`Mark ${task.name} as complete`}
                  />
                  <StatusIcon className={`size-4 shrink-0 ${config.className}`} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <span className="truncate text-sm text-foreground flex-1">{task.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs font-normal shrink-0">
                        {task.department}
                      </Badge>
                      <Badge
                        variant={PRIORITY_VARIANT[task.priority] ?? 'outline'}
                        className="text-xs font-normal shrink-0"
                      >
                        {task.priority}
                      </Badge>
                    </div>
                  </div>
                  <div className="hidden items-center gap-3 md:flex">
                    {task.deadline && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        <span>{task.deadline}</span>
                      </div>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7 shrink-0">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Task actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Edit</DropdownMenuItem>
                      <DropdownMenuItem>Change Status</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="size-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-foreground">No tasks found</p>
                <p className="text-xs text-muted-foreground">Try adjusting your filters or search.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
