/* TaskActionsMenu — admin-only "⋯" menu in the rail header.
 *
 * Currently exposes one action: Delete task. Click "Delete task" once →
 * the item swaps to a red "Hold to delete" affordance; press-and-hold for
 * HOLD_MS to commit. Click anywhere else (or press Escape) to cancel.
 *
 * Important: this menu does NOT touch the database. Once the hold
 * completes, it calls `onDeleted(taskId)` — the parent (TasksBoard)
 * optimistically removes the task from local state and starts a 15-second
 * undo window. The actual Supabase DELETE only fires when that window
 * expires (or the user dismisses the undo toast). This keeps the menu
 * simple and centralizes the delete timer in one place.
 *
 * Portal pattern matches the other rail popovers (right-aligned to the
 * trigger, fixed positioning, flip-above-on-overflow). */

'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { MoreHorizontal, Trash2 } from 'lucide-react';

const SPRING = { type: 'spring' as const, stiffness: 340, damping: 30 };
const PANEL_WIDTH = 180;
const GAP = 4;
const EDGE = 8;
/** Press-and-hold duration for the destructive confirm step. */
const HOLD_MS = 3000;

type Coords = { left: number; top: number };

function computeCoords(rect: DOMRect, panelHeight: number): Coords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rect.right - PANEL_WIDTH;
  if (left + PANEL_WIDTH + EDGE > vw) left = vw - PANEL_WIDTH - EDGE;
  if (left < EDGE) left = EDGE;

  let top = rect.bottom + GAP;
  if (top + panelHeight + EDGE > vh) {
    const above = rect.top - GAP - panelHeight;
    top = above >= EDGE ? above : Math.max(EDGE, vh - panelHeight - EDGE);
  }
  return { left, top };
}

export function TaskActionsMenu({
  taskId,
  taskName,
  onDeleted,
}: {
  taskId: string;
  taskName: string;
  /** Fires once the hold-to-delete completes. The parent removes the task
   *  from local state and opens the undo toast; the DB delete is deferred. */
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [holding, setHolding] = useState(false);
  const reduce = useReducedMotion();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const holdTimerRef = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);

  // Reset state whenever the menu opens.
  useEffect(() => {
    if (open) {
      setConfirmDelete(false);
      setHolding(false);
    }
  }, [open]);

  // Clear any pending hold timer when the popover closes or unmounts.
  useEffect(() => {
    if (!open && holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    return () => {
      if (holdTimerRef.current != null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const h = panelRef.current?.offsetHeight ?? 80;
      setCoords(computeCoords(trigger.getBoundingClientRect(), h));
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function performDelete() {
    // Defer to the parent — it manages the optimistic remove + undo window
    // + actual Supabase call. We just signal "the user committed to delete."
    onDeleted(taskId);
    setHolding(false);
    setOpen(false);
  }

  function startHold() {
    setHolding(true);
    if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      performDelete();
    }, HOLD_MS);
  }

  function cancelHold() {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHolding(false);
  }

  const panel = (
    <AnimatePresence>
      {open && coords && (
        <motion.div
          ref={panelRef}
          key="task-actions-panel"
          role="menu"
          aria-label={`Actions for ${taskName}`}
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={reduce ? { duration: 0 } : SPRING}
          style={{ position: 'fixed', left: coords.left, top: coords.top, width: PANEL_WIDTH }}
          className="z-[200] origin-top-right overflow-hidden rounded-[14px] bg-surface-1 p-1 shadow-seeko-pop"
        >
          {confirmDelete ? (
            <button
              type="button"
              role="menuitem"
              onPointerDown={startHold}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onPointerCancel={cancelHold}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
                  e.preventDefault();
                  startHold();
                }
              }}
              onKeyUp={(e) => {
                if (e.key === 'Enter' || e.key === ' ') cancelHold();
              }}
              aria-label={`Hold to delete ${taskName}`}
              className="relative flex w-full select-none items-center gap-2 overflow-hidden rounded-[10px] bg-[#fef2f2] dark:bg-danger/10 px-2.5 py-1.5 text-left text-[13px] font-medium text-[#dc2626] transition-colors hover:bg-[#fee2e2] dark:hover:bg-danger/[0.18]"
            >
              {/* Hold-fill — animates 0 → 100% over HOLD_MS, snaps back on release. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 bg-[#dc2626]/15"
                style={{
                  width: holding ? '100%' : '0%',
                  transition: holding
                    ? `width ${HOLD_MS}ms linear`
                    : 'width 150ms ease-out',
                }}
              />
              <Trash2 className="relative size-3.5" />
              <span className="relative">
                {holding ? 'Keep holding…' : 'Hold to delete'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-[13px] text-ink-body transition-colors hover:bg-wash-4 hover:text-[#dc2626]"
            >
              <Trash2 className="size-3.5" />
              Delete task
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Task actions"
        onClick={() => setOpen((v) => !v)}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-wash-4 hover:text-ink"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {mounted ? createPortal(panel, document.body) : null}
    </>
  );
}
