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
 *   [StatusDot]  DIH-NN  Title (truncate)  [PriorityIcon]  [Dept chip]  [Avatar]  Deadline
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

import { memo, useMemo } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { UserPlus } from 'lucide-react';
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

/* ── component ───────────────────────────────────────────── */

export const TasksIssueList = memo(function TasksIssueList({
  tasks,
  team,
  selectedTaskId,
  onSelectTask,
  isAdmin = false,
  onAssign,
}: {
  tasks: TaskWithAssignee[];
  team: Profile[];
  selectedTaskId: string | null;
  onSelectTask: (task: TaskWithAssignee) => void;
  isAdmin?: boolean;
  onAssign?: (taskId: string, profileId: string | null) => void;
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
      <div className="mx-auto mt-6 max-w-7xl rounded-2xl bg-white p-10 text-center shadow-seeko">
        <p className="text-[14px] text-[#9a9a9a]">No issues match your filters.</p>
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
      className="mx-auto max-w-7xl overflow-hidden rounded-2xl bg-white shadow-seeko"
      role="list"
      aria-label="Issues"
    >
      {groups.map((g, gi) => (
        <section key={g.status} aria-label={`${g.status} (${g.rows.length})`}>
          {/* Group header */}
          <header
            className={cn(
              'flex items-center gap-2.5 px-5 py-3.5',
              gi > 0 && 'border-t border-black/[0.05]',
            )}
          >
            <StatusDot status={g.status} size="sm" className="shrink-0" />
            <span className="text-[13px] font-medium text-[#1a1a1a]">{g.status}</span>
            <span className="text-[12px] tabular-nums text-[#9a9a9a]">{g.rows.length}</span>
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
}) {
  const idLabel = task.task_number != null ? `DIH-${task.task_number}` : null;
  const dept = typeof task.department === 'string' ? task.department : null;
  const date = shortDate(task.deadline ?? task.created_at);
  const assignee = task.assignee;
  const canQuickAssign = isAdmin && !!onAssign;

  function handleKeyDown(e: ReactKeyboardEvent<HTMLLIElement>) {
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  const avatarVisual = assignee ? (
    <Avatar className="size-6 shrink-0 ring-1 ring-black/[0.04]">
      <AvatarImage src={assignee.avatar_url ?? undefined} alt={assignee.display_name ?? ''} />
      <AvatarFallback className="bg-[#e5e5e5] text-[10px] font-medium text-[#505050]">
        {initials(assignee.display_name)}
      </AvatarFallback>
    </Avatar>
  ) : (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-[#cfcfcf] text-[#9a9a9a]"
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
    <motion.li
      role="listitem"
      tabIndex={0}
      aria-label={`Open ${task.name}`}
      aria-current={isSelected ? 'true' : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduce ? { duration: 0 } : { ...springs.smooth, delay: delayMs / 1000 }
      }
      className={cn(
        'group/row flex cursor-pointer items-center gap-4 px-5 py-2.5 outline-none transition-colors',
        'focus-visible:bg-[#0000000d]',
        isSelected ? 'bg-[#0000000d]' : 'hover:bg-[#0000000a]',
        !isLastInGroup &&
          'relative after:absolute after:bottom-0 after:left-5 after:right-5 after:h-px after:bg-[#0000000d]',
      )}
    >
      {/* Status */}
      <StatusDot status={task.status} size="sm" className="shrink-0" />

      {/* ID — fixed width so titles align across rows */}
      {idLabel ? (
        <span className="w-[68px] shrink-0 font-mono text-[12px] tabular-nums text-[#7a7a7a]">
          {idLabel}
        </span>
      ) : (
        <span className="w-[68px] shrink-0" aria-hidden />
      )}

      {/* Title */}
      <span className="min-w-0 flex-1 truncate text-[14px] leading-snug text-[#1a1a1a]">
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
        <span className="hidden shrink-0 rounded-full bg-[#f4f4f4] px-2 py-0.5 text-[11px] font-medium text-[#626262] sm:inline-flex">
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
        <span className="hidden w-[64px] shrink-0 text-right text-[12px] tabular-nums text-[#9a9a9a] sm:inline-block">
          {date}
        </span>
      ) : (
        <span className="hidden w-[64px] shrink-0 sm:inline-block" aria-hidden />
      )}
    </motion.li>
  );
}
