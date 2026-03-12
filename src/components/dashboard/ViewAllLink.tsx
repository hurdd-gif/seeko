'use client';

import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ViewAllLinkProps {
  href: string;
  label: string;
  className?: string;
}

export function ViewAllLink({ href, label, className }: ViewAllLinkProps) {
  const shouldReduce = useReducedMotion();

  return (
    <Link
      href={href}
      className={cn(
        'group mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-transparent py-2 text-sm font-medium text-foreground/40 hover:text-foreground/70 hover:border-border/50 transition-colors',
        className,
      )}
    >
      {label}
      <motion.span
        className="inline-flex"
        whileHover={shouldReduce ? undefined : { x: 3 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </motion.span>
    </Link>
  );
}
