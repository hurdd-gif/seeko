'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { createBrowserClient } from '@supabase/ssr';
import {
  MoreHorizontal,
  MoreVertical,
  Circle,
  Timer,
  AlertCircle,
  CheckCircle2,
  Plus,
  ChevronDown,
  UserPlus,
  Trash2,
  ArrowRightLeft,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Task, Profile, TaskWithAssignee, TaskStatus, Department, Priority } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { TaskDetail } from '@/components/dashboard/TaskDetail';
import { DeliverablesUploadDialog } from '@/components/dashboard/DeliverablesUploadDialog';
import { HandoffDialog } from '@/components/dashboard/HandoffDialog';
import { Stagger, StaggerItem } from '@/components/motion';

/* ------------------------------------------------------------------ */
/*  FilterPill                                                         */
/* ------------------------------------------------------------------ */

interface FilterOption {
  value: string;
  label: string;
  avatarUrl?: string | null;
}

function FilterPill({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors',
            value !== 'All'
              ? 'border-foreground/20 bg-muted text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
          )}
        >
          {value !== 'All' ? options.find(o => o.value === value)?.label ?? label : label}
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map(opt => (
          <DropdownMenuItem
            key={opt.value}
            selected={opt.value === value}
            onClick={() => onChange(opt.value)}
            className="text-xs"
          >
            {opt.avatarUrl !== undefined && (
              <Avatar className="size-5 shrink-0">
                <AvatarImage src={opt.avatarUrl ?? undefined} alt={opt.label} />
                <AvatarFallback className="text-[7px] bg-secondary">
                  {opt.label.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_ICONS: Record<string, { icon: typeof Circle; className: string }> = {
  'Complete':     { icon: CheckCircle2, className: 'text-[var(--color-status-complete)]' },
  'In Progress':  { icon: Timer,        className: 'text-[var(--color-status-progress)]' },
  'In Review':    { icon: AlertCircle,   className: 'text-[var(--color-status-review)]' },
  'Blocked':      { icon: Circle,        className: 'text-[var(--color-status-blocked)]' },
};

const STATUS_BADGE_STYLE: Record<string, string> = {
  'In Progress': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Complete':    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'In Review':   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Blocked':     'bg-red-500/10 text-red-400 border-red-500/20',
};

const STATUS_BADGE_ICON: Record<string, typeof Circle> = {
  'In Progress': Timer,
  'Complete':    CheckCircle2,
  'In Review':   AlertCircle,
  'Blocked':     Circle,
};

const ALL_STATUSES: TaskStatus[] = ['Complete', 'In Progress', 'In Review', 'Blocked'];
const DEPARTMENTS: Department[] = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'];
const PRIORITIES: Priority[] = ['High', 'Medium', 'Low'];

export function filterTasks(tasks: Task[], query: string, status: string): Task[] {
  return tasks.filter(t => {
    const matchesQuery = !query || t.name.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === 'All' || t.status === status;
    return matchesQuery && matchesStatus;
  });
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

/* ------------------------------------------------------------------ */
/*  TaskList                                                           */
/* ------------------------------------------------------------------ */

interface TaskListProps {
  tasks: Task[] | TaskWithAssignee[];
  isAdmin?: boolean;
  team?: Profile[];
  docs?: import('@/lib/types').Doc[];
  currentUserId?: string;
}

export function TaskList({ tasks: initialTasks, isAdmin = false, team = [], docs = [], currentUserId = '' }: TaskListProps) {
  const searchParams = useSearchParams();

  /* --- filter state --- */
  const [filterAssignee, setFilterAssignee] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');

  /* --- task mutation state --- */
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({});
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | TaskWithAssignee | null>(null);
  const [deliverableTask, setDeliverableTask] = useState<Task | TaskWithAssignee | null>(null);
  const [handoffTask, setHandoffTask] = useState<Task | TaskWithAssignee | null>(null);

  /* --- add-task form state --- */
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState<Department>('Coding');
  const [newPriority, setNewPriority] = useState<Priority>('Medium');
  const [newDeadline, setNewDeadline] = useState('');
  const [adding, setAdding] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const allTasks = useMemo(() => [...initialTasks, ...localTasks], [initialTasks, localTasks]);

  // Auto-open task from ?task= URL param (e.g. from notification deep-link)
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId) return;
    const match = allTasks.find(t => t.id === taskId);
    if (match) setSelectedTask(match);
  }, [searchParams, allTasks]);

  /* ---------------------------------------------------------------- */
  /*  Callbacks                                                        */
  /* ---------------------------------------------------------------- */

  const handleAddTask = useCallback(async () => {
    if (!newName.trim()) return;
    setAdding(true);

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        name: newName.trim(),
        department: newDept,
        priority: newPriority,
        status: 'In Progress' as TaskStatus,
        deadline: newDeadline || null,
      })
      .select()
      .single();

    if (!error && data) {
      setLocalTasks(prev => [...prev, data as Task]);
    }

    setNewName('');
    setNewDeadline('');
    setAdding(false);
    setShowAddForm(false);
  }, [newName, newDept, newPriority, newDeadline, supabase]);

  const handleStatusChange = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    if (newStatus === 'Complete' && !isAdmin) {
      const task = allTasks.find(t => t.id === taskId);
      if (task) setDeliverableTask(task);
      return;
    }
    setTaskStatuses(prev => ({ ...prev, [taskId]: newStatus }));
    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
  }, [supabase, allTasks, isAdmin]);

  const doCompleteTask = useCallback(async (taskId: string) => {
    setTaskStatuses(prev => ({ ...prev, [taskId]: 'Complete' }));
    await supabase.from('tasks').update({ status: 'Complete' }).eq('id', taskId);
    setDeliverableTask(null);
  }, [supabase]);

  const notifyAdminsTaskCompleted = useCallback((taskId: string, taskName: string, completerName: string) => {
    fetch('/api/notify/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'task_completed',
        title: 'Task completed',
        body: `${completerName} completed "${taskName}"`,
        link: `/tasks?task=${taskId}`,
      }),
    })
      .then(async r => {
        if (!r.ok) {
          // TODO: Replace with proper logging system
        }
      })
      .catch(e => {
        // TODO: Replace with proper logging system
      });
  }, []);

  const handleAssign = useCallback(async (taskId: string, memberId: string | null) => {
    setAssignments(prev => ({ ...prev, [taskId]: memberId }));
    await supabase.from('tasks').update({ assignee_id: memberId }).eq('id', taskId);

    if (memberId) {
      const task = allTasks.find(t => t.id === taskId);
      fetch('/api/notify/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: memberId,
          kind: 'task_assigned',
          title: 'Task assigned to you',
          body: task?.name ?? 'A task has been assigned to you',
          link: `/tasks?task=${taskId}`,
        }),
      });
    }
  }, [supabase, allTasks]);

  const handleDelete = useCallback(async (taskId: string) => {
    setDeleted(prev => new Set(prev).add(taskId));
    await supabase.from('tasks').delete().eq('id', taskId);
  }, [supabase]);

  const getEffectiveStatus = useCallback((task: Task): TaskStatus => taskStatuses[task.id] ?? task.status, [taskStatuses]);
  const getEffectivePriority = useCallback((task: Task): Priority => task.priority as Priority, []);

  /* ---------------------------------------------------------------- */
  /*  Assignee helper — works for both admin and member views          */
  /* ---------------------------------------------------------------- */

  function getAssignee(task: Task | TaskWithAssignee): Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null {
    const overrideId = assignments[task.id];
    if (overrideId !== undefined) {
      if (overrideId === null) return null;
      const member = team.find(m => m.id === overrideId);
      return member ? { id: member.id, display_name: member.display_name, avatar_url: member.avatar_url } : null;
    }
    if ('assignee' in task && task.assignee) return task.assignee;
    if (task.assignee_id) {
      const member = team.find(m => m.id === task.assignee_id);
      if (member) return { id: member.id, display_name: member.display_name, avatar_url: member.avatar_url };
    }
    return null;
  }

  /* ---------------------------------------------------------------- */
  /*  Memos                                                            */
  /* ---------------------------------------------------------------- */

  const filtered = useMemo(() => {
    return allTasks.filter(t => {
      if (deleted.has(t.id)) return false;
      const status = getEffectiveStatus(t);
      const priority = getEffectivePriority(t);
      const matchesStatus = filterStatus === 'All' || status === filterStatus;
      const matchesPriority = filterPriority === 'All' || priority === filterPriority;
      const matchesAssignee = filterAssignee === 'All' || (() => {
        const assignee = getAssignee(t);
        return assignee?.id === filterAssignee;
      })();
      return matchesStatus && matchesPriority && matchesAssignee;
    });
  }, [allTasks, filterStatus, filterPriority, filterAssignee, deleted, getEffectiveStatus, getEffectivePriority]);

  const assigneeOptions: FilterOption[] = useMemo(() => {
    const seen = new Map<string, { name: string; avatarUrl: string | null }>();
    for (const t of allTasks) {
      if (deleted.has(t.id)) continue;
      const a = getAssignee(t);
      if (a?.id && a.display_name && !seen.has(a.id)) {
        seen.set(a.id, { name: a.display_name, avatarUrl: a.avatar_url ?? null });
      }
    }
    return [
      { value: 'All', label: 'All' },
      ...Array.from(seen, ([id, { name, avatarUrl }]) => ({ value: id, label: name, avatarUrl })),
    ];
  }, [allTasks, deleted]);

  /* ---------------------------------------------------------------- */
  /*  Status bottom sheet (mobile)                                     */
  /* ---------------------------------------------------------------- */

  const [statusSheetTask, setStatusSheetTask] = useState<Task | TaskWithAssignee | null>(null);

  const openStatusSheet = useCallback((e: React.MouseEvent | React.TouchEvent, task: Task | TaskWithAssignee) => {
    e.stopPropagation();
    setStatusSheetTask(task);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Render: task row — responsive (stacked on mobile)                */
  /* ---------------------------------------------------------------- */

  const renderTaskRow = (task: Task | TaskWithAssignee) => {
    const status = getEffectiveStatus(task);
    const assignee = getAssignee(task);
    const badgeStyle = STATUS_BADGE_STYLE[status] ?? STATUS_BADGE_STYLE['In Progress'];
    const BadgeIcon = STATUS_BADGE_ICON[status] ?? Timer;

    const statusBadge = (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide whitespace-nowrap',
          badgeStyle
        )}
      >
        <BadgeIcon className="size-3" />
        {status}
      </span>
    );

    return (
      <StaggerItem key={task.id}>
        {/* Desktop: original row layout */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedTask(task)}
          onKeyDown={e => { if (e.key === 'Enter') setSelectedTask(task); }}
          className="hidden md:flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {task.name}
          </span>

          <div className="flex items-center -space-x-2 w-24 justify-center shrink-0">
            {assignee ? (
              <Avatar className="size-8 border-2 border-card">
                <AvatarImage src={assignee.avatar_url ?? undefined} alt={assignee.display_name ?? ''} />
                <AvatarFallback className="text-[10px] bg-secondary">
                  {getInitials(assignee.display_name ?? '?')}
                </AvatarFallback>
              </Avatar>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>

          <div className="w-32 flex justify-center shrink-0">
            {isAdmin ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={e => e.stopPropagation()}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide transition-colors whitespace-nowrap',
                      badgeStyle
                    )}
                  >
                    <BadgeIcon className="size-3" />
                    {status}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {ALL_STATUSES.map(s => {
                    const cfg = STATUS_ICONS[s];
                    const Icon = cfg.icon;
                    return (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => handleStatusChange(task.id, s)}
                        className={cn('flex items-center gap-2 text-xs', s === status && 'font-medium')}
                      >
                        <Icon className={cn('size-3.5', cfg.className)} />
                        <span>{s}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              statusBadge
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={e => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Task actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {isAdmin && (
                <>
                  <DropdownMenuLabel>Assign to</DropdownMenuLabel>
                  {team.map(member => (
                    <DropdownMenuItem key={member.id} onClick={() => handleAssign(task.id, member.id)} className="flex items-center gap-2">
                      <Avatar className="size-5">
                        <AvatarImage src={member.avatar_url ?? undefined} alt={member.display_name ?? ''} />
                        <AvatarFallback className="text-[7px] bg-secondary">{getInitials(member.display_name ?? '?')}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs truncate">{member.display_name ?? 'Unnamed'}</span>
                      {assignee?.id === member.id && <CheckCircle2 className="size-3 text-seeko-accent ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                  {assignee && (
                    <DropdownMenuItem onClick={() => handleAssign(task.id, null)} className="flex items-center gap-2 text-muted-foreground">
                      <UserPlus className="size-3.5" />
                      <span className="text-xs">Unassign</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}
              {!isAdmin && task.assignee_id === currentUserId && (
                <>
                  {ALL_STATUSES.filter(s => s !== status && s !== 'Blocked').map(s => {
                    const cfg = STATUS_ICONS[s];
                    const Icon = cfg.icon;
                    return (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => handleStatusChange(task.id, s)}
                        className="flex items-center gap-2 text-xs"
                      >
                        <Icon className={cn('size-3.5', cfg.className)} />
                        <span>{s}</span>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                </>
              )}
              {(isAdmin || task.assignee_id === currentUserId) && (
                <DropdownMenuItem onClick={() => setHandoffTask(task)} className="flex items-center gap-2">
                  <ArrowRightLeft className="size-3.5" />
                  <span>Hand Off</span>
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <DropdownMenuItem onClick={() => handleDelete(task.id)} className="flex items-center gap-2 text-destructive">
                  <Trash2 className="size-3.5" />
                  <span>Delete</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile: stacked layout — full-width name, status + assignee on second line */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedTask(task)}
          onKeyDown={e => { if (e.key === 'Enter') setSelectedTask(task); }}
          className="flex md:hidden flex-col gap-2 px-4 py-3 transition-colors active:bg-muted/50 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-sm font-medium text-foreground line-clamp-2">
              {task.name}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={e => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Task actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {isAdmin && (
                  <>
                    <DropdownMenuLabel>Assign to</DropdownMenuLabel>
                    {team.map(member => (
                      <DropdownMenuItem key={member.id} onClick={() => handleAssign(task.id, member.id)} className="flex items-center gap-2">
                        <Avatar className="size-5">
                          <AvatarImage src={member.avatar_url ?? undefined} alt={member.display_name ?? ''} />
                          <AvatarFallback className="text-[7px] bg-secondary">{getInitials(member.display_name ?? '?')}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs truncate">{member.display_name ?? 'Unnamed'}</span>
                        {assignee?.id === member.id && <CheckCircle2 className="size-3 text-seeko-accent ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                    {assignee && (
                      <DropdownMenuItem onClick={() => handleAssign(task.id, null)} className="flex items-center gap-2 text-muted-foreground">
                        <UserPlus className="size-3.5" />
                        <span className="text-xs">Unassign</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                  </>
                )}
                {(isAdmin || task.assignee_id === currentUserId) && (
                  <DropdownMenuItem onClick={() => setHandoffTask(task)} className="flex items-center gap-2">
                    <ArrowRightLeft className="size-3.5" />
                    <span>Hand Off</span>
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onClick={() => handleDelete(task.id)} className="flex items-center gap-2 text-destructive">
                    <Trash2 className="size-3.5" />
                    <span>Delete</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-2">
            {/* Tappable status pill — opens bottom sheet on mobile */}
            <button
              onClick={e => {
                e.stopPropagation();
                if (isAdmin || task.assignee_id === currentUserId) openStatusSheet(e, task);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide whitespace-nowrap',
                badgeStyle,
                (isAdmin || task.assignee_id === currentUserId) && 'active:scale-95 transition-transform'
              )}
            >
              <BadgeIcon className="size-3" />
              {status}
            </button>
            {assignee && (
              <div className="flex items-center gap-1.5 ml-auto">
                <Avatar className="size-5 border border-card">
                  <AvatarImage src={assignee.avatar_url ?? undefined} alt={assignee.display_name ?? ''} />
                  <AvatarFallback className="text-[7px] bg-secondary">
                    {getInitials(assignee.display_name ?? '?')}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                  {assignee.display_name?.split(' ')[0] ?? ''}
                </span>
              </div>
            )}
          </div>
        </div>
      </StaggerItem>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Render: main                                                     */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex flex-col gap-4">
      <Card>
        {/* Header: title + kebab menu */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {isAdmin ? 'All Tasks' : 'My Tasks'}
          </h2>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreVertical className="size-4" />
                  <span className="sr-only">Task options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowAddForm(true)} className="flex items-center gap-2">
                  <Plus className="size-3.5" />
                  Add Task
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Add-task inline form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden border-b border-border"
            >
              <div className="px-4 py-3">
                <div className="flex flex-col gap-3">
                  <Input
                    placeholder="Task name..."
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) handleAddTask(); }}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <Select value={newDept} onChange={e => setNewDept(e.target.value as Department)}>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </Select>
                    <Select value={newPriority} onChange={e => setNewPriority(e.target.value as Priority)}>
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </Select>
                    <Input
                      type="date"
                      value={newDeadline}
                      onChange={e => setNewDeadline(e.target.value)}
                      className="w-auto"
                    />
                    <div className="flex justify-end gap-2 sm:ml-auto">
                      <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleAddTask} disabled={adding || !newName.trim()}>
                        {adding ? 'Adding...' : 'Add'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filter pills */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <FilterPill
            label="Assignee"
            value={filterAssignee}
            options={assigneeOptions}
            onChange={setFilterAssignee}
          />
          <FilterPill
            label="Status"
            value={filterStatus}
            options={[
              { value: 'All', label: 'All' },
              ...ALL_STATUSES.map(s => ({ value: s, label: s })),
            ]}
            onChange={setFilterStatus}
          />
          <FilterPill
            label="Priority"
            value={filterPriority}
            options={[
              { value: 'All', label: 'All' },
              ...PRIORITIES.map(p => ({ value: p, label: p })),
            ]}
            onChange={setFilterPriority}
          />
        </div>

        {/* Column headers — desktop only */}
        <div className="hidden md:flex items-center gap-4 border-b border-border px-4 py-2">
          <span className="flex-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</span>
          <span className="w-24 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground shrink-0">Assignee</span>
          <span className="w-32 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground shrink-0">Status</span>
          <span className="w-8 shrink-0" />
        </div>
        {/* Mobile separator */}
        <div className="md:hidden border-b border-border" />

        {/* Task rows */}
        <CardContent className="p-0">
          <Stagger className="flex flex-col divide-y divide-border">
            {filtered.map(t => renderTaskRow(t))}
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="size-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-foreground">No tasks found</p>
                <p className="text-xs text-muted-foreground">Try adjusting your filters.</p>
              </div>
            )}
          </Stagger>
        </CardContent>
      </Card>

      {/* Dialogs */}
      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          open={!!selectedTask}
          onOpenChange={open => { if (!open) setSelectedTask(null); }}
          team={team}
          docs={docs}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />
      )}

      {deliverableTask && (
        <DeliverablesUploadDialog
          open
          onOpenChange={open => { if (!open) setDeliverableTask(null); }}
          task={deliverableTask}
          onSubmit={async (files) => {
            for (const file of files) {
              const form = new FormData();
              form.append('file', file);
              const res = await fetch(`/api/tasks/${deliverableTask.id}/deliverables`, { method: 'POST', body: form });
              if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
            }
            await doCompleteTask(deliverableTask.id);
            notifyAdminsTaskCompleted(
              deliverableTask.id,
              deliverableTask.name,
              team.find(m => m.id === currentUserId)?.display_name ?? 'Someone'
            );
          }}
          onHandoff={async (files) => {
            for (const file of files) {
              const form = new FormData();
              form.append('file', file);
              const res = await fetch(`/api/tasks/${deliverableTask.id}/deliverables`, { method: 'POST', body: form });
              if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
            }
            const task = deliverableTask;
            setDeliverableTask(null);
            // Let the deliverables dialog finish closing before the handoff dialog opens
            setTimeout(() => setHandoffTask(task), 150);
          }}
          onSkip={async () => {
            await doCompleteTask(deliverableTask.id);
            notifyAdminsTaskCompleted(
              deliverableTask.id,
              deliverableTask.name,
              team.find(m => m.id === currentUserId)?.display_name ?? 'Someone'
            );
          }}
        />
      )}

      {handoffTask && (
        <HandoffDialog
          task={handoffTask}
          team={team}
          currentUserId={currentUserId}
          open={!!handoffTask}
          onOpenChange={open => { if (!open) setHandoffTask(null); }}
          onHandoffComplete={(toUserId) => {
            setAssignments(prev => ({ ...prev, [handoffTask.id]: toUserId }));
            setHandoffTask(null);
          }}
        />
      )}

      {/* Status change bottom sheet (mobile) */}
      <AnimatePresence>
        {statusSheetTask && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 bg-black/40"
              onClick={() => setStatusSheetTask(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 200 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 200 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-2xl border-t border-border/50"
              style={{
                background: 'rgba(34, 34, 34, 0.98)',
                backdropFilter: 'saturate(180%) blur(20px)',
                WebkitBackdropFilter: 'saturate(180%) blur(20px)',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)',
              }}
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{statusSheetTask.name}</p>
                  <p className="text-xs text-muted-foreground">Change status</p>
                </div>
                <button
                  onClick={() => setStatusSheetTask(null)}
                  className="flex size-8 items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground shrink-0 ml-3"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 px-4 py-3">
                {ALL_STATUSES.filter(s => isAdmin || s !== 'Blocked').map(s => {
                  const cfg = STATUS_ICONS[s];
                  const Icon = cfg.icon;
                  const currentStatus = getEffectiveStatus(statusSheetTask);
                  const isCurrentStatus = s === currentStatus;
                  const style = STATUS_BADGE_STYLE[s] ?? '';
                  return (
                    <motion.button
                      key={s}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        handleStatusChange(statusSheetTask.id, s);
                        setStatusSheetTask(null);
                      }}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors',
                        isCurrentStatus
                          ? style + ' ring-1 ring-foreground/10'
                          : 'border-border/50 hover:bg-white/[0.04]'
                      )}
                    >
                      <Icon className={cn('size-5', cfg.className)} />
                      <div>
                        <p className={cn('text-sm font-medium', isCurrentStatus ? '' : 'text-foreground')}>{s}</p>
                        {isCurrentStatus && (
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Current</p>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
