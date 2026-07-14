/**
 * TaskCard — a single card on the issue board.
 *
 * Spec (light-mode adaptation of Paper TA-0; see plan 2026-05-19):
 *   • bg-surface-1, rounded-xl, shadow-seeko, p-3
 *   • Header row:  [{n}]      [assignee avatar / +icon]
 *   • Title row:   [StatusDot] [name (truncate)]
 *   • Footer:      Created {date}
 *   • Hover lift:  y: -2 with springs.snappy
 *   • Click → rail (Phase C); admin click on avatar → quick-assign popover.
 *
 * The outer surface is a div with role="button" (not a <button>) so the
 * nested AssigneePopover trigger button is valid HTML.
 */

'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { UserPlus, CalendarClock, Calendar, Pencil, Trash2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { springs } from '@/lib/motion';
import { useEkoSpotlight } from '@/lib/hooks/useEkoSpotlight';
import { isTerminalStatus, type Profile, type TaskStatus, type TaskWithAssignee } from '@/lib/types';
import { StatusDot } from './StatusDot';
import { AssigneePopover } from './AssigneePopover';
import { StatusPopover } from './StatusPopover';
import { PriorityIcon, PRIORITY_COLOR } from './PriorityIcon';
import { cn } from '@/lib/utils';

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

function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Short "Created May 13" — matches the Paper footer ("Created May …" truncated). */
function shortCreated(dateStr?: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `Created ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/**
 * Deadline meta for the card footer. `deadline` is a DATE (YYYY-MM-DD) — parse
 * it from local components so it doesn't shift a day west of UTC, then compare
 * calendar days (not timestamps) so a task due *today* is not flagged overdue.
 * `now` is injectable for testing.
 *
 * `overdue` here is the CALENDAR fact — "this date is in the past" — and nothing
 * more. Whether past-ness is worth an alarm is the card's call, not this
 * function's: a shipped task's deadline is history. See `missedDeadline` below.
 */
export function formatDeadline(
  deadline: string | null | undefined,
  now: Date = new Date(),
): { label: string; overdue: boolean } | null {
  if (!deadline) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return {
    label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    overdue: startOfDay(d) < startOfDay(now),
  };
}

export function TaskCard({
  task,
  onClick,
  index = 0,
  className,
  isAdmin = false,
  team,
  onAssign,
  onStatusChange,
  onDelete,
  muted = false,
}: {
  task: TaskWithAssignee;
  onClick?: () => void;
  /** For entrance stagger inside a column. */
  index?: number;
  className?: string;
  /** Admin gets the quick-assign affordance on the avatar/+ chip. */
  isAdmin?: boolean;
  /** Roster used to populate the assignee menu (admin only). */
  team?: Profile[];
  /** Mutation callback (admin only): null clears the assignee. */
  onAssign?: (taskId: string, profileId: string | null) => void;
  /**
   * Opt-in: when provided (admin only), the status dot becomes a trigger that
   * opens a status switcher and moves the card to the chosen column. Omit it
   * and the dot stays a plain presentational span (column headers, hidden
   * stack, detail rail, etc. never get the interactive dot).
   */
  onStatusChange?: (taskId: string, next: TaskStatus) => void;
  /** Admin-only quick delete hook. Parent owns the undo window. */
  onDelete?: (taskId: string) => void;
  /**
   * Quiets a terminal-column card (Done/Canceled/Duplicate): flat ring instead
   * of the elevated shadow, no hover lift. Keeps In Progress the visual hero.
  */
  muted?: boolean;
}) {
  const reduce = useReducedMotion();
  // EKO bus consumer: when the tray's post-write receipt points at this task,
  // scroll the card into view and run the `eko-spotlight` pulse (globals.css).
  const { ref: spotlightRef, spotlit } = useEkoSpotlight<HTMLDivElement>({
    id: task.id,
    taskNumber: task.task_number ?? undefined,
    name: task.name,
  });
  const [contextOpen, setContextOpen] = useState(false);
  const [contextCoords, setContextCoords] = useState<ContextMenuCoords | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextPointerRef = useRef<ContextMenuCoords | null>(null);
  const idLabel = task.task_number != null ? String(task.task_number) : null;
  const created = shortCreated(task.created_at);
  const deadline = formatDeadline(task.deadline);
  // A Done/Canceled/Duplicate card is finished, so it cannot be LATE — a red
  // "Overdue May 22" on a task that shipped is the board shouting about a race
  // that's already over, and it drains the alarm of meaning on the cards that
  // are genuinely late. The date stays (it's still a fact about the task); only
  // the alarm goes, leaving the same neutral chip an on-time due date wears.
  const missedDeadline = !!deadline?.overdue && !isTerminalStatus(task.status);
  const assignee = task.assignee;

  const canQuickAssign = isAdmin && !!team && !!onAssign;
  const canQuickStatus = isAdmin && !!onStatusChange;
  const canContextDelete = isAdmin && !!onDelete;
  const canContextEdit = !!onClick;
  const canOpenContextMenu = canContextEdit || canContextDelete;

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

  // The visible avatar/initials block — same in both editable and read-only modes.
  const avatarVisual = assignee ? (
    <Avatar className="size-5 shrink-0 ring-1 ring-wash-4">
      <AvatarImage src={assignee.avatar_url ?? undefined} alt={assignee.display_name ?? ''} />
      <AvatarFallback seed={assignee.id} className="text-[8px] font-medium text-ink-body">
        {initials(assignee.display_name)}
      </AvatarFallback>
    </Avatar>
  ) : null;

  // Trigger shown when the card is unassigned and the user is an admin —
  // a dashed circle with a + icon, matching the popover's "No assignee" row.
  const emptyTrigger = (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-[#cfcfcf] dark:border-wash-6 text-ink-faint transition-colors hover:border-ink-faint hover:text-ink-body"
      aria-hidden
    >
      <UserPlus className="size-3" strokeWidth={1.75} />
    </span>
  );

  const headerRight = canQuickAssign ? (
    <AssigneePopover
      value={task.assignee_id ?? null}
      team={team!}
      ariaLabel={assignee ? `Change assignee for ${task.name}` : `Assign ${task.name}`}
      onSelect={(next) => onAssign!(task.id, next)}
    >
      {avatarVisual ?? emptyTrigger}
    </AssigneePopover>
  ) : (
    avatarVisual ?? <span aria-hidden />
  );

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (!canOpenContextMenu) return;
    event.preventDefault();
    event.stopPropagation();
    contextPointerRef.current = { left: event.clientX, top: event.clientY };
    setContextCoords(placeContextMenu(event.clientX, event.clientY, 88));
    setContextOpen(true);
  }

  function handleEditFromContext() {
    setContextOpen(false);
    onClick?.();
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
          key="task-card-context-menu"
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
          /* The inline shadow is black-alpha and therefore INVISIBLE in dark —
             it's the one floating menu the shadow tokens never reached. Dark
             takes the canonical pop token instead; light keeps the hand-tuned
             stack it already ships. */
          className="z-[220] overflow-hidden rounded-[14px] bg-overlay p-1 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_2px_4px_-1px_rgba(0,0,0,0.08),0_10px_24px_-12px_rgba(0,0,0,0.22),0_24px_44px_-28px_rgba(0,0,0,0.18)] dark:shadow-seeko-pop"
        >
          {canContextEdit && (
            <button
              type="button"
              role="menuitem"
              onClick={handleEditFromContext}
              className="flex h-8 w-full items-center gap-2 rounded-[10px] px-2 text-left text-[12.5px] text-[#242424] dark:text-ink-strong transition-colors hover:bg-wash-5"
            >
              <Pencil className="size-3.5 text-[#777777] dark:text-ink-muted" />
              <span className="flex-1 truncate">Edit issue</span>
            </button>
          )}
          {canContextDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={handleDeleteFromContext}
              className="flex h-8 w-full items-center gap-2 rounded-[10px] px-2 text-left text-[12.5px] text-[#dc2626] transition-colors hover:bg-[#fef2f2] dark:hover:bg-danger/15"
            >
              <Trash2 className="size-3.5" />
              <span className="flex-1 truncate">Delete issue</span>
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <motion.div
        ref={spotlightRef}
        role="button"
        tabIndex={0}
        aria-label={`Open ${task.name}`}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          ...springs.smooth,
          delay: reduce ? 0 : 0.04 + index * 0.025,
        }}
        whileHover={reduce || muted ? undefined : { y: -2 }}
        whileTap={reduce ? undefined : { scale: 0.985 }}
        style={{ transformOrigin: 'center' }}
        className={cn(
          'group block w-full min-h-[124px] rounded-xl px-4 py-5 text-left select-none',
          muted
            ? 'bg-white/65 shadow-none ring-1 ring-wash-6 dark:bg-surface-1/65'
            : 'bg-surface-1 shadow-seeko',
          'cursor-pointer outline-none',
          contextOpen && 'ring-2 ring-seeko-accent/25',
          spotlit && 'eko-spotlight',
          'focus-visible:ring-2 focus-visible:ring-seeko-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#eeeeee] dark:focus-visible:ring-offset-[oklch(0.240_0_0)]',
          className,
        )}
      >
        {/* Header row — id label · assignee trigger */}
        <div className="flex items-start justify-between gap-2">
          {idLabel ? (
            /* select-text inside the card's select-none. The card is a click
               target, so its body shouldn't select — but the task number is the
               one thing on it anyone copies (into a commit message, into Slack),
               and until now you had to open the detail page to get it. */
            <span className="select-text font-mono text-[11px] leading-none tabular-nums text-ink-muted">
              {idLabel}
            </span>
          ) : (
            <span aria-hidden />
          )}
          {headerRight}
        </div>

        {/* Title row — status dot · name */}
        <div className="mt-3 flex items-center gap-2">
          {canQuickStatus ? (
            <StatusPopover
              value={task.status}
              ariaLabel={`Change status for ${task.name}`}
              onSelect={(next) => onStatusChange!(task.id, next)}
            >
              <StatusDot status={task.status} size="sm" className="shrink-0" />
            </StatusPopover>
          ) : (
            <StatusDot status={task.status} size="sm" className="shrink-0" />
          )}
          <span className="min-w-0 flex-1 line-clamp-2 text-[13.5px] font-medium leading-snug text-[#222222] dark:text-ink-strong">
            {task.name}
          </span>
        </div>

        {/* Footer — compact metadata chips keep priority and deadline contained. */}
        <div className="mt-3.5 flex min-w-0 items-center gap-1.5 overflow-hidden">
          <span
            className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-wash-4 px-2 text-[11px] font-medium leading-none text-[#6f6f6f] dark:text-ink-muted"
            aria-label={`Priority ${task.priority}`}
          >
            <PriorityIcon
              level={task.priority}
              className="size-3.5 shrink-0"
              style={{ color: PRIORITY_COLOR[task.priority] }}
            />
            <span className="max-w-[62px] truncate">{task.priority}</span>
          </span>
          {deadline ? (
            <span
              className={cn(
                'inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium leading-none tabular-nums',
                missedDeadline
                  ? 'bg-[#f04438]/10 dark:bg-danger/15 text-[#d92d20] dark:text-danger'
                  : 'bg-wash-4 text-[#777777] dark:text-ink-muted',
              )}
            >
              <CalendarClock className="size-3 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{missedDeadline ? `Overdue ${deadline.label}` : deadline.label}</span>
            </span>
          ) : created ? (
            <span className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full bg-wash-4 px-2 text-[11px] font-medium leading-none tabular-nums text-ink-muted">
              <Calendar className="size-3 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{created}</span>
            </span>
          ) : null}
        </div>
      </motion.div>
      {typeof document !== 'undefined' ? createPortal(contextMenu, document.body) : null}
    </>
  );
}
