'use client';

import { useState, useMemo, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  Search,
  MoreHorizontal,
  Circle,
  Timer,
  AlertCircle,
  CheckCircle2,
  Clock,
  UserPlus,
} from 'lucide-react';
import { Task, Profile, TaskWithAssignee } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

interface TaskListProps {
  tasks: Task[] | TaskWithAssignee[];
  isAdmin?: boolean;
  team?: Profile[];
}

export function TaskList({ tasks: initialTasks, isAdmin = false, team = [] }: TaskListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleAssign = useCallback(async (taskId: string, memberId: string | null) => {
    setAssignments(prev => ({ ...prev, [taskId]: memberId }));

    await supabase
      .from('tasks')
      .update({ assignee_id: memberId })
      .eq('id', taskId);
  }, [supabase]);

  const filtered = useMemo(() => {
    return initialTasks.filter(t => {
      const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = filter === 'All' || t.status === filter;
      return matchesSearch && matchesStatus;
    });
  }, [initialTasks, search, filter]);

  const counts = useMemo(() => ({
    All: initialTasks.length,
    'Complete': initialTasks.filter(t => t.status === 'Complete').length,
    'In Progress': initialTasks.filter(t => t.status === 'In Progress').length,
    'In Review': initialTasks.filter(t => t.status === 'In Review').length,
    'Blocked': initialTasks.filter(t => t.status === 'Blocked').length,
  }), [initialTasks]);

  function getAssignee(task: Task | TaskWithAssignee): Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null {
    const overrideId = assignments[task.id];
    if (overrideId !== undefined) {
      if (overrideId === null) return null;
      const member = team.find(m => m.id === overrideId);
      return member ? { id: member.id, display_name: member.display_name, avatar_url: member.avatar_url } : null;
    }
    if ('assignee' in task && task.assignee) {
      return task.assignee;
    }
    return null;
  }

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
              const assignee = isAdmin ? getAssignee(task) : null;

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

                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors shrink-0">
                          {assignee ? (
                            <>
                              <Avatar className="size-4">
                                <AvatarImage src={assignee.avatar_url ?? undefined} alt={assignee.display_name ?? ''} />
                                <AvatarFallback className="text-[6px] bg-secondary">
                                  {getInitials(assignee.display_name ?? '?')}
                                </AvatarFallback>
                              </Avatar>
                              <span className="max-w-[80px] truncate">{assignee.display_name}</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="size-3" />
                              <span>Assign</span>
                            </>
                          )}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {team.map(member => (
                          <DropdownMenuItem
                            key={member.id}
                            onClick={() => handleAssign(task.id, member.id)}
                            className="flex items-center gap-2"
                          >
                            <Avatar className="size-5">
                              <AvatarImage src={member.avatar_url ?? undefined} alt={member.display_name ?? ''} />
                              <AvatarFallback className="text-[7px] bg-secondary">
                                {getInitials(member.display_name ?? '?')}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm truncate">{member.display_name ?? 'Unnamed'}</span>
                          </DropdownMenuItem>
                        ))}
                        {assignee && (
                          <DropdownMenuItem
                            onClick={() => handleAssign(task.id, null)}
                            className="text-muted-foreground"
                          >
                            Unassign
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

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
