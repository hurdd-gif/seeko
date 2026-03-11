'use client';

import { useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'motion/react';
import { X } from 'lucide-react';
import { DisplayNotification } from './types';
import { KIND_CONFIG, SNAPPY, SMOOTH, SWIPE_DISMISS_THRESHOLD } from './constants';
import { formatTime } from './utils';

interface NotificationCardProps {
  notification: DisplayNotification;
  group: string;
  index: number;
  stagger: number;
  onTap: (notif: DisplayNotification) => void;
  onDismiss: (ids: string[]) => void;
}

export function NotificationCard({
  notification,
  group,
  index,
  stagger,
  onTap,
  onDismiss,
}: NotificationCardProps) {
  const [hovered, setHovered] = useState(false);
  const cfg = KIND_CONFIG[notification.kind] ?? KIND_CONFIG.comment_reply;
  const Icon = cfg.icon;

  // Drag-to-dismiss
  const x = useMotionValue(0);
  const opacity = useTransform(x, [0, SWIPE_DISMISS_THRESHOLD], [1, 0.3]);
  const bg = useTransform(x, [0, SWIPE_DISMISS_THRESHOLD], ['rgba(239,68,68,0)', 'rgba(239,68,68,0.15)']);

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_DISMISS_THRESHOLD) {
      onDismiss(notification.ids);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ ...SMOOTH, delay: index * stagger }}
      style={{ x, backgroundColor: bg }}
      drag="x"
      dragConstraints={{ left: 0, right: 200 }}
      dragElastic={0.1}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative"
    >
      <motion.div style={{ opacity }}>
        <button
          onClick={() => onTap(notification)}
          className={[
            'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
            'hover:bg-white/[0.04] active:bg-white/[0.06]',
            'rounded-lg',
            notification.read ? 'opacity-50' : '',
          ].join(' ')}
        >
          {/* Unread accent dot */}
          {!notification.read && (
            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-seeko-accent" />
          )}

          {/* Icon */}
          <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${cfg.bg} ${cfg.className}`}>
            <Icon className="size-3.5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className={`text-[13px] leading-snug ${!notification.read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
              {notification.title}
            </p>
            {notification.body && (
              <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2">{notification.body}</p>
            )}
            <p className="text-[10px] text-muted-foreground/40 mt-1">{formatTime(notification.created_at, group)}</p>
          </div>
        </button>
      </motion.div>

      {/* Hover-reveal dismiss X (desktop) */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={SNAPPY}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(notification.ids);
        }}
        className={[
          'absolute right-3 top-3 flex size-5 items-center justify-center rounded-full',
          'bg-white/[0.08] text-muted-foreground hover:bg-white/[0.15] hover:text-foreground transition-colors',
          hovered ? '' : 'pointer-events-none',
        ].join(' ')}
        aria-label="Dismiss notification"
      >
        <X className="size-3" />
      </motion.button>
    </motion.div>
  );
}
