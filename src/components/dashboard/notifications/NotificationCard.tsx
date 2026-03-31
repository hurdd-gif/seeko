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

  // Compact child row — no icon, text only
  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...SMOOTH, delay: index * stagger }}
      >
        <button
          onClick={() => onTap(notification)}
          className="flex w-full items-baseline justify-between gap-3 rounded-md px-3 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
        >
          <p className="text-xs text-foreground/60 truncate">{notification.title}</p>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/30">
            {formatTime(notification.created_at, group)}
          </span>
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SMOOTH, delay: index * stagger }}
    >
      <button
        onClick={() => onTap(notification)}
        className={[
          'relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
          isUnread
            ? 'hover:bg-white/[0.05]'
            : 'hover:bg-white/[0.03]',
        ].join(' ')}
      >
        {/* Icon with optional unread badge */}
        <div className="relative shrink-0">
          <div
            className={`flex size-8 items-center justify-center rounded-lg ${
              isUnread
                ? `${cfg.bg} ${cfg.className}`
                : 'bg-white/[0.05] text-muted-foreground/50'
            }`}
          >
            <Icon className="size-4" />
          </div>
          {isUnread && (
            <div className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-seeko-accent ring-2 ring-[#1a1a1a]" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={`text-[13px] leading-tight truncate ${
                isUnread
                  ? 'font-medium text-foreground'
                  : 'text-foreground/55'
              }`}
            >
              {notification.title}
              {notification.count > 1 && (
                <span className="ml-1.5 inline-flex items-center rounded-md px-1.5 py-px text-[10px] font-medium bg-white/[0.08] text-muted-foreground/60 align-middle">
                  {notification.count}
                </span>
              )}
            </p>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/30">
              {formatTime(notification.created_at, group)}
            </span>
          </div>
          {notification.body && (
            <p
              className={`text-[11px] mt-0.5 line-clamp-1 ${
                isUnread
                  ? 'text-muted-foreground/50'
                  : 'text-muted-foreground/30'
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
