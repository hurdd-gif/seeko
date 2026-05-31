/* TaskDeleteUndoToast — top-center confirmation card for "task deleted".
 *
 * The actual DB delete is deferred by UNDO_WINDOW_MS; in that window this
 * toast shows the task name, an undo arrow button, and a drain bar that
 * empties left-to-right as the window expires. Clicking the arrow restores
 * the task. Clicking × commits the delete immediately and dismisses.
 *
 * State (timer, task snapshot) lives in TasksBoard — this component is
 * pure display + callbacks.
 *
 * Visual: paper-family white card. The entire frame is the time indicator
 * — a faint red tint layer sits behind the content and shrinks from full
 * width to zero across the undo window, receding right → left as the
 * destruction draws closer. Undo uses the brand blue so the rescue action
 * reads as positive, not destructive.
 *
 * ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   toast slides down from above + fades in (spring)
 *    0ms   drain bar starts at 100% width
 * 15000ms  drain bar reaches 0% → parent commits delete + unmounts toast
 *   exit   slides back up + fades out (spring)
 * ───────────────────────────────────────────────────────── */

'use client';

import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Trash2, Undo2, X } from 'lucide-react';

const SPRING = { type: 'spring' as const, stiffness: 380, damping: 32 };

export const UNDO_WINDOW_MS = 15_000;

export function TaskDeleteUndoToast({
  taskName,
  onUndo,
  onCommit,
}: {
  /** Name of the task that was just deleted. */
  taskName: string;
  /** Called when the user clicks Undo — restore the task. */
  onUndo: () => void;
  /** Called when the user clicks × — commit the delete immediately. */
  onCommit: () => void;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={reduce ? { opacity: 0, x: '-50%' } : { opacity: 0, x: '-50%', y: -16 }}
      animate={{ opacity: 1, x: '-50%', y: 0 }}
      exit={reduce ? { opacity: 0, x: '-50%' } : { opacity: 0, x: '-50%', y: -16 }}
      transition={reduce ? { duration: 0.15 } : SPRING}
      style={{ position: 'fixed', left: '50%', top: 24 }}
      className="z-[300] flex w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl bg-white shadow-seeko-pop ring-1 ring-black/[0.06]"
    >
      {/* Drain layer — fills the frame and recedes right → left as the
          undo window expires. Sits behind the content (relative wrapper
          below). CSS keyframes live in globals.css; the parent unmounts
          the toast at the same moment the layer reaches 0% width. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 origin-left bg-[#dc2626]/[0.07]"
        style={{
          width: '100%',
          animation: reduce
            ? undefined
            : `seeko-undo-drain ${UNDO_WINDOW_MS}ms linear forwards`,
        }}
      />
      <div className="relative flex items-center gap-3 px-3.5 py-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#f4f4f3] text-[#9a9a9a]">
          <Trash2 className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px]">
          {/* "Task deleted:" muted, name in near-black for ≥4.5:1 contrast */}
          <span className="text-[#7a7a7a]">Task deleted:</span>{' '}
          <span className="font-medium text-[#1a1a1a]">{taskName}</span>
        </span>
        <button
          type="button"
          aria-label="Undo delete"
          onClick={onUndo}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#0d7aff]/[0.08] text-[#0d7aff] transition-colors hover:bg-[#0d7aff]/[0.14] active:bg-[#0d7aff]/[0.2]"
        >
          <Undo2 className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Dismiss and delete now"
          onClick={onCommit}
          className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-full text-[#b8b8b8] transition-colors hover:bg-[#dc2626]/[0.12] hover:text-[#dc2626]"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

/** Mount wrapper that renders the toast iff a pending delete exists. */
export function TaskDeleteUndoToastSlot({
  pendingTaskName,
  onUndo,
  onCommit,
}: {
  pendingTaskName: string | null;
  onUndo: () => void;
  onCommit: () => void;
}) {
  return (
    <AnimatePresence>
      {pendingTaskName !== null && (
        <TaskDeleteUndoToast
          key="task-delete-undo-toast"
          taskName={pendingTaskName}
          onUndo={onUndo}
          onCommit={onCommit}
        />
      )}
    </AnimatePresence>
  );
}
