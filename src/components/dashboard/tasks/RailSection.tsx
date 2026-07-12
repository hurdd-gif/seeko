/* ─────────────────────────────────────────────────────────
 * RailSection — collapsible card inside the task detail rail.
 *
 * Each section is its OWN floating shadow-seeko card stacked
 * vertically with a gap between siblings — NOT a slab divided
 * by hairlines. Matches SEEKO's overview tile vocabulary.
 *
 * Header: left-side triangle (▼ open / ▶ closed) + title +
 * optional trailing action ("+ Add", "See all"). The whole
 * header row is clickable to collapse.
 *
 * ANIMATION STORYBOARD
 *
 *    0ms   chevron rotates 0deg (open) ↔ -90deg (closed)
 *    0ms   content height + opacity animate (spring)
 * ───────────────────────────────────────────────────────── */

'use client';

import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

export function RailSection({
  title,
  defaultOpen = true,
  trailing,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  /** Right-aligned action: usually "+ Add" or "See all" link. */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const shouldReduce = useReducedMotion();

  return (
    <section className="overflow-hidden rounded-xl bg-surface-1 shadow-seeko">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="-ml-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-wash-3"
        >
          <motion.span
            animate={{ rotate: open ? 0 : -90 }}
            initial={false}
            transition={shouldReduce ? { duration: 0 } : SPRING}
            className="flex size-3.5 items-center justify-center text-[#b0b0b0]"
          >
            <ChevronDown className="size-3.5" strokeWidth={2.25} />
          </motion.span>
          <span className="text-[14px] font-medium tracking-[-0.01em] text-ink-title">
            {title}
          </span>
        </button>
        {trailing && <span className="ml-auto flex items-center">{trailing}</span>}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={shouldReduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={shouldReduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={shouldReduce ? { duration: 0 } : SPRING}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
