/* ProgressSection — read-only progress bar for the task rail.
 * Admin edit popover is a Phase E follow-up (out of scope this round). */

'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { TaskWithAssignee } from '@/lib/types';

export function ProgressSection({ task }: { task: TaskWithAssignee }) {
  const shouldReduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, task.progress ?? 0));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-[#2a2a2a]">{pct}%</span>
        <span className="text-[12px] text-[#9a9a9a]">
          {pct === 100 ? 'Complete' : pct === 0 ? 'Not started' : 'In progress'}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
        <motion.div
          initial={shouldReduce ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 30 }}
          className="h-full rounded-full bg-[var(--color-seeko-accent)]"
        />
      </div>
    </div>
  );
}
