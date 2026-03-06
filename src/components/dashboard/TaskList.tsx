'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
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
  Trash2,
  Plus,
  ArrowRightLeft,
} from 'lucide-react';
import { Task, Profile, TaskWithAssignee, TaskStatus, Department, Priority } from '@/lib/types';
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
import { TaskDetail } from '@/components/dashboard/TaskDetail';
import { DeliverablesUploadDialog } from '@/components/dashboard/DeliverablesUploadDialog';
import { HandoffDialog } from '@/components/dashboard/HandoffDialog';
import { Stagger, StaggerItem } from '@/components/motion';

const STATUS_ICONS: Record<string, { icon: typeof Circle; className: string }> = {
  'Complete':     { icon: CheckCircle2, className: 'text-[var(--color-status-complete)]' },
  'In Progress':  { icon: Timer,        className: 'text-[var(--color-status-progress)]' },
  'In Review':    { icon: AlertCircle,   className: 'text-[var(--color-status-review)]' },
  'Blocked':      { icon: Circle,        className: 'text-[var(--color-status-blocked)]' },
};

const ALL_STATUSES: TaskStatus[] = ['Complete', 'In Progress', 'In Review', 'Blocked'];
const DEPARTMENTS: Department[] = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'];
const PRIORITIES: Priority[] = ['High', 'Medium', 'Low'];

const PRIORITY_STYLE: Record<string, string> = {
  High:   'bg-red-500/15 text-red-400 border-red-500/30',
  Medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Low:    'bg-muted text-muted-foreground border-border',
};

const DEPT_COLOR: Record<string, string> = {
  'Coding':         'text-emerald-400',
  'Visual Art':     'text-blue-300',
  'UI/UX':          'text-violet-300',
  'Animation':      'text-amber-400',
  'Asset Creation': 'text-pink-300',
};

const DEPT_SECTION_COLOR: Record<string, string> = {
  'Coding':         'border-emerald-500/30 text-emerald-400',
  'Visual Art':     'border-blue-300/30 text-blue-300',
  'UI/UX':          'border-violet-300/30 text-violet-300',
  'Animation':      'border-amber-400/30 text-amber-400',
  'Asset Creation': 'border-pink-300/30 text-pink-300',
};

const FILTER_STATUSES = ['All', ...ALL_STATUSES] as const;

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

/** Format deadline: relative ("in 2 hours", "1 hour ago") when within 24h, otherwise "Mon DD, YYYY". */
function formatDeadline(deadline: string): string {
  const dateOnly = deadline.includes('T') ? deadline : deadline + 'T12:00:00';
  const deadlineTime = new Date(dateOnly).getTime();
  const now = Date.now();
  const diffMs = deadlineTime - now;
  const diffMins = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (Math.abs(diffMs) <= 24 * 60 * 60 * 1000) {
    if (Math.abs(diffMins) < 60) {
      if (diffMins === 0) return 'now';
      return diffMins > 0 ? `in ${diffMins}m` : `${Math.abs(diffMins)}m ago`;
    }
    if (diffHours > 0) return `in ${diffHours}h`;
    return `${Math.abs(diffHours)}h ago`;
  }

  return new Date(deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface TaskListProps {
  tasks: Task[] | TaskWithAssignee[];
  isAdmin?: boolean;
  team?: Profile[];
  docs?: import('@/lib/types').Doc[];
  currentUserId?: string;
}

export function TaskList({ tasks: initialTasks, isAdmin = false, team = [], docs = [], currentUserId = '' }: TaskListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({});
  const [taskDepts, setTaskDepts] = useState<Record<string, Department>>({});
  const [taskPriorities, setTaskPriorities] = useState<Record<string, Priority>>({});
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | TaskWithAssignee | null>(null);
  const [deliverableTask, setDeliverableTask] = useState<Task | TaskWithAssignee | null>(null);
  const [handoffTask, setHandoffTask] = useState<Task | TaskWithAssignee | null>(null);

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
          // console.error('[notify] task_completed failed:', await r.json());
        }
      })
      .catch(e => {
        // TODO: Replace with proper logging system  
        // console.error('[notify] task_completed error:', e);
      });
  }, []);

  const handleToggleComplete = useCallback((taskId: string, currentStatus: string) => {
    const newStatus: TaskStatus = currentStatus === 'Complete' ? 'In Progress' : 'Complete';
    handleStatusChange(taskId, newStatus);
  }, [handleStatusChange]);

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

  const handleDeptChange = useCallback(async (taskId: string, dept: Department) => {
    setTaskDepts(prev => ({ ...prev, [taskId]: dept }));
    await supabase.from('tasks').update({ department: dept }).eq('id', taskId);
  }, [supabase]);

  const handlePriorityChange = useCallback(async (taskId: string, priority: Priority) => {
    setTaskPriorities(prev => ({ ...prev, [taskId]: priority }));
    await supabase.from('tasks').update({ priority }).eq('id', taskId);
  }, [supabase]);

  const handleDelete = useCallback(async (taskId: string) => {
    setDeleted(prev => new Set(prev).add(taskId));
    await supabase.from('tasks').delete().eq('id', taskId);
  }, [supabase]);

  const getEffectiveStatus = useCallback((task: Task): TaskStatus => taskStatuses[task.id] ?? task.status, [taskStatuses]);
  const getEffectiveDept = useCallback((task: Task): Department => (taskDepts[task.id] ?? task.department) as Department, [taskDepts]);
  const getEffectivePriority = useCallback((task: Task): Priority => (taskPriorities[task.id] ?? task.priority) as Priority, [taskPriorities]);

  const filtered = useMemo(() => {
    return allTasks.filter(t => {
      if (deleted.has(t.id)) return false;
      const status = getEffectiveStatus(t);
      const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = filter === 'All' || status === filter;
      return matchesSearch && matchesStatus;
    });
  }, [allTasks, search, filter, deleted, getEffectiveStatus]);

  const counts = useMemo(() => {
    const live = allTasks.filter(t => !deleted.has(t.id));
    return {
      All: live.length,
      'Complete': live.filter(t => getEffectiveStatus(t) === 'Complete').length,
      'In Progress': live.filter(t => getEffectiveStatus(t) === 'In Progress').length,
      'In Review': live.filter(t => getEffectiveStatus(t) === 'In Review').length,
      'Blocked': live.filter(t => getEffectiveStatus(t) === 'Blocked').length,
    };
  }, [allTasks, deleted, getEffectiveStatus]);

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

  const renderTaskRow = (task: Task | TaskWithAssignee) => {
      const status = getEffectiveStatus(task);
      const iconCfg = STATUS_ICONS[status] ?? STATUS_ICONS['In Progress'];
      const StatusIcon = iconCfg.icon;
      const assignee = isAdmin ? getAssignee(task) : null;
      const isComplete = status === 'Complete';
      const dept = getEffectiveDept(task);
      const priority = getEffectivePriority(task);

              return (
                <StaggerItem key={task.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                  <motion.div whileTap={{ scale: 0.8 }} transition={{ duration: 0.06 }}>
                    <Checkbox
                      checked={isComplete}
                      onCheckedChange={() => handleToggleComplete(task.id, status)}
                      className="shrink-0"
                      aria-label={`Mark ${task.name} as ${isComplete ? 'incomplete' : 'complete'}`}
                    />
                  </motion.div>
                  <div className="relative size-4 shrink-0">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={status}
                        initial={{ opacity: 0, scale: 0.6, filter: 'blur(3px)' }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, scale: 0.6, filter: 'blur(3px)' }}
                        transition={{ duration: 0.12 }}
                        className="absolute inset-0"
                      >
                        <StatusIcon className={`size-4 ${iconCfg.className}`} />
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  <button
                    onClick={() => setSelectedTask(task)}
                    className={`min-w-0 flex-1 truncate text-sm text-left hover:underline ${isComplete ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                  >
                    {task.name}
                  </button>

                  <div className="hidden items-center gap-2 lg:flex">
                    {isAdmin ? (
                      <>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="inline-flex items-center rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-xs font-normal whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:border-border hover:text-foreground">
                              {dept}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {DEPARTMENTS.map(d => (
                              <DropdownMenuItem key={d} onClick={() => handleDeptChange(task.id, d)} className={`text-xs ${DEPT_COLOR[d] ?? ''} ${d === dept ? 'font-medium' : ''}`}>
                                {d}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-normal whitespace-nowrap transition-opacity hover:opacity-80 ${PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.Low}`}>
                              {priority}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {PRIORITIES.map(p => (
                              <DropdownMenuItem key={p} onClick={() => handlePriorityChange(task.id, p)} className={`text-xs ${p === priority ? 'font-medium' : ''}`}>
                                <span className={`inline-flex items-center rounded border px-1.5 py-0 mr-1 ${PRIORITY_STYLE[p]}`}>{p}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    ) : (
                      <>
                        <Badge variant="secondary" className={`text-xs font-normal whitespace-nowrap ${DEPT_COLOR[dept] ?? ''}`}>
                          {dept}
                        </Badge>
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-normal whitespace-nowrap ${PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.Low}`}>
                          {priority}
                        </span>
                      </>
                    )}
                  </div>

                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="hidden items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors shrink-0 sm:flex">
                          {assignee ? (
                            <>
                              <Avatar className="size-4">
                                <AvatarImage src={assignee.avatar_url ?? undefined} alt={assignee.display_name ?? ''} />
                                <AvatarFallback className="text-[6px] bg-secondary">{getInitials(assignee.display_name ?? '?')}</AvatarFallback>
                              </Avatar>
                              <span className="max-w-[72px] truncate">{assignee.display_name}</span>
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
                          <DropdownMenuItem key={member.id} onClick={() => handleAssign(task.id, member.id)} className="flex items-center gap-2">
                            <Avatar className="size-5">
                              <AvatarImage src={member.avatar_url ?? undefined} alt={member.display_name ?? ''} />
                              <AvatarFallback className="text-[7px] bg-secondary">{getInitials(member.display_name ?? '?')}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm truncate">{member.display_name ?? 'Unnamed'}</span>
                          </DropdownMenuItem>
                        ))}
                        {assignee && (
                          <DropdownMenuItem onClick={() => handleAssign(task.id, null)} className="text-muted-foreground hover:text-destructive focus:text-destructive">
                            Unassign
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {task.deadline && (
                    <div className="hidden items-center gap-1 text-xs text-muted-foreground whitespace-nowrap md:flex">
                      <Clock className="size-3" />
                      <span>{formatDeadline(task.deadline)}</span>
                    </div>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7 shrink-0">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Task actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {ALL_STATUSES.filter(s => s !== status).map(s => {
                        const cfg = STATUS_ICONS[s];
                        const Icon = cfg.icon;
                        return (
                          <DropdownMenuItem key={s} onClick={() => handleStatusChange(task.id, s)} className="flex items-center gap-2">
                            <Icon className={`size-3.5 ${cfg.className}`} />
                            <span>{s}</span>
                          </DropdownMenuItem>
                        );
                      })}
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
                </StaggerItem>
              );
    };

  const renderContent = () => {
    const taskGroups = isAdmin
      ? DEPARTMENTS.filter(d => filtered.some(t => getEffectiveDept(t) === d))
      : null;

    return (
      <>
        {taskGroups ? (
          taskGroups.length === 0 ? (
            <Card>
              <CardContent className="p-4 flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="size-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-foreground">No tasks found</p>
                <p className="text-xs text-muted-foreground">Try adjusting your filters or search.</p>
              </CardContent>
            </Card>
          ) : (
          <div className="flex flex-col gap-4">
            {taskGroups.map(dept => (
              <Card key={dept}>
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                  <span className={`text-xs font-semibold tracking-wide uppercase ${DEPT_SECTION_COLOR[dept] ?? 'text-muted-foreground'}`}>{dept}</span>
                  <span className="text-xs text-muted-foreground">({filtered.filter(t => getEffectiveDept(t) === dept).length})</span>
                </div>
                <CardContent className="p-0">
                  <Stagger className="flex flex-col divide-y divide-border">
                    {filtered.filter(t => getEffectiveDept(t) === dept).map(t => renderTaskRow(t))}
                  </Stagger>
                </CardContent>
              </Card>
            ))}
          </div>
          )
        ) : (
          <Card>
            <CardContent className="p-0">
              <Stagger className="flex flex-col divide-y divide-border">
                {filtered.map(t => renderTaskRow(t))}
                {filtered.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle2 className="size-10 text-muted-foreground/50" />
                    <p className="mt-3 text-sm font-medium text-foreground">No tasks found</p>
                    <p className="text-xs text-muted-foreground">Try adjusting your filters or search.</p>
                  </div>
                )}
              </Stagger>
            </CardContent>
          </Card>
        )}

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
      </>
    );
  };

  return (
    <div className="flex flex-col gap-4">

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search tasks..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onChange={e => setFilter(e.target.value)}>
            {FILTER_STATUSES.map(s => (
              <option key={s} value={s}>{s} ({counts[s]})</option>
            ))}
          </Select>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowAddForm(v => !v)} className="shrink-0 gap-1.5">
              <Plus className="size-3.5" />
              Add Task
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col gap-3">
                  <Input
                    placeholder="Task name..."
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) handleAddTask(); }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
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
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleAddTask} disabled={adding || !newName.trim()}>
                      {adding ? 'Adding...' : 'Add'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {renderContent()}
    </div>
  );
}
