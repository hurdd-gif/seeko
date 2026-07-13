/**
 * TasksBoardColumn — one status column on the issue board.
 *
 * Layout (light-mode adaptation of Paper TA-0):
 *   Header: [StatusDot md] [Status name] [count]    [⋯] [+]
 *   Body:   vertical stack of TaskCards (8px gap)
 *
 * The `⋯` button opens a tiny portaled menu (currently a single
 * "Hide column" action that calls `onHide`). Portaled so the rail's
 * overflow-hidden parents can't clip it. `+` calls `onAddTask`.
 */

'use client';

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { MoreHorizontal, Plus, EyeOff } from 'lucide-react';
import type { Profile, TaskStatus, TaskWithAssignee } from '@/lib/types';
import { StatusDot } from './StatusDot';
import { TaskCard } from './TaskCard';
import { springs } from '@/lib/motion';
import { cn } from '@/lib/utils';

const MENU_SPRING = { type: 'spring' as const, stiffness: 340, damping: 30 };
const MENU_WIDTH = 168;
const GAP = 4;
const EDGE = 8;

function placeMenu(rect: DOMRect, menuHeight: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = rect.right - MENU_WIDTH;
  if (left + MENU_WIDTH + EDGE > vw) left = vw - MENU_WIDTH - EDGE;
  if (left < EDGE) left = EDGE;

  let top = rect.bottom + GAP;
  if (top + menuHeight + EDGE > vh) {
    const above = rect.top - GAP - menuHeight;
    top = above >= EDGE ? above : Math.max(EDGE, vh - menuHeight - EDGE);
  }
  return { left, top };
}

/**
 * memo, and it earns its keep. A column is the most expensive thing on the page
 * — its whole card stack renders with it — and TasksBoard holds a pile of chrome
 * state that has nothing to do with the cards (filter row open, composer open,
 * rail open, undo toast). Unmemoized, opening the filter bar re-rendered every
 * card on the board inside the frame the unfold animation started on: a measured
 * 58ms stall, identical on open and close, which is exactly what "choppy" was.
 * Every prop below is kept referentially stable on the TasksBoard side, so this
 * bails out on chrome-only renders.
 */
export const TasksBoardColumn = memo(function TasksBoardColumn({
  status,
  tasks,
  onSelectTask,
  onAddTask,
  onHide,
  columnIndex = 0,
  className,
  isAdmin = false,
  team,
  onAssign,
  onStatusChange,
  onDeleteTask,
  muted = false,
}: {
  status: TaskStatus;
  tasks: TaskWithAssignee[];
  onSelectTask?: (task: TaskWithAssignee) => void;
  /** Called when the `+` header button is pressed. */
  onAddTask?: (status: TaskStatus) => void;
  /** Called when the user picks "Hide column" from the ⋯ menu. */
  onHide?: (status: TaskStatus) => void;
  /** Used to stagger column entrance left-to-right. */
  columnIndex?: number;
  className?: string;
  /** Forwarded to TaskCard for the quick-assign popover. */
  isAdmin?: boolean;
  team?: Profile[];
  onAssign?: (taskId: string, profileId: string | null) => void;
  /** Forwarded to TaskCard for the quick status switcher (admin only). */
  onStatusChange?: (taskId: string, next: TaskStatus) => void;
  /** Forwarded to TaskCard for right-click quick delete (admin only). */
  onDeleteTask?: (taskId: string) => void;
  /**
   * Quiets a terminal column (Done/Canceled/Duplicate): dimmer header label and
   * flat cards, so the active In Progress / In Review columns stay the hero.
   */
  muted?: boolean;
}) {
  const reduce = useReducedMotion();
  const count = tasks.length;

  // ── ⋯ menu state ─────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!menuOpen || !triggerRef.current) return;
    function place() {
      const t = triggerRef.current;
      if (!t) return;
      const h = menuRef.current?.offsetHeight ?? 40;
      setCoords(placeMenu(t.getBoundingClientRect(), h));
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const menu = (
    <AnimatePresence>
      {menuOpen && coords && (
        <motion.div
          ref={menuRef}
          key="col-menu"
          role="menu"
          aria-label={`${status} column actions`}
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={reduce ? { duration: 0 } : MENU_SPRING}
          style={{ position: 'fixed', left: coords.left, top: coords.top, width: MENU_WIDTH }}
          className="z-[200] origin-top-right overflow-hidden rounded-[14px] bg-overlay p-1 shadow-seeko-pop"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!onHide}
            onClick={() => {
              onHide?.(status);
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-[13px] text-ink-body transition-colors hover:bg-wash-4 hover:text-ink-title disabled:cursor-not-allowed disabled:opacity-50"
          >
            <EyeOff className="size-3.5 text-ink-muted" />
            <span className="flex-1 truncate">Hide column</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.smooth, delay: reduce ? 0 : 0.04 + columnIndex * 0.05 }}
      className={cn(
        // Column tray: subtle channel against --ov-bg so the status group reads
        // as a contained unit. Cards float at 312px inside the tray's padding
        // (328px tray − p-2 ×2) — larger, more substantial card footprint.
        // 20px radius = card rounded-xl (12) + p-2 gap (8) → concentric corners.
        'flex w-[328px] shrink-0 flex-col gap-2 rounded-[20px] bg-wash-4 p-2',
        className,
      )}
      aria-label={`${status} column`}
    >
      {/* Column header */}
      <div className="group/header flex items-center gap-2 px-1 pt-0.5 pb-1">
        <StatusDot status={status} size="md" className="shrink-0" />
        <span
          className={cn(
            'text-[13px] font-semibold',
            muted ? 'text-ink-faint' : 'text-[#222222] dark:text-ink-strong',
          )}
        >
          {status}
        </span>
        <span className="text-[12px] tabular-nums text-ink-faint">{count}</span>

        <span className="ml-auto flex items-center gap-0.5">
          <button
            ref={triggerRef}
            type="button"
            aria-label="Column options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className={cn(
              'flex size-6 items-center justify-center rounded-md text-ink-faint transition hover:bg-wash-5 hover:text-ink-body',
              menuOpen ? 'opacity-100 bg-wash-5 text-ink-body' : 'opacity-0 group-hover/header:opacity-100',
            )}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onAddTask ? () => onAddTask(status) : undefined}
            aria-label={`Add task to ${status}`}
            className="flex size-6 items-center justify-center rounded-md text-ink-faint opacity-0 transition hover:bg-wash-5 hover:text-ink-body group-hover/header:opacity-100"
          >
            <Plus className="size-3.5" />
          </button>
        </span>
      </div>

      {/* Card stack */}
      <div className="flex flex-col gap-2">
        {tasks.map((task, i) => (
          <TaskCard
            key={task.id}
            task={task}
            index={i}
            onClick={onSelectTask ? () => onSelectTask(task) : undefined}
            isAdmin={isAdmin}
            team={team}
            onAssign={onAssign}
            onStatusChange={onStatusChange}
            onDelete={onDeleteTask}
            muted={muted}
          />
        ))}
      </div>

      {mounted ? createPortal(menu, document.body) : null}
    </motion.section>
  );
});
