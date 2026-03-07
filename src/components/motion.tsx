'use client';

import { motion, useReducedMotion, type Transition } from 'motion/react';
import { type ReactNode } from 'react';

// ── Spring configs ──────────────────────────────────────────────
export const springs = {
  snappy: { type: 'spring', stiffness: 500, damping: 30 } as Transition,
  smooth: { type: 'spring', stiffness: 300, damping: 25 } as Transition,
  gentle: { type: 'spring', stiffness: 200, damping: 20 } as Transition,
};

// ── Stagger variants ────────────────────────────────────────────
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: springs.smooth,
  },
};

// ── Fade + Rise ─────────────────────────────────────────────────
export function FadeRise({
  children,
  delay = 0,
  className,
  y = 20,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const shouldReduce = useReducedMotion();
  if (shouldReduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.smooth, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Fade + Scale (for logos / hero elements) ────────────────────
export function FadeScale({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const shouldReduce = useReducedMotion();
  if (shouldReduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...springs.gentle, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Stagger container + item ────────────────────────────────────
export function Stagger({
  children,
  className,
  staggerMs = 0.08,
  delayMs = 0.1,
}: {
  children: ReactNode;
  className?: string;
  staggerMs?: number;
  delayMs?: number;
}) {
  const shouldReduce = useReducedMotion();

  if (shouldReduce) {
    return <div className={className}>{children}</div>;
  }

  const variants = staggerMs === 0.08 && delayMs === 0.1
    ? staggerContainer
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: staggerMs, delayChildren: delayMs },
        },
      };

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  );
}

// ── Hover-lift card ─────────────────────────────────────────────
export function HoverCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const shouldReduce = useReducedMotion();
  if (shouldReduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={springs.smooth}
      className={className}
    >
      {children}
    </motion.div>
  );
}
