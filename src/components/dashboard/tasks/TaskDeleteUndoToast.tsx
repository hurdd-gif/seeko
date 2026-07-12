/* TaskDeleteUndoToast — top-center confirmation card for "task deleted".
 *
 * The actual DB delete is deferred by UNDO_WINDOW_MS; in this window the
 * toast shows the task name, an Undo action, and a drain layer that
 * empties left-to-right as the window expires. Undo restores the task;
 * × commits the delete immediately and dismisses.
 *
 * State (timer, task snapshot) lives in TasksBoard — this component is
 * pure display + callbacks.
 *
 * Visual: Delphi alert language (build.delphi.ai/system/alert), matching
 * RichToastCard anatomy exactly — warm off-white flat card, 18px radius,
 * 1px low-alpha border, no shadow, 14/20 type on a single 28px rail:
 * glyph + title row, task name as the muted subject row, "Undo" as the
 * underlined action. The delete confirmation renders NEUTRAL (only errors
 * take the red tint); the destruction countdown is the drain layer in the
 * system red at the error-wash strength, receding right → left as the
 * undo window expires.
 *
 * ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   toast slides down from above + fades in, scale 0.96 → 1
 *          (springs.smooth, origin top — the anchored edge)
 *    0ms   drain layer starts at 100% width
 * 15000ms  drain layer reaches 0% → parent commits delete + unmounts
 *   exit   y 0 → -8, scale 0.99, blur 2px — subtler than enter
 *  reduce  opacity only, snappy
 * ───────────────────────────────────────────────────────── */

'use client';

import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Trash2, X } from 'lucide-react';
import { springs } from '@/lib/motion';

export const UNDO_WINDOW_MS = 15_000;

// ── Delphi alert surface (mirrors VARIANT_STYLE.NEUTRAL in rich-toast.tsx) ──
const SURFACE = {
  bg: 'rgb(249 249 248)',
  border: '1px solid oklab(0.641295 -0.00290838 0.0098139 / 0.12)',
  title: 'rgb(33 32 28)',
  muted: 'rgb(99 99 94)',
  glyphBg: 'rgb(33 32 28)',
  /** Drain tint — the system red, but BELOW the 10% error-wash strength so
      the countdown veil never reads as the error variant. */
  drain: 'color-mix(in oklab, rgb(220 62 66) 7%, transparent)',
};
const GLYPH_PX = 18; // leading glyph diameter (matches rich toast)
const RAIL_GAP_PX = 10; // glyph → title gap; rows 2–3 indent to the same rail
const RAIL_INSET_PX = GLYPH_PX + RAIL_GAP_PX; // 28px — one clean vertical rail

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
      initial={reduce ? { opacity: 0, x: '-50%' } : { opacity: 0, x: '-50%', y: -16, scale: 0.96 }}
      animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
      exit={
        reduce
          ? { opacity: 0, x: '-50%' }
          : { opacity: 0, x: '-50%', y: -8, scale: 0.99, filter: 'blur(2px)' }
      }
      transition={reduce ? { duration: 0.13, ease: [0.23, 1, 0.32, 1] } : springs.smooth}
      style={{
        position: 'fixed',
        left: '50%',
        top: 24,
        transformOrigin: 'top center',
        borderRadius: 18,
        background: SURFACE.bg,
        border: SURFACE.border,
        boxShadow: 'none',
      }}
      className="z-[300] w-[400px] max-w-[calc(100vw-2rem)] overflow-hidden antialiased"
    >
      {/* Drain layer — fills the frame and recedes right → left as the
          undo window expires. Sits behind the content. CSS keyframes live
          in globals.css; the parent unmounts the toast at the same moment
          the layer reaches 0% width. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 origin-left"
        style={{
          width: '100%',
          background: SURFACE.drain,
          animation: reduce
            ? undefined
            : `seeko-undo-drain ${UNDO_WINDOW_MS}ms linear forwards`,
        }}
      />
      <div className="relative" style={{ padding: '12px 16px' }}>
        {/* Close — commits the delete now; same treatment as the rich-toast close */}
        <button
          type="button"
          onClick={onCommit}
          aria-label="Dismiss and delete now"
          className="absolute right-[12px] top-[10px] flex size-6 items-center justify-center rounded-md transition-[background-color,transform] duration-150 ease-out hover:bg-wash-5 active:scale-95 active:bg-black/[0.09] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-black/20"
          style={{ color: SURFACE.muted }}
        >
          <X className="size-4" strokeWidth={2} />
        </button>

        {/* Row 1 — glyph + title */}
        <div className="flex items-center" style={{ gap: RAIL_GAP_PX }}>
          <span
            aria-hidden
            className="flex shrink-0 items-center justify-center rounded-full text-white"
            style={{ width: GLYPH_PX, height: GLYPH_PX, background: SURFACE.glyphBg }}
          >
            <Trash2 className="size-3" strokeWidth={2.5} />
          </span>
          <p
            className="font-medium"
            style={{ fontSize: 14, lineHeight: '20px', paddingRight: 24, color: SURFACE.title }}
          >
            Task deleted
          </p>
        </div>

        {/* Rows 2–3 — subject + action, indented to the single rail (28px) */}
        <div className="flex flex-col" style={{ paddingLeft: RAIL_INSET_PX, marginTop: 2, rowGap: 8 }}>
          <span
            className="truncate"
            style={{ fontSize: 14, lineHeight: '20px', fontWeight: 400, color: SURFACE.muted }}
          >
            {taskName}
          </span>
          <button
            type="button"
            onClick={onUndo}
            className="w-fit rounded-sm font-medium underline underline-offset-[3px] transition-opacity duration-150 ease-out hover:opacity-70 active:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/20"
            style={{ fontSize: 14, lineHeight: '20px', color: SURFACE.title }}
          >
            Undo
          </button>
        </div>
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
