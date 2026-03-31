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

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SMOOTH, delay: index * stagger }}
    >
      <button
        onClick={() => onTap(notification)}
        className={[
          'relative flex w-full items-start gap-3 rounded-lg px-3 text-left transition-colors',
          compact ? 'py-2' : 'py-2.5',
          notification.read
            ? 'hover:bg-white/[0.04]'
            : 'bg-white/[0.03] hover:bg-white/[0.06]',
        ].join(' ')}
      >
        {/* Unread accent bar */}
        {!notification.read && (
          <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-seeko-accent" />
        )}

        {/* Icon */}
        <div
          className={`mt-0.5 flex shrink-0 items-center justify-center rounded-lg ${
            compact ? 'size-6' : 'size-7'
          } ${
            notification.read
              ? 'bg-white/[0.04] text-muted-foreground/40'
              : `${cfg.bg} ${cfg.className}`
          }`}
        >
          <Icon className={compact ? 'size-3' : 'size-3.5'} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={`text-[13px] leading-snug truncate ${
                !notification.read
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground/70'
              }`}
            >
              {notification.title}
              {notification.count > 1 && (
                <span className="ml-1.5 inline-flex items-center rounded px-1 py-px text-[10px] font-medium bg-white/[0.06] text-muted-foreground/60">
                  {notification.count}
                </span>
              )}
            </p>
            <span
              className={`shrink-0 text-[11px] tabular-nums ${
                notification.read
                  ? 'text-muted-foreground/25'
                  : 'text-muted-foreground/45'
              }`}
            >
              {formatTime(notification.created_at, group)}
            </span>
          </div>
          {notification.body && (
            <p
              className={`text-xs mt-0.5 line-clamp-1 ${
                notification.read
                  ? 'text-muted-foreground/30'
                  : 'text-muted-foreground/60'
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
