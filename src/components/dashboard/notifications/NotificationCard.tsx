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
  const cardOpacity = useTransform(x, [0, SWIPE_DISMISS_THRESHOLD], [1, 0.3]);
  const swipeBg = useTransform(x, [0, SWIPE_DISMISS_THRESHOLD], ['rgba(239,68,68,0)', 'rgba(239,68,68,0.12)']);

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
      style={{ x, backgroundColor: swipeBg }}
      drag="x"
      dragConstraints={{ left: 0, right: 200 }}
      dragElastic={0.1}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative"
    >
      <motion.div style={{ opacity: cardOpacity }}>
        <button
          onClick={() => onTap(notification)}
          className={[
            'relative flex w-full items-start gap-3 px-5 py-3 text-left transition-colors',
            'hover:bg-white/[0.03] active:bg-white/[0.05]',
            'border-b border-white/[0.04]',
            notification.read ? 'opacity-45' : '',
          ].join(' ')}
        >
          {/* Icon */}
          <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${cfg.bg} ${cfg.className}`}>
            <Icon className="size-4" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-start gap-2">
              <p className={`text-[13px] leading-snug flex-1 ${!notification.read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {notification.title}
              </p>
              {!notification.read && (
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-seeko-accent" />
              )}
            </div>
            {notification.body && (
              <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-2">{notification.body}</p>
            )}
            <p className="text-[11px] text-muted-foreground/40 mt-1.5">{formatTime(notification.created_at, group)}</p>
          </div>

          {/* Hover-reveal dismiss X */}
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: hovered ? 1 : 0, scale: hovered ? 1 : 0.8 }}
            transition={SNAPPY}
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(notification.ids);
            }}
            className={[
              'absolute top-3 right-4 flex size-6 items-center justify-center rounded-full',
              'bg-white/[0.08] text-muted-foreground hover:bg-white/[0.15] hover:text-foreground transition-colors',
              hovered ? 'cursor-pointer' : 'pointer-events-none',
            ].join(' ')}
            role="button"
            aria-label="Dismiss notification"
          >
            <X className="size-3" />
          </motion.span>
        </button>
      </motion.div>
    </motion.div>
  );
}
