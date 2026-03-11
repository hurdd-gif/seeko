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
            <button
              onClick={() => setExpanded(false)}
              className="w-full text-left px-6 py-1"
            >
              <span className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                Collapse {notification.count} items
              </span>
            </button>
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
            style={{ paddingBottom: ghostCount * 5 }}
            onClick={() => setExpanded(true)}
          >
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
            </div>

            {/* Ghost cards peeking below — same width as card, offset down */}
            {Array.from({ length: ghostCount }).map((_, i) => (
              <div
                key={`ghost-${i}`}
                className="absolute left-3 right-3 rounded-b-xl bg-white/[0.02] border-x border-b border-white/[0.03]"
                style={{
                  bottom: (ghostCount - 1 - i) * 5,
                  height: 8 + i * 2,
                  zIndex: -1 - i,
                  opacity: 0.7 - i * 0.25,
                }}
              />
            ))}

            {/* Count badge */}
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={SNAPPY}
              className="absolute top-4 right-6 z-20 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.08] px-1.5 text-[10px] font-medium text-muted-foreground/70"
            >
              +{notification.count - 1}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
