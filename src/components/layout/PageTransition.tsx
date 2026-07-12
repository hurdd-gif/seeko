'use client';

import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { usePathname } from '@/lib/react-router-adapters';
import { type ReactNode } from 'react';
import { springs } from '@/lib/motion';

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const shouldReduce = useReducedMotion();

  if (shouldReduce) return <>{children}</>;

  return (
    <>
      {/* Light floor: every dashboard page paints a `fixed inset-0 z-40` LightShell
          overlay, but AnimatePresence `mode="wait"` fades the outgoing page out before
          the incoming one fades in. During that gap both overlays are transparent and
          the dark layout `bg-background` showed through (the dark flash). This floor sits
          below the z-40 overlay — invisible in steady state, light during the gap. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[#eeeeee] dark:bg-[oklch(0.240_0_0)]" />
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: 'easeOut' } }}
          transition={springs.smooth}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
