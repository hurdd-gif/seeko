'use client';

import { useState, useMemo, useCallback, useEffect, useRef, useId } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
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
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TaskDetail } from '@/components/dashboard/TaskDetail';
import { DeliverablesUploadDialog } from '@/components/dashboard/DeliverablesUploadDialog';
import { HandoffDialog } from '@/components/dashboard/HandoffDialog';
import { useMediaQuery } from '@/hooks/useMediaQuery';

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
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          transition={TASK_DIALS.filter.spring}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors',
            value !== 'All'
              ? 'bg-[#2c2c2c] text-seeko-accent'
              : 'bg-[#212121] text-muted-foreground hover:text-foreground'
          )}
        >
          {value !== 'All' ? options.find(o => o.value === value)?.label ?? label : label}
          <ChevronDown className="size-3 ml-0.5 text-muted-foreground" />
        </motion.button>
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

const PRIORITY_DOT: Record<string, string> = {
  'High': 'bg-red-400',
  'Medium': 'bg-amber-400',
  'Low': 'bg-zinc-500',
};

const STATUS_SORT: Record<string, number> = { 'Blocked': 0, 'In Progress': 1, 'In Review': 2, 'Complete': 3 };
const PRIORITY_SORT: Record<string, number> = { 'High': 0, 'Medium': 1, 'Low': 2 };

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

/* ------------------------------------------------------------------ */
/*  Animation dials (tuned to match notification panel)                */
/* ------------------------------------------------------------------ */

const TASK_DIALS = {
  row: {
    spring: { type: 'spring' as const, stiffness: 500, damping: 30 },
    hoverX: 2,
    entranceY: 16,
    exitY: -12,
    exitScale: 0.95,
    stagger: 0.05,
  },
  status: {
    spring: { type: 'spring' as const, stiffness: 500, damping: 30 },
    hoverScale: 1.05,
    tapScale: 0.95,
  },
  filter: {
    spring: { type: 'spring' as const, stiffness: 300, damping: 25 },
  },
  gooey: {
    open: { type: 'spring' as const, stiffness: 400, damping: 28 },
    close: { type: 'spring' as const, stiffness: 500, damping: 35 },
    stagger: 0.04,
  },
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
/*  GooeyStatusDropdown — SVG filter liquid morph from badge to panel  */
/* ------------------------------------------------------------------ */

interface GooeyStatusDropdownProps {
  taskId: string;
  status: TaskStatus;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  shouldReduceMotion: boolean | null;
}

function GooeyStatusDropdown({ taskId, status, onStatusChange, shouldReduceMotion }: GooeyStatusDropdownProps) {
  const filterId = useId().replace(/:/g, '');  // unique per instance, strip colons for valid SVG id
  const [isOpen, setIsOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [opensUp, setOpensUp] = useState(false);
  const [opensRight, setOpensRight] = useState(true);

  const badgeStyle = STATUS_BADGE_STYLE[status] ?? STATUS_BADGE_STYLE['In Progress'];
  const BadgeIcon = STATUS_BADGE_ICON[status] ?? Timer;
  // When open, badge needs a solid bg so the gooey filter can form liquid blobs
  // (10% opacity backgrounds are invisible to the blur+threshold pipeline)
  const activeBadgeStyle = isOpen
    ? 'bg-[#212121] text-foreground'
    : badgeStyle;

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setFocusIndex(-1);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus management
  useEffect(() => {
    if (isOpen && focusIndex >= 0) {
      optionRefs.current[focusIndex]?.focus();
    }
  }, [isOpen, focusIndex]);

  // Viewport edge detection
  const handleOpen = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceRight = window.innerWidth - rect.left;
      setOpensUp(spaceBelow < 220);
      setOpensRight(spaceRight >= 176); // w-44 = 176px
    }
    setIsOpen(true);
    setFocusIndex(-1);
  }, []);

  const handleSelect = useCallback((newStatus: TaskStatus) => {
    onStatusChange(taskId, newStatus);
    setIsOpen(false);
    setFocusIndex(-1);
  }, [taskId, onStatusChange]);

  const handleBadgeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen) {
        setIsOpen(false);
      } else {
        handleOpen();
      }
    }
    if (isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex(prev => Math.min(prev + 1, ALL_STATUSES.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex(prev => Math.max(prev - 1, 0));
      }
    }
  }, [isOpen, handleOpen]);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ filter: isOpen ? `url(#${filterId})` : 'none' }}
    >
      {/* Inline SVG filter — unique ID per instance, co-located for Next.js url(#id) */}
      <svg className="absolute" width="0" height="0" aria-hidden="true">
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
              result="gooey"
            />
            {/* feBlend layers original content over gooey shape — blob bridges stay visible */}
            <feBlend in="SourceGraphic" in2="gooey" />
          </filter>
        </defs>
      </svg>

      {/* Badge trigger */}
      <motion.button
        onClick={(e) => { e.stopPropagation(); isOpen ? setIsOpen(false) : handleOpen(); }}
        onKeyDown={handleBadgeKeyDown}
        whileHover={shouldReduceMotion ? undefined : { scale: TASK_DIALS.status.hoverScale }}
        whileTap={shouldReduceMotion ? undefined : { scale: TASK_DIALS.status.tapScale }}
        transition={TASK_DIALS.status.spring}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide whitespace-nowrap transition-colors',
          activeBadgeStyle
        )}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={`badge-${status}`}
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
            animate={isOpen
              ? { opacity: 0.4, scale: 1, filter: 'blur(0px)' }
              : { opacity: 1, scale: 1, filter: 'blur(0px)' }
            }
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
            transition={TASK_DIALS.status.spring}
            className="inline-flex items-center gap-1.5"
          >
            <BadgeIcon className="size-3" />
            {status}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scaleY: 0.6, scaleX: 0.9 }}
            animate={{ opacity: 1, scaleY: 1, scaleX: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            transition={isOpen ? TASK_DIALS.gooey.open : TASK_DIALS.gooey.close}
            role="listbox"
            aria-label="Change task status"
            className={cn(
              'absolute z-50 w-44 rounded-xl bg-[#212121] py-1',
              opensUp ? 'bottom-full mb-1 origin-bottom' : 'top-full mt-1 origin-top',
              opensRight ? 'left-0' : 'right-0',
            )}
            style={{
              boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.4), 0 12px 32px rgba(0,0,0,0.3)',
            }}
          >
            {ALL_STATUSES.map((s, i) => {
              const cfg = STATUS_ICONS[s];
              const Icon = cfg.icon;
              const isCurrent = s === status;
              return (
                <motion.button
                  key={s}
                  ref={(el) => { optionRefs.current[i] = el; }}
                  role="option"
                  aria-selected={isCurrent}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
                  transition={{
                    ...TASK_DIALS.gooey.open,
                    delay: shouldReduceMotion ? 0 : i * TASK_DIALS.gooey.stagger,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(s);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSelect(s);
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setFocusIndex(Math.min(i + 1, ALL_STATUSES.length - 1));
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setFocusIndex(Math.max(i - 1, 0));
                    }
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-xs text-left transition-colors',
                    isCurrent ? 'bg-[#2c2c2c] font-medium' : 'hover:bg-[#2c2c2c]'
                  )}
                >
                  <Icon className={cn('size-3.5', cfg.className)} />
                  <span>{s}</span>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
  const isMobile = useMediaQuery('(max-width: 639px)');
  const shouldReduceMotion = useReducedMotion();

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
    // Non-admin trying to complete → open deliverable dialog (will submit for review)
    if (newStatus === 'Complete' && !isAdmin) {
      const task = allTasks.find(t => t.id === taskId);
      if (task) setDeliverableTask(task);
      return;
    }
    // Non-admins cannot set "In Review" directly
    if (newStatus === 'In Review' && !isAdmin) return;
    setTaskStatuses(prev => ({ ...prev, [taskId]: newStatus }));
    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);

    // Notify assignee about status change
    const task = allTasks.find(t => t.id === taskId);
    if (task?.assignee_id && task.assignee_id !== currentUserId) {
      const changerName = team.find(m => m.id === currentUserId)?.display_name ?? 'Someone';
      const kindMap: Record<string, string> = {
        'Complete': 'task_completed',
        'In Review': 'task_submitted_review',
        'In Progress': 'task_review_denied',
        'Blocked': 'task_review_denied',
      };
      fetch('/api/notify/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: task.assignee_id,
          kind: kindMap[newStatus] ?? 'task_completed',
          title: `"${task.name}" → ${newStatus}`,
          body: `${changerName} changed the status`,
          link: `/tasks?task=${taskId}`,
        }),
      }).catch(() => {});
    }

    // Log activity
    if (task) {
      const actionMap: Record<string, string> = {
        'Complete': 'Completed',
        'Blocked': 'Blocked',
        'In Review': 'Moved to review',
        'In Progress': 'Started',
      };
      supabase.from('activity_log').insert({
        user_id: currentUserId,
        action: actionMap[newStatus] ?? newStatus,
        target: `task: ${task.name}`,
        task_id: taskId,
      });
    }
  }, [supabase, allTasks, isAdmin, currentUserId, team]);

  const doCompleteTask = useCallback(async (taskId: string) => {
    const task = allTasks.find(t => t.id === taskId);
    if (isAdmin) {
      setTaskStatuses(prev => ({ ...prev, [taskId]: 'Complete' }));
      await supabase.from('tasks').update({ status: 'Complete' }).eq('id', taskId);
    } else {
      setTaskStatuses(prev => ({ ...prev, [taskId]: 'In Review' }));
      await supabase.from('tasks').update({ status: 'In Review' }).eq('id', taskId);
    }
    // Log activity
    if (task) {
      supabase.from('activity_log').insert({
        user_id: currentUserId,
        action: isAdmin ? 'Completed' : 'Moved to review',
        target: `task: ${task.name}`,
        task_id: taskId,
      });
    }
    setDeliverableTask(null);
  }, [supabase, isAdmin, allTasks, currentUserId]);

  const notifyAdminsTaskCompleted = useCallback((taskId: string, taskName: string, completerName: string) => {
    fetch('/api/notify/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'task_submitted_review',
        title: 'Task submitted for review',
        body: `${completerName} submitted "${taskName}" for review`,
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
    }).sort((a, b) => {
      const sa = STATUS_SORT[getEffectiveStatus(a)] ?? 9;
      const sb = STATUS_SORT[getEffectiveStatus(b)] ?? 9;
      if (sa !== sb) return sa - sb;
      const pa = PRIORITY_SORT[a.priority] ?? 9;
      const pb = PRIORITY_SORT[b.priority] ?? 9;
      return pa - pb;
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
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide whitespace-nowrap',
          badgeStyle
        )}
      >
        <BadgeIcon className="size-3" />
        {status}
      </span>
    );

    return (
      <motion.div
        key={task.id}
        layout={!shouldReduceMotion}
        initial={shouldReduceMotion ? false : { opacity: 0, y: TASK_DIALS.row.entranceY }}
        animate={{ opacity: 1, y: 0 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: TASK_DIALS.row.exitY, scale: TASK_DIALS.row.exitScale }}
        transition={TASK_DIALS.row.spring}
      >
        {/* Desktop: original row layout */}
        <motion.div
          whileHover={shouldReduceMotion ? undefined : { x: TASK_DIALS.row.hoverX }}
          transition={TASK_DIALS.row.spring}
          role="button"
          tabIndex={0}
          onClick={() => setSelectedTask(task)}
          onKeyDown={e => { if (e.key === 'Enter') setSelectedTask(task); }}
          className="group hidden md:flex items-center gap-4 px-3 py-3 rounded-xl transition-colors hover:bg-[#212121] cursor-pointer"
        >
          <span className={cn('size-2 rounded-full shrink-0', PRIORITY_DOT[task.priority] ?? 'bg-zinc-500')} title={task.priority} />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {task.name}
          </span>

          <div className="flex items-center -space-x-2 w-24 justify-center shrink-0">
            {assignee ? (
              <Avatar className="size-8" style={{ outline: '1px solid rgba(255,255,255,0.1)', outlineOffset: '-1px' }}>
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
              <GooeyStatusDropdown
                taskId={task.id}
                status={status}
                onStatusChange={handleStatusChange}
                shouldReduceMotion={shouldReduceMotion}
              />
            ) : (
              statusBadge
            )}
          </div>

          {(() => {
            const lockedForReview = !isAdmin && status === 'In Review';
            return lockedForReview ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 opacity-0 group-hover:opacity-30 transition-opacity cursor-not-allowed"
                disabled
                onClick={e => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Task actions (locked during review)</span>
              </Button>
            ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#212121]"
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
                  {ALL_STATUSES.filter(s => s !== status && s !== 'Blocked' && s !== 'In Review').map(s => {
                    const cfg = STATUS_ICONS[s];
                    const Icon = cfg.icon;
                    const label = s === 'Complete' ? 'Submit for Review' : s;
                    const locked = status === 'In Review';
                    return (
                      <DropdownMenuItem
                        key={s}
                        disabled={locked}
                        onClick={() => { if (!locked) handleStatusChange(task.id, s); }}
                        className={cn('flex items-center gap-2 text-xs', locked && 'opacity-40 cursor-not-allowed')}
                      >
                        <Icon className={cn('size-3.5', locked ? 'text-muted-foreground' : cfg.className)} />
                        <span>{label}</span>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                </>
              )}
              {(isAdmin || task.assignee_id === currentUserId) && (() => {
                const locked = !isAdmin && status === 'In Review';
                return (
                  <DropdownMenuItem
                    disabled={locked}
                    onClick={() => { if (!locked) setHandoffTask(task); }}
                    className={cn('flex items-center gap-2', locked && 'opacity-40 cursor-not-allowed')}
                  >
                    <ArrowRightLeft className="size-3.5" />
                    <span>Hand Off</span>
                  </DropdownMenuItem>
                );
              })()}
              {isAdmin && (
                <DropdownMenuItem onClick={() => handleDelete(task.id)} className="flex items-center gap-2 text-destructive">
                  <Trash2 className="size-3.5" />
                  <span>Delete</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
            );
          })()}
        </motion.div>

        {/* Mobile: stacked layout — full-width name, status + assignee on second line */}
        <motion.div
          whileTap={{ scale: 0.98 }}
          transition={TASK_DIALS.row.spring}
          role="button"
          tabIndex={0}
          onClick={() => setSelectedTask(task)}
          onKeyDown={e => { if (e.key === 'Enter') setSelectedTask(task); }}
          className="flex md:hidden flex-col gap-2 px-3 py-3 rounded-xl transition-colors active:bg-[#212121] cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className={cn('size-2 rounded-full shrink-0', PRIORITY_DOT[task.priority] ?? 'bg-zinc-500')} title={task.priority} />
            <span className="min-w-0 flex-1 text-sm font-medium text-foreground line-clamp-2">
              {task.name}
            </span>
            {(() => {
              const lockedForReview = !isAdmin && status === 'In Review';
              return lockedForReview ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 opacity-30 cursor-not-allowed"
                  disabled
                  onClick={e => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Task actions</span>
                </Button>
              ) : (
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
                      <DropdownMenuItem
                        onClick={() => setHandoffTask(task)}
                        className="flex items-center gap-2"
                      >
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
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            {/* Tappable status pill — opens bottom sheet on mobile */}
            <motion.button
              whileTap={{ scale: 0.93 }}
              transition={TASK_DIALS.status.spring}
              onClick={e => {
                e.stopPropagation();
                if (isAdmin || task.assignee_id === currentUserId) openStatusSheet(e, task);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide whitespace-nowrap',
                badgeStyle
              )}
            >
              <BadgeIcon className="size-3" />
              {status}
            </motion.button>
            {assignee && (
              <div className="flex items-center gap-1.5 ml-auto">
                <Avatar className="size-5" style={{ outline: '1px solid rgba(255,255,255,0.1)', outlineOffset: '-1px' }}>
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
        </motion.div>
      </motion.div>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Render: main                                                     */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-2xl bg-[#1a1a1a] px-2 py-3"
        style={{
          boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.2)',
        }}
      >
        {/* Header: title + kebab menu */}
        <div className="flex items-center justify-between px-3 pb-3">
          <h2 className="text-[15px] text-balance font-semibold tracking-tight text-foreground">
            {isAdmin ? 'All Tasks' : 'My Tasks'}
          </h2>
          {isAdmin && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={TASK_DIALS.status.spring}
              className="flex items-center justify-center size-8 rounded-lg bg-[#212121] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="size-4" />
              <span className="sr-only">Add Task</span>
            </motion.button>
          )}
        </div>

        {/* Add-task inline form (desktop only) */}
        {!isMobile && (
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={TASK_DIALS.filter.spring}
                className="overflow-hidden border-b border-white/[0.06]"
              >
                <div className="px-3 py-3">
                  <div className="flex flex-col gap-3">
                    <Input
                      placeholder="Task name..."
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) handleAddTask(); }}
                    />
                    <div className="flex flex-row flex-wrap items-center gap-2">
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
                      <div className="flex justify-end gap-2 ml-auto">
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
        )}

        {/* Add-task drawer (mobile only) */}
        {isMobile && (
          <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
            <DialogHeader>
              <DialogTitle>New Task</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <Input
                placeholder="Task name..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) handleAddTask(); }}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Department</label>
                  <Select value={newDept} onChange={e => setNewDept(e.target.value as Department)}>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Priority</label>
                  <Select value={newPriority} onChange={e => setNewPriority(e.target.value as Priority)}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Deadline</label>
                <Input
                  type="date"
                  value={newDeadline}
                  onChange={e => setNewDeadline(e.target.value)}
                />
              </div>
              <Button onClick={handleAddTask} disabled={adding || !newName.trim()} className="w-full">
                {adding ? 'Adding...' : 'Add Task'}
              </Button>
            </div>
          </Dialog>
        )}

        {/* Summary bar */}
        <div className="flex items-center gap-3 px-3 pt-1 text-xs text-muted-foreground">
          <span className="text-[13px] tabular-nums">{filtered.length} task{filtered.length !== 1 ? 's' : ''}</span>
          {(() => {
            const inProgress = filtered.filter(t => getEffectiveStatus(t) === 'In Progress').length;
            const blocked = filtered.filter(t => getEffectiveStatus(t) === 'Blocked').length;
            const inReview = filtered.filter(t => getEffectiveStatus(t) === 'In Review').length;
            return (
              <>
                {inProgress > 0 && <span className="text-[11px] tabular-nums text-amber-400">{inProgress} in progress</span>}
                {inReview > 0 && <span className="text-[11px] tabular-nums text-blue-400">{inReview} in review</span>}
                {blocked > 0 && <span className="text-[11px] tabular-nums text-red-400">{blocked} blocked</span>}
              </>
            );
          })()}
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-3">
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
        <div className="hidden md:flex items-center gap-4 border-b border-white/[0.06] px-3 py-2">
          <span className="flex-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">Name</span>
          <span className="w-24 text-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 shrink-0">Assignee</span>
          <span className="w-32 text-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 shrink-0">Status</span>
          <span className="w-8 shrink-0" />
        </div>
        {/* Mobile separator */}
        <div className="md:hidden border-b border-white/[0.06]" />

        {/* Task rows */}
        <div>
          <AnimatePresence mode="popLayout">
          <div className="flex flex-col divide-y divide-white/[0.06]">
            {filtered.map(t => renderTaskRow(t))}
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="size-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-foreground">No tasks found</p>
                <p className="text-xs text-muted-foreground">Try adjusting your filters.</p>
              </div>
            )}
          </div>
          </AnimatePresence>
        </div>
      </div>

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
                {ALL_STATUSES.filter(s => isAdmin || (s !== 'Blocked' && s !== 'In Review')).map(s => {
                  const cfg = STATUS_ICONS[s];
                  const Icon = cfg.icon;
                  const currentStatus = getEffectiveStatus(statusSheetTask);
                  const isCurrentStatus = s === currentStatus;
                  const style = STATUS_BADGE_STYLE[s] ?? '';
                  // Non-admin: disable all status changes when task is In Review
                  const isLockedForReview = !isAdmin && currentStatus === 'In Review';
                  return (
                    <motion.button
                      key={s}
                      whileTap={isLockedForReview ? undefined : { scale: 0.95 }}
                      disabled={isLockedForReview}
                      onClick={() => {
                        if (isLockedForReview) return;
                        handleStatusChange(statusSheetTask.id, s);
                        setStatusSheetTask(null);
                      }}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors',
                        isLockedForReview
                          ? 'opacity-40 cursor-not-allowed bg-[#1a1a1a]'
                          : isCurrentStatus
                            ? 'bg-[#2c2c2c]'
                            : 'bg-[#212121] hover:bg-[#272727]'
                      )}
                    >
                      <Icon className={cn('size-5', isLockedForReview ? 'text-muted-foreground' : cfg.className)} />
                      <div>
                        <p className={cn('text-sm font-medium', isCurrentStatus ? '' : 'text-foreground')}>
                          {!isAdmin && s === 'Complete' ? 'Submit for Review' : s}
                        </p>
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
