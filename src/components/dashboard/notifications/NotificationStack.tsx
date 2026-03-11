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
  const ghostCount = Math.min(notification.count - 1, 2);

  // Single notification — no stacking
  if (notification.count <= 1) {
    return (
      <NotificationCard
        notification={notification}
        group={group}
        index={index}
        stagger={stagger}
        onTap={onTap}
        onDismiss={onDismiss}
      />
    );
  }

  // Stacked — visual ghost cards below, click navigates normally
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ ...SMOOTH, delay: index * stagger }}
    >
      <div className="relative">
        <NotificationCard
          notification={notification}
          group={group}
          index={0}
          stagger={0}
          onTap={onTap}
          onDismiss={onDismiss}
        />

        {/* Count badge */}
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={SNAPPY}
          className="absolute top-3 right-5 z-20 flex items-center rounded-full bg-white/[0.08] backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          +{notification.count - 1}
        </motion.span>
      </div>

      {/* Ghost card strips peeking below */}
      {Array.from({ length: ghostCount }).map((_, i) => {
        const layer = i + 1;
        return (
          <div
            key={`ghost-${i}`}
            className="px-3 -mt-1 relative"
            style={{ zIndex: -layer }}
          >
            <div
              className="mx-auto rounded-b-lg border-x border-b border-border/30"
              style={{
                width: `${100 - layer * 4}%`,
                height: 6,
                backgroundColor: `color-mix(in oklch, var(--color-muted), var(--color-card) ${layer * 35}%)`,
              }}
            />
          </div>
        );
      })}
    </motion.div>
  );
}
