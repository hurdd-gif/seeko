/**
 * HiddenColumnsStack — the "Hidden columns" rollup on the right of the board.
 *
 * Paper TA-0 shows an open list of empty statuses (each with count 0). We
 * collapse it by default and expose a chevron to toggle. When expanded, each
 * row is a real status that can later be drag-targeted (Phase 2 DnD) or
 * clicked to expand into a full column.
 *
 * Layout: 280-wide tile (matches column width) with rows that share the
 * StatusDot+name+count vocabulary of the column headers.
 */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import type { TaskStatus } from '@/lib/types';
import { StatusDot } from './StatusDot';
import { springs } from '@/lib/motion';
import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Hidden columns rollup
 *
 *  Expand    0ms  chevron rotates open (snappy)
 *            0ms  rail width animates auto → 328 (~200ms glide).
 *                 Real width animation, NOT `layout` — layout
 *                 interpolates size with scaleX, which squishes
 *                 the header text and rows mid-flight.
 *           20ms  rows cascade in, 20ms apart:
 *                 y -6 → 0 · opacity 0 → 1 · blur 2px → 0
 *  Collapse  0ms  chevron rotates closed; list pops out of
 *                 flow (popLayout) and fades quietly (100ms,
 *                 no travel back) while the width shrinks
 *                 underneath it — one beat, not two.
 * ───────────────────────────────────────────────────────── */

const ROLLUP = {
  railWidth: 328, // px, open width (matches column width)
  /* Near-critically damped (ζ≈0.98) — the rail edge glides to rest with no
   * overshoot. An underdamped spring (e.g. 300/25, ζ≈0.72) visibly wobbles a
   * width, because rows reflow with the bouncing edge. 550/46 keeps the same
   * damping ratio but settles ~200ms — dropdown-speed. */
  railSpring: { type: 'spring' as const, stiffness: 550, damping: 46 },
  rowStagger: 0.02, // s between row entrances
  rowDelay: 0.02, // s before the first row (lets the width start moving)
  rowOffsetY: -6,
  rowBlur: 'blur(2px)',
  exitFade: { duration: 0.1, ease: 'easeOut' as const },
};

const listVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: ROLLUP.rowStagger, delayChildren: ROLLUP.rowDelay },
  },
  exit: { opacity: 0, transition: ROLLUP.exitFade },
};

const rowVariants = {
  hidden: { opacity: 0, y: ROLLUP.rowOffsetY, filter: ROLLUP.rowBlur },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: springs.smooth },
};

/** Reduced motion: plain crossfade, no stagger, no travel, no blur. */
const listVariantsReduced = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.1 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

const rowVariantsReduced = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
};

export function HiddenColumnsStack({
  hiddenStatuses,
  countsByStatus,
  defaultOpen = true,
  onExpandColumn,
  className,
}: {
  hiddenStatuses: TaskStatus[];
  countsByStatus: Record<TaskStatus, number>;
  /** Whether the rollup is expanded on first render. */
  defaultOpen?: boolean;
  /** Called when a row is clicked — should promote that status to a visible column. */
  onExpandColumn?: (status: TaskStatus) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(defaultOpen);

  if (hiddenStatuses.length === 0) return null;

  return (
    <motion.section
      initial={false}
      animate={{ width: open ? ROLLUP.railWidth : 'auto' }}
      transition={reduce ? { duration: 0 } : ROLLUP.railSpring}
      className={cn('relative flex shrink-0 flex-col gap-2', className)}
      aria-label="Hidden columns"
    >
      {/* Header toggle — collapsed, this is the whole rail: a thin affordance
          that reclaims the empty column's horizontal space. */}
      <button
        type="button"
        data-testid="Hidden columns toggle"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-1.5 pt-0.5 pb-1 text-left transition-colors hover:bg-black/[0.03] active:bg-black/[0.05]"
        aria-expanded={open}
      >
        <motion.span
          animate={{ rotate: open ? 0 : -90 }}
          transition={reduce ? { duration: 0 } : springs.snappy}
          className="inline-flex"
        >
          <ChevronDown className="size-3.5 text-[#9a9a9a]" />
        </motion.span>
        <span className="whitespace-nowrap text-[13px] font-semibold text-[#505050]">
          Hidden columns
        </span>
        <span className="ml-1 rounded-full bg-black/[0.05] px-1.5 text-[11px] font-medium tabular-nums leading-[18px] text-[#808080]">
          {hiddenStatuses.length}
        </span>
      </button>

      <AnimatePresence initial={false} mode="popLayout">
        {open && (
          <motion.ul
            key="rollup"
            variants={reduce ? listVariantsReduced : listVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col gap-1"
          >
            {hiddenStatuses.map((status) => (
              <motion.li key={status} variants={reduce ? rowVariantsReduced : rowVariants}>
                <button
                  type="button"
                  data-testid={`${status} column`}
                  onClick={onExpandColumn ? () => onExpandColumn(status) : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg bg-white px-3 py-2.5 shadow-seeko',
                    'transition-[background-color,transform] duration-150 ease-out',
                    'hover:bg-[#fafafa] motion-safe:active:scale-[0.98]',
                  )}
                >
                  <StatusDot status={status} size="md" className="shrink-0" />
                  <span className="text-[13px] font-medium text-[#222222]">{status}</span>
                  <span className="ml-auto text-[12px] tabular-nums text-[#9a9a9a]">
                    {countsByStatus[status] ?? 0}
                  </span>
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
