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
            onClick={() => setExpanded(true)}
          >
            {/* Ghost cards — solid bg cards behind the top card, offset + scaled down */}
            {Array.from({ length: ghostCount }).map((_, i) => {
              const layer = i + 1;
              return (
                <div
                  key={`ghost-${i}`}
                  className="absolute inset-x-0 top-0 px-3 py-1"
                  style={{
                    transform: `translateY(${layer * 8}px) scale(${1 - layer * 0.03})`,
                    zIndex: -layer,
                  }}
                >
                  <div
                    className="rounded-xl border border-border/30 h-[72px]"
                    style={{
                      backgroundColor: `color-mix(in oklch, var(--color-muted), var(--color-card) ${layer * 35}%)`,
                    }}
                  />
                </div>
              );
            })}

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

            {/* Count badge — top right of the stack */}
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={SNAPPY}
              className="absolute top-2 right-4 z-20 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.1] backdrop-blur-sm px-1.5 text-[10px] font-semibold text-muted-foreground"
            >
              +{notification.count - 1}
            </motion.span>

            {/* Extra bottom padding so ghost cards don't overlap next item */}
            <div style={{ height: ghostCount * 8 }} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
