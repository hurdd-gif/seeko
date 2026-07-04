'use client';

import { motion } from 'motion/react';
import type { rowEntrance } from '@/lib/motion';
import { DisplayNotification } from './types';
import { KIND_CONFIG, SNAPPY } from './constants';
import { formatTime } from './utils';
import { useDials } from './DialContext';

interface InboxRowProps {
  notification: DisplayNotification;
  group: string;
  index: number;
  /** Mobile-sheet stagger (s). Ignored when `entrance` is supplied. */
  stagger?: number;
  /**
   * Canonical dropdown entrance — the desktop panel passes `rowEntrance()` so the
   * inbox cascade matches the "More" menu (single source of truth). Omitted on the
   * mobile sheet → falls back to the DialKit-tuned card spring below.
   */
  entrance?: ReturnType<typeof rowEntrance>;
  onTap: (notif: DisplayNotification) => void;
}

export function InboxRow({ notification, group, index, stagger = 0, onTap, entrance }: InboxRowProps) {
  const d = useDials();
  const cfg = KIND_CONFIG[notification.kind] ?? KIND_CONFIG.comment_reply;
  const Icon = cfg.icon;

  // Desktop dropdown hands us a canonical `rowEntrance` (matches the More menu);
  // the mobile sheet supplies none → falls back to the DialKit card spring.
  const enter = entrance ?? {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { ...d.card.spring, delay: index * stagger },
  };

  return (
    <motion.div {...enter} exit={{ opacity: 0 }}>
      <motion.button
        whileHover={{ x: 2 }}
        transition={SNAPPY}
        onClick={() => onTap(notification)}
        className="flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-[#0000000a]"
      >
        <Icon className="size-5 text-[#808080] shrink-0 mt-px" aria-hidden />
        <div className="flex-1 min-w-0">
          <p
            className={`text-[14px] leading-snug tracking-[-0.28px] tabular-nums ${
              !notification.read ? 'font-medium text-[#0d0d0d]' : 'text-[#808080]'
            }`}
          >
            {notification.title}
          </p>
          {notification.body && (
            <p className="text-xs mt-0.5 line-clamp-2 text-[#808080] [text-wrap:pretty]">{notification.body}</p>
          )}
          <p className="text-[11px] mt-1 text-[#808080] tabular-nums">
            {formatTime(notification.created_at, group)}
          </p>
        </div>
      </motion.button>
    </motion.div>
  );
}
