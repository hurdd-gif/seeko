'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Activity, UserPlus, CheckSquare, FileText, Pencil, MessageSquare, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { springs } from '@/lib/motion';

const ICON_MAP: Record<string, typeof Activity> = {
  assigned: UserPlus,
  completed: CheckSquare,
  created: FileText,
  updated: Pencil,
  commented: MessageSquare,
  deleted: Trash2,
  started: Activity,
  'moved to review': Activity,
};

interface ActivityFeedItemProps {
  name: string;
  action: string;
  target: string;
  time: string;
  actionKey: string;
  iconClassName: string;
  iconBg: string;
}

export function ActivityFeedItem({ name, action, target, time, actionKey, iconClassName, iconBg }: ActivityFeedItemProps) {
  const shouldReduce = useReducedMotion();
  const Icon = ICON_MAP[actionKey] ?? Activity;

  return (
    <motion.div
      whileHover={shouldReduce ? undefined : { backgroundColor: 'rgba(255,255,255,0.03)' }}
      transition={springs.snappy}
      className="flex items-start gap-2.5 rounded-lg px-2 py-2 -mx-2 cursor-default"
    >
      <div className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', iconBg, iconClassName)}>
        <Icon className="size-3" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-snug">
          <span className="font-medium">{name}</span>{' '}
          <span className="text-muted-foreground">{action}</span>
        </p>
        <p className="text-xs text-muted-foreground/70 truncate">{target}</p>
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground/50 mt-0.5 tabular-nums">{time}</span>
    </motion.div>
  );
}
