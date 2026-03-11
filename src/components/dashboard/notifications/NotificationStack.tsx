'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  const [expanded, setExpanded] = useState(false);
  const ghostCount = Math.min(notification.count - 1, 2);

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

  return (
    <motion.div
      layout
      className="relative"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ ...SMOOTH, delay: index * stagger }}
    >
      <AnimatePresence mode="wait">
        {expanded ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SNAPPY}
          >
            {/* Collapse button */}
            <button
              onClick={() => setExpanded(false)}
              className="w-full text-left px-5 py-1"
            >
              <span className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                Collapse {notification.count} items
              </span>
            </button>
            {/* Single expanded card (no ghost) */}
            <NotificationCard
              notification={notification}
              group={group}
              index={0}
              stagger={0}
              onTap={onTap}
              onDismiss={onDismiss}
            />
          </motion.div>
        ) : (
          <motion.div
            key="stacked"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SNAPPY}
            className="relative cursor-pointer"
            onClick={() => setExpanded(true)}
          >
            {/* Ghost cards behind — rendered first (below) */}
            {Array.from({ length: ghostCount }).map((_, i) => (
              <motion.div
                key={`ghost-${i}`}
                className="absolute inset-x-3 top-0 rounded-lg bg-white/[0.03]"
                style={{
                  transform: `translateY(${(i + 1) * 5}px) scale(${1 - (i + 1) * 0.03})`,
                  opacity: 0.6 - i * 0.2,
                  height: 60,
                  zIndex: -1 - i,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }}
              />
            ))}

            {/* Top card */}
            <div className="relative z-10">
              <NotificationCard
                notification={notification}
                group={group}
                index={0}
                stagger={0}
                onTap={() => setExpanded(true)}
                onDismiss={onDismiss}
              />
              {/* Count badge */}
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={SNAPPY}
                className="absolute top-2 right-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.06] px-1.5 text-[10px] font-medium text-muted-foreground/70"
              >
                +{notification.count - 1}
              </motion.span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
