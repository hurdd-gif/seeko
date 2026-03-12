'use client';

import { useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'motion/react';
import { X } from 'lucide-react';
import { DisplayNotification } from './types';
import { KIND_CONFIG } from './constants';
import { formatTime } from './utils';
import { useDials } from './DialContext';

interface NotificationCardProps {
  notification: DisplayNotification;
  group: string;
  index: number;
  stagger: number;
  onTap: (notif: DisplayNotification) => void;
  onDismiss: (ids: string[]) => void;
  noPadding?: boolean;
  hideClose?: boolean;
}

export function NotificationCard({
  notification,
  group,
  index,
  stagger,
  onTap,
  onDismiss,
  noPadding,
  hideClose,
}: NotificationCardProps) {
  const [hovered, setHovered] = useState(false);
  const d = useDials();
  const cfg = KIND_CONFIG[notification.kind] ?? KIND_CONFIG.comment_reply;
  const Icon = cfg.icon;

  const x = useMotionValue(0);
  const cardOpacity = useTransform(x, [0, d.card.swipeThreshold], [1, 0.3]);
  const swipeBg = useTransform(x, [0, d.card.swipeThreshold], ['rgba(239,68,68,0)', 'rgba(239,68,68,0.12)']);

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > d.card.swipeThreshold) {
      onDismiss(notification.ids);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: d.card.entranceY }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: d.card.exitX, scale: d.card.exitScale }}
      transition={{ ...d.card.spring, delay: index * stagger }}
      style={{ x, backgroundColor: swipeBg }}
      drag="x"
      dragConstraints={{ left: 0, right: 200 }}
      dragElastic={0.1}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={noPadding ? '' : 'px-1 py-[3px]'}
    >
      <motion.div style={{ opacity: cardOpacity }}>
        <button
          onClick={() => onTap(notification)}
          className={[
            'relative flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors',
            notification.read
              ? 'bg-[#212121] hover:bg-[#272727] border border-white/[0.06]'
              : 'bg-[#2c2c2c] hover:bg-[#333] active:bg-[#383838] border border-white/[0.10]',
          ].join(' ')}
        >
          <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${notification.read ? 'bg-white/[0.04] text-muted-foreground/50' : `${cfg.bg} ${cfg.className}`}`}>
            <Icon className="size-3.5" />
          </div>

          <div className="flex-1 min-w-0 pr-5">
            <p className={`text-[13px] leading-snug ${!notification.read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
              {notification.title}
            </p>
            {notification.body && (
              <p className={`text-xs mt-0.5 line-clamp-2 ${notification.read ? 'text-muted-foreground/40' : 'text-muted-foreground/70'}`}>{notification.body}</p>
            )}
            <p className={`text-[11px] mt-1 ${notification.read ? 'text-muted-foreground/30' : 'text-muted-foreground/50'}`}>{formatTime(notification.created_at, group)}</p>
          </div>

          {!hideClose && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: hovered ? 1 : 0, scale: hovered ? 1 : 0.8 }}
              transition={d.bell.spring}
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(notification.ids);
              }}
              className={[
                'absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full',
                'bg-white/[0.08] text-muted-foreground hover:bg-white/[0.15] hover:text-foreground transition-colors',
                hovered ? 'cursor-pointer' : 'pointer-events-none',
              ].join(' ')}
              role="button"
              aria-label="Dismiss notification"
            >
              <X className="size-3" />
            </motion.span>
          )}
        </button>
      </motion.div>
    </motion.div>
  );
}
