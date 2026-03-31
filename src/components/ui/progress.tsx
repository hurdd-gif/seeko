'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion, useReducedMotion } from 'motion/react';
import { springs } from '@/lib/motion';
import { cn } from '@/lib/utils';

const progressVariants = cva('w-full rounded-full bg-secondary overflow-hidden', {
  variants: {
    size: {
      sm: 'h-1.5',
      default: 'h-2',
      lg: 'h-2.5',
    },
  },
  defaultVariants: { size: 'default' },
});

export interface ProgressBarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressVariants> {
  /** Progress value 0–100 */
  value: number;
  /** Fill color — defaults to seeko-accent */
  color?: string;
  /** Animate the fill with a spring (default true) */
  animated?: boolean;
  /** Delay before animation starts (seconds) */
  delay?: number;
}

function ProgressBar({
  value,
  size,
  color = 'var(--color-seeko-accent)',
  animated = true,
  delay = 0,
  className,
  ...props
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const shouldReduce = useReducedMotion();

  return (
    <div className={cn(progressVariants({ size }), className)} {...props}>
      {animated && !shouldReduce ? (
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ ...springs.gentle, delay }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      ) : (
        <div
          className="h-full rounded-full"
          style={{ backgroundColor: color, width: `${clamped}%` }}
        />
      )}
    </div>
  );
}

export { ProgressBar, progressVariants };
