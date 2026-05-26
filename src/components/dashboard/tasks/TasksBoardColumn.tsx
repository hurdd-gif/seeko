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

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

export function TasksBoardColumn({
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
          className="z-[200] origin-top-right overflow-hidden rounded-lg bg-white p-1 shadow-seeko-pop"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!onHide}
            onClick={() => {
              onHide?.(status);
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-[#1a1a1a] transition-colors hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <EyeOff className="size-3.5 text-[#808080]" />
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
        // as a contained unit. Cards float at 280px inside the tray's padding.
        'flex w-[296px] shrink-0 flex-col gap-2 rounded-xl bg-black/[0.035] p-2',
        className,
      )}
      aria-label={`${status} column`}
    >
      {/* Column header */}
      <div className="group/header flex items-center gap-2 px-1 pt-0.5 pb-1">
        <StatusDot status={status} size="md" className="shrink-0" />
        <span className="text-[13px] font-semibold text-[#222222]">{status}</span>
        <span className="text-[12px] tabular-nums text-[#9a9a9a]">{count}</span>

        <span className="ml-auto flex items-center gap-0.5">
          <button
            ref={triggerRef}
            type="button"
            aria-label="Column options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className={cn(
              'flex size-6 items-center justify-center rounded-md text-[#9a9a9a] transition hover:bg-black/[0.045] hover:text-[#505050]',
              menuOpen ? 'opacity-100 bg-black/[0.045] text-[#505050]' : 'opacity-0 group-hover/header:opacity-100',
            )}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onAddTask ? () => onAddTask(status) : undefined}
            aria-label={`Add task to ${status}`}
            className="flex size-6 items-center justify-center rounded-md text-[#9a9a9a] opacity-0 transition hover:bg-black/[0.045] hover:text-[#505050] group-hover/header:opacity-100"
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
          />
        ))}
      </div>

      {mounted ? createPortal(menu, document.body) : null}
    </motion.section>
  );
}
