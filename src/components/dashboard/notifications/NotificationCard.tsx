'use client';

import { motion } from 'motion/react';
import { DisplayNotification } from './types';
import { KIND_CONFIG, SMOOTH } from './constants';
import { formatTime } from './utils';

interface NotificationCardProps {
  notification: DisplayNotification;
  group: string;
  index: number;
  stagger: number;
  onTap: (notif: DisplayNotification) => void;
  /** Compact variant for expanded children inside a stack */
  compact?: boolean;
}

export function NotificationCard({
  notification,
  group,
  index,
  stagger,
  onTap,
  compact,
}: NotificationCardProps) {
  const cfg = KIND_CONFIG[notification.kind] ?? KIND_CONFIG.comment_reply;
  const Icon = cfg.icon;
  const isUnread = !notification.read;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SMOOTH, delay: index * stagger }}
    >
      <button
        onClick={() => onTap(notification)}
        className={[
          'relative flex w-full items-center gap-3 rounded-lg px-3 text-left transition-colors',
          compact ? 'py-2' : 'py-2.5',
          isUnread
            ? 'hover:bg-white/[0.05]'
            : 'hover:bg-white/[0.03]',
        ].join(' ')}
      >
        {/* Unread dot — small, to the left of icon */}
        {isUnread && !compact && (
          <div className="absolute left-1.5 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-seeko-accent" />
        )}

        {/* Icon */}
        <div
          className={`flex shrink-0 items-center justify-center rounded-lg ${
            compact ? 'size-6' : 'size-8'
          } ${
            isUnread
              ? `${cfg.bg} ${cfg.className}`
              : 'bg-white/[0.05] text-muted-foreground/50'
          }`}
        >
          <Icon className={compact ? 'size-3' : 'size-4'} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={`text-[13px] leading-snug truncate ${
                isUnread
                  ? 'font-medium text-foreground'
                  : 'text-foreground/60'
              }`}
            >
              {notification.title}
              {notification.count > 1 && (
                <span className="ml-1.5 inline-flex items-center rounded-md px-1.5 py-px text-[10px] font-medium bg-white/[0.08] text-muted-foreground/70">
                  {notification.count}
                </span>
              )}
            </p>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/35">
              {formatTime(notification.created_at, group)}
            </span>
          </div>
          {notification.body && (
            <p
              className={`text-xs mt-0.5 line-clamp-1 ${
                isUnread
                  ? 'text-muted-foreground/55'
                  : 'text-muted-foreground/35'
              }`}
            >
              {notification.body}
            </p>
          )}
        </div>
      </button>
    </motion.div>
  );
}
