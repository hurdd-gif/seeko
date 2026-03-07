'use client';

import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const shouldReduce = useReducedMotion();

  if (shouldReduce) return <>{children}</>;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{
          enter: { type: 'spring', stiffness: 300, damping: 25 },
          exit: { duration: 0.15, ease: 'easeOut' },
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
