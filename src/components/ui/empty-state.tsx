'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import {
  Activity,
  CheckCircle2,
  CheckSquare,
  CreditCard,
  DollarSign,
  FileText,
  Globe,
  Map,
  TrendingUp,
  Users,
} from 'lucide-react';

export const EMPTY_STATE_ICONS = {
  Activity,
  CheckCircle2,
  CheckSquare,
  CreditCard,
  DollarSign,
  FileText,
  Globe,
  Map,
  TrendingUp,
  Users,
} as const;

export type EmptyStateIconName = keyof typeof EMPTY_STATE_ICONS;

export interface EmptyStateProps {
  icon: EmptyStateIconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Unified empty state: icon + title + optional description + optional CTA.
 * Use across Overview, Team, Activity, Tasks, Docs for consistent empty UX.
 * Accepts an icon name (string) so it can be used from Server Components.
 */
export function EmptyState({ icon: iconName, title, description, action, className }: EmptyStateProps) {
  const Icon = EMPTY_STATE_ICONS[iconName];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={cn(
        'flex flex-col items-center justify-center py-14 text-center',
        className
      )}
    >
      <motion.div
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Icon className="size-12 text-muted-foreground/40" aria-hidden />
      </motion.div>
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1.5 text-xs text-muted-foreground max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}
