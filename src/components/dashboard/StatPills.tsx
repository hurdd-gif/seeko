'use client';

import { motion, useReducedMotion } from 'motion/react';
import { CheckSquare } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { springs } from '@/lib/motion';

interface Pill {
  label: string;
  count: number;
  variant: 'danger' | 'accent' | 'muted';
  href?: string;
}

const VARIANT_STYLES = {
  danger: 'border-red-500/20 bg-red-500/[0.06] text-red-400',
  accent: 'border-seeko-accent/20 bg-seeko-accent/[0.06] text-seeko-accent',
  muted: 'border-border text-muted-foreground',
} as const;


export function StatPills({
  pills,
  delayMs = 0.08,
  staggerMs = 0.04,
}: {
  pills: Pill[];
  delayMs?: number;
  staggerMs?: number;
}) {
  const shouldReduce = useReducedMotion();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pills.map((pill, i) => {
        const style = VARIANT_STYLES[pill.variant];
        const inner = (
          <>
            {pill.variant === 'accent' && <CheckSquare className="size-3" />}
            {pill.count} {pill.label}
          </>
        );
        const className = cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
          style,
          pill.href && 'transition-colors hover:bg-seeko-accent/[0.12]',
        );

        const motionProps = shouldReduce ? {} : {
          initial: { opacity: 0, scale: 0.8, y: 8 },
          animate: { opacity: 1, scale: 1, y: 0 },
          transition: { ...springs.snappy, delay: delayMs + i * staggerMs },
        };

        if (pill.href) {
          return (
            <motion.div key={pill.label} {...motionProps}>
              <Link href={pill.href} className={className}>
                {inner}
              </Link>
            </motion.div>
          );
        }

        return (
          <motion.span key={pill.label} className={className} {...motionProps}>
            {inner}
          </motion.span>
        );
      })}
    </div>
  );
}
