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
    <section className={cn('flex w-[296px] shrink-0 flex-col gap-2', className)} aria-label="Hidden columns">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-1 pt-0.5 pb-1 text-left"
        aria-expanded={open}
      >
        <motion.span
          animate={{ rotate: open ? 0 : -90 }}
          transition={reduce ? { duration: 0 } : springs.snappy}
          className="inline-flex"
        >
          <ChevronDown className="size-3.5 text-[#9a9a9a]" />
        </motion.span>
        <span className="text-[13px] font-semibold text-[#505050]">Hidden columns</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            key="rollup"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={reduce ? { duration: 0.1 } : springs.smooth}
            className="flex flex-col gap-1"
          >
            {hiddenStatuses.map((status) => (
              <li key={status}>
                <button
                  type="button"
                  onClick={onExpandColumn ? () => onExpandColumn(status) : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg bg-white px-3 py-2.5 shadow-seeko transition',
                    'hover:bg-[#fafafa]',
                  )}
                >
                  <StatusDot status={status} size="md" className="shrink-0" />
                  <span className="text-[13px] font-medium text-[#222222]">{status}</span>
                  <span className="ml-auto text-[12px] tabular-nums text-[#9a9a9a]">
                    {countsByStatus[status] ?? 0}
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}
