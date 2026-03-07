'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { createBrowserClient } from '@supabase/ssr';
import {
  MoreVertical,
  Circle,
  Timer,
  AlertCircle,
  CheckCircle2,
  Plus,
  ChevronDown,
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
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { TaskDetail } from '@/components/dashboard/TaskDetail';
import { DeliverablesUploadDialog } from '@/components/dashboard/DeliverablesUploadDialog';
import { HandoffDialog } from '@/components/dashboard/HandoffDialog';
import { Stagger, StaggerItem } from '@/components/motion';

/* ------------------------------------------------------------------ */
/*  FilterPill                                                         */
/* ------------------------------------------------------------------ */

function FilterPill({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
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
            onClick={() => onChange(opt.value)}
            className={cn('text-xs', opt.value === value && 'font-medium')}
          >
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
  const [taskPriorities, setTaskPriorities] = useState<Record<string, Priority>>({});
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
    if (newStatus === 'Complete') {
      const task = allTasks.find(t => t.id === taskId);
      if (task) setDeliverableTask(task);
      return;
    }
    setTaskStatuses(prev => ({ ...prev, [taskId]: newStatus }));
    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
  }, [supabase, allTasks]);

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

  const getEffectiveStatus = useCallback((task: Task): TaskStatus => taskStatuses[task.id] ?? task.status, [taskStatuses]);
  const getEffectivePriority = useCallback((task: Task): Priority => (taskPriorities[task.id] ?? task.priority) as Priority, [taskPriorities]);

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

  const assigneeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of allTasks) {
      if (deleted.has(t.id)) continue;
      const a = getAssignee(t);
      if (a?.id && a.display_name && !seen.has(a.id)) {
        seen.set(a.id, a.display_name);
      }
    }
    return [
      { value: 'All', label: 'All' },
      ...Array.from(seen, ([id, name]) => ({ value: id, label: name })),
    ];
  }, [allTasks, deleted]);

  /* ---------------------------------------------------------------- */
  /*  Render: task row (3-column grid)                                 */
  /* ---------------------------------------------------------------- */

  const renderTaskRow = (task: Task | TaskWithAssignee) => {
    const status = getEffectiveStatus(task);
    const assignee = getAssignee(task);
    const badgeStyle = STATUS_BADGE_STYLE[status] ?? STATUS_BADGE_STYLE['In Progress'];
    const BadgeIcon = STATUS_BADGE_ICON[status] ?? Timer;

    return (
      <StaggerItem
        key={task.id}
        className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
      >
        {/* Column 1: Task name */}
        <button
          onClick={() => setSelectedTask(task)}
          className="min-w-0 truncate text-sm text-left text-foreground hover:underline"
        >
          {task.name}
        </button>

        {/* Column 2: Avatar stack */}
        <div className="hidden items-center -space-x-2 sm:flex w-24 justify-center">
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

        {/* Column 3: Status pill */}
        <div className="hidden sm:flex w-32 justify-center">
          {isAdmin ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide transition-colors',
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
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide',
                badgeStyle
              )}
            >
              <BadgeIcon className="size-3" />
              {status}
            </span>
          )}
        </div>

        {/* Mobile: status + avatar below task name */}
        <div className="flex items-center gap-2 sm:hidden col-span-full -mt-1">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              badgeStyle
            )}
          >
            <BadgeIcon className="size-2.5" />
            {status}
          </span>
          {assignee && (
            <Avatar className="size-5 border border-card">
              <AvatarImage src={assignee.avatar_url ?? undefined} />
              <AvatarFallback className="text-[7px] bg-secondary">{getInitials(assignee.display_name ?? '?')}</AvatarFallback>
            </Avatar>
          )}
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
          <FilterPill
            label="Assignee"
            value={filterAssignee}
            options={assigneeOptions}
            onChange={setFilterAssignee}
          />
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</span>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground w-24 text-center hidden sm:block">Assignees</span>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground w-32 text-center hidden sm:block">Status</span>
        </div>

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
    </div>
  );
}
