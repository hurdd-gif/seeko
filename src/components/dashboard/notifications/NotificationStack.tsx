'use client';

import { motion } from 'motion/react';
import { SNAPPY, SMOOTH } from './constants';
import { NotificationCard } from './NotificationCard';
import { DisplayNotification } from './types';

interface NotificationStackProps {
  notification: DisplayNotification;
  group: string;
  index: number;
  stagger: number;
  onTap: (notif: DisplayNotification) => void;
  onDismiss: (ids: string[]) => void;
}

export function NotificationStack({
  notification,
  group,
  index,
  stagger,
  onTap,
  onDismiss,
}: NotificationStackProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ ...SMOOTH, delay: index * stagger }}
      className="relative"
    >
      <NotificationCard
        notification={notification}
        group={group}
        index={0}
        stagger={0}
        onTap={onTap}
        onDismiss={onDismiss}
      />

      {/* Count badge for grouped notifications */}
      {notification.count > 1 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={SNAPPY}
          className="absolute top-3.5 right-5 z-20 flex items-center rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          +{notification.count - 1}
        </motion.span>
      )}
    </motion.div>
  );
}
