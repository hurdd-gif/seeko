/* ─────────────────────────────────────────────────────────
 * TasksIssueList — Linear-style flat issue view for /tasks.
 *
 * Paired with TasksBoard's view-toggle: kanban columns (default)
 * vs. this flat row layout (Issues view). Same data, different shape.
 *
 * Surface: ONE white paper-family card (rounded-2xl, shadow-seeko)
 * containing every group and row, separated by inset hairlines.
 *
 * Row anatomy (left → right):
 *   [StatusDot]  NN  Title (truncate)  [PriorityIcon]  [Dept chip]  [Avatar]  Deadline
 *
 * ANIMATION STORYBOARD
 *
 *    0ms   container fades in (y: 6)
 *   80ms   first row rises
 *  +18ms   each subsequent row (capped after row 10 — long lists shouldn't feel slow)
 *  hover   row bg shifts to #0000000a
 *  selected  row bg holds at #0000000d
 *  exit    no explicit exit (parent toggle handles the cross-fade)
 * ───────────────────────────────────────────────────────── */

'use client';

import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import type { Profile, TaskStatus, TaskWithAssignee } from '@/lib/types';
import { TASK_STATUSES } from '@/lib/types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { springs } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { StatusDot } from './StatusDot';
import { PriorityIcon, PRIORITY_COLOR } from './PriorityIcon';
import { AssigneePopover } from './AssigneePopover';

/* ── helpers ─────────────────────────────────────────────── */

function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function shortDate(dateStr?: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const ROW_STAGGER_MS = 18;
const ROW_STAGGER_CAP = 10; // rows beyond this share the same delay so long lists don't feel slow
const CONTEXT_MENU_WIDTH = 168;
const CONTEXT_MENU_GAP = 8;

type ContextMenuCoords = { left: number; top: number };

function placeContextMenu(x: number, y: number, menuHeight: number): ContextMenuCoords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x;
  let top = y;

  if (left + CONTEXT_MENU_WIDTH + CONTEXT_MENU_GAP > vw) {
    left = vw - CONTEXT_MENU_WIDTH - CONTEXT_MENU_GAP;
  }
  if (left < CONTEXT_MENU_GAP) left = CONTEXT_MENU_GAP;

  if (top + menuHeight + CONTEXT_MENU_GAP > vh) {
    top = vh - menuHeight - CONTEXT_MENU_GAP;
  }
  if (top < CONTEXT_MENU_GAP) top = CONTEXT_MENU_GAP;

  return { left, top };
}

/* ── component ───────────────────────────────────────────── */

export const TasksIssueList = memo(function TasksIssueList({
  tasks,
  team,
  selectedTaskId,
  onSelectTask,
  isAdmin = false,
  onAssign,
  onDeleteTask,
}: {
  tasks: TaskWithAssignee[];
  team: Profile[];
  selectedTaskId: string | null;
  onSelectTask: (task: TaskWithAssignee) => void;
  isAdmin?: boolean;
  onAssign?: (taskId: string, profileId: string | null) => void;
  onDeleteTask?: (taskId: string) => void;
}) {
  const reduce = useReducedMotion();

  /** Group by status, keep canonical TASK_STATUSES order, skip empty groups. */
  const groups = useMemo(() => {
    const buckets = Object.fromEntries(
      TASK_STATUSES.map((s) => [s, [] as TaskWithAssignee[]]),
    ) as Record<TaskStatus, TaskWithAssignee[]>;
    for (const t of tasks) {
      if (buckets[t.status]) buckets[t.status].push(t);
    }
    return TASK_STATUSES.map((s) => ({ status: s, rows: buckets[s] })).filter(
      (g) => g.rows.length > 0,
    );
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="mx-auto mt-6 max-w-7xl rounded-2xl bg-surface-1 p-10 text-center shadow-seeko">
        <p className="text-[14px] text-ink-faint">No issues match your filters.</p>
      </div>
    );
  }

  /** Flat index across all groups, used to compute entrance stagger. */
  let flatIndex = 0;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { ...springs.smooth, delay: 0.04 }}
      className="mx-auto max-w-7xl overflow-hidden rounded-2xl bg-surface-1 shadow-seeko"
      role="list"
      aria-label="Issues"
    >
      {groups.map((g, gi) => (
        <section key={g.status} aria-label={`${g.status} (${g.rows.length})`}>
          {/* Group header */}
          <header
            className={cn(
              'flex items-center gap-2.5 px-5 py-3.5',
              gi > 0 && 'border-t border-wash-5',
            )}
          >
            <StatusDot status={g.status} size="sm" className="shrink-0" />
            <span className="text-[13px] font-medium text-ink-title">{g.status}</span>
            <span className="text-[12px] tabular-nums text-ink-faint">{g.rows.length}</span>
          </header>

          {/* Rows */}
          <ul className="flex flex-col">
            {g.rows.map((task, ri) => {
              const delayMs = reduce
                ? 0
                : 80 + Math.min(flatIndex, ROW_STAGGER_CAP) * ROW_STAGGER_MS;
              flatIndex += 1;
              const isSelected = selectedTaskId === task.id;
              const isLastInGroup = ri === g.rows.length - 1;
              return (
                <IssueRow
                  key={task.id}
                  task={task}
                  isSelected={isSelected}
                  isLastInGroup={isLastInGroup}
                  delayMs={delayMs}
                  reduce={!!reduce}
                  onClick={() => onSelectTask(task)}
                  isAdmin={isAdmin}
                  team={team}
                  onAssign={onAssign}
                  onDelete={onDeleteTask}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </motion.div>
  );
});

/* ── row ─────────────────────────────────────────────────── */

function IssueRow({
  task,
  isSelected,
  isLastInGroup,
  delayMs,
  reduce,
  onClick,
  isAdmin,
  team,
  onAssign,
  onDelete,
}: {
  task: TaskWithAssignee;
  isSelected: boolean;
  isLastInGroup: boolean;
  delayMs: number;
  reduce: boolean;
  onClick: () => void;
  isAdmin: boolean;
  team: Profile[];
  onAssign?: (taskId: string, profileId: string | null) => void;
  onDelete?: (taskId: string) => void;
}) {
  const [contextOpen, setContextOpen] = useState(false);
  const [contextCoords, setContextCoords] = useState<ContextMenuCoords | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextPointerRef = useRef<ContextMenuCoords | null>(null);
  const idLabel = task.task_number != null ? String(task.task_number) : null;
  const dept = typeof task.department === 'string' ? task.department : null;
  const date = shortDate(task.deadline ?? task.created_at);
  const assignee = task.assignee;
  const canQuickAssign = isAdmin && !!onAssign;
  const canContextDelete = isAdmin && !!onDelete;

  useLayoutEffect(() => {
    if (!contextOpen || !contextPointerRef.current) return;
    const h = contextMenuRef.current?.offsetHeight ?? 88;
    setContextCoords(placeContextMenu(contextPointerRef.current.left, contextPointerRef.current.top, h));
  }, [contextOpen]);

  useEffect(() => {
    if (!contextOpen) return;
    function onDocPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (contextMenuRef.current?.contains(target)) return;
      setContextOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setContextOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextOpen]);

  function handleKeyDown(e: ReactKeyboardEvent<HTMLLIElement>) {
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLLIElement>) {
    event.preventDefault();
    event.stopPropagation();
    contextPointerRef.current = { left: event.clientX, top: event.clientY };
    setContextCoords(placeContextMenu(event.clientX, event.clientY, 88));
    setContextOpen(true);
  }

  function handleEditFromContext() {
    setContextOpen(false);
    onClick();
  }

  function handleDeleteFromContext() {
    setContextOpen(false);
    onDelete?.(task.id);
  }

  const contextMenu = (
    <AnimatePresence>
      {contextOpen && contextCoords && (
        <motion.div
          ref={contextMenuRef}
          key="issue-list-context-menu"
          role="menu"
          aria-label={`Quick actions for ${task.name}`}
          initial={reduce ? false : { opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
          style={{
            position: 'fixed',
            left: contextCoords.left,
            top: contextCoords.top,
            width: CONTEXT_MENU_WIDTH,
            transformOrigin: 'top left',
          }}
          className="z-[220] overflow-hidden rounded-[14px] bg-surface-1 p-1 shadow-seeko-pop"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleEditFromContext}
            className="flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5 text-left text-[13px] text-ink-body transition-colors hover:bg-wash-4 hover:text-ink-title"
          >
            <Pencil className="size-3.5 text-[#777777] dark:text-ink-muted" />
            <span className="flex-1 truncate">Edit issue</span>
          </button>
          {canContextDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={handleDeleteFromContext}
              className="flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5 text-left text-[13px] text-[#dc2626] transition-colors hover:bg-[#fef2f2] dark:hover:bg-danger/15"
            >
              <Trash2 className="size-3.5" />
              <span className="flex-1 truncate">Delete issue</span>
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  const avatarVisual = assignee ? (
    <Avatar className="size-6 shrink-0 ring-1 ring-wash-4">
      <AvatarImage src={assignee.avatar_url ?? undefined} alt={assignee.display_name ?? ''} />
      <AvatarFallback className="bg-[#e5e5e5] dark:bg-surface-6 text-[10px] font-medium text-ink-body">
        {initials(assignee.display_name)}
      </AvatarFallback>
    </Avatar>
  ) : (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-[#cfcfcf] text-ink-faint"
      aria-hidden
    >
      <UserPlus className="size-3.5" strokeWidth={1.75} />
    </span>
  );

  const avatarBlock = canQuickAssign ? (
    <AssigneePopover
      value={task.assignee_id ?? null}
      team={team}
      ariaLabel={assignee ? `Change assignee for ${task.name}` : `Assign ${task.name}`}
      onSelect={(next) => onAssign!(task.id, next)}
    >
      {avatarVisual}
    </AssigneePopover>
  ) : (
    avatarVisual
  );

  return (
    <>
      <motion.li
        role="listitem"
        tabIndex={0}
        aria-label={`Open ${task.name}`}
        aria-current={isSelected ? 'true' : undefined}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        initial={reduce ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          reduce ? { duration: 0 } : { ...springs.smooth, delay: delayMs / 1000 }
        }
        className={cn(
          'group/row flex cursor-pointer items-center gap-4 px-5 py-2.5 outline-none transition-colors',
          'focus-visible:bg-wash-5',
          isSelected || contextOpen ? 'bg-wash-5' : 'hover:bg-wash-4',
          !isLastInGroup &&
            'relative after:absolute after:bottom-0 after:left-5 after:right-5 after:h-px after:bg-wash-5',
        )}
      >
        {/* Status */}
        <StatusDot status={task.status} size="sm" className="shrink-0" />

      {/* ID — fixed width so titles align across rows */}
      {idLabel ? (
        <span className="w-[68px] shrink-0 font-mono text-[12px] tabular-nums text-ink-muted">
          {idLabel}
        </span>
      ) : (
        <span className="w-[68px] shrink-0" aria-hidden />
      )}

      {/* Title */}
      <span className="min-w-0 flex-1 truncate text-[14px] leading-snug text-ink-title">
        {task.name}
      </span>

      {/* Priority */}
      <span
        className="flex size-5 shrink-0 items-center justify-center"
        style={{ color: PRIORITY_COLOR[task.priority] }}
        aria-label={`Priority ${task.priority}`}
      >
        <PriorityIcon level={task.priority} className="size-4" />
      </span>

      {/* Department chip — hide on small viewports */}
      {dept && (
        <span className="hidden shrink-0 rounded-full bg-surface-4 px-2 py-0.5 text-[11px] font-medium text-[#626262] dark:text-ink-muted-strong sm:inline-flex">
          {dept}
        </span>
      )}

      {/* Assignee */}
      <span
        className="shrink-0"
        onClick={(e) => {
          // Don't bubble avatar/popover clicks into row selection.
          if (canQuickAssign) e.stopPropagation();
        }}
      >
        {avatarBlock}
      </span>

      {/* Date */}
      {date ? (
        <span className="hidden w-[64px] shrink-0 text-right text-[12px] tabular-nums text-ink-faint sm:inline-block">
          {date}
        </span>
      ) : (
        <span className="hidden w-[64px] shrink-0 sm:inline-block" aria-hidden />
      )}
      </motion.li>
      {typeof document !== 'undefined' ? createPortal(contextMenu, document.body) : null}
    </>
  );
}
