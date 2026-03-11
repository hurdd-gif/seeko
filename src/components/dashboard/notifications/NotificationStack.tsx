'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Notification Stack
 *
 *  Collapsed  ghost cards stacked behind top card (offset Y, scaled)
 *  Click      ghost cards spring down into full cards (staggered)
 *             badge scales out, "Show less" fades in
 *  Collapse   cards spring back up into stacked position
 * ───────────────────────────────────────────────────────── */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
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

  // Single notification — no stacking needed
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
      {/* Top card — always visible */}
      <div className="relative">
        <NotificationCard
          notification={notification}
          group={group}
          index={0}
          stagger={0}
          onTap={expanded ? onTap : () => setExpanded(true)}
          onDismiss={onDismiss}
        />

        {/* Count badge + expand hint — only when collapsed */}
        <AnimatePresence>
          {!expanded && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={SNAPPY}
              onClick={() => setExpanded(true)}
              className="absolute top-3 right-5 z-20 flex items-center gap-1 rounded-full bg-white/[0.08] backdrop-blur-sm pl-2 pr-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-white/[0.12] transition-colors cursor-pointer"
            >
              +{notification.count - 1}
              <ChevronDown className="size-3" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Ghost cards when collapsed — peek below the top card */}
      <AnimatePresence>
        {!expanded && Array.from({ length: ghostCount }).map((_, i) => {
          const layer = i + 1;
          return (
            <motion.div
              key={`ghost-${i}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 8 }}
              exit={{ opacity: 0, height: 0 }}
              transition={SNAPPY}
              className="px-3 -mt-1 relative"
              style={{ zIndex: -layer }}
            >
              <div
                className="mx-auto rounded-b-lg border-x border-b border-border/30 h-full"
                style={{
                  width: `${100 - layer * 4}%`,
                  backgroundColor: `color-mix(in oklch, var(--color-muted), var(--color-card) ${layer * 35}%)`,
                }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Expanded cards — spring down vertically */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={SMOOTH}
            className="overflow-hidden"
          >
            {/* Duplicate cards to represent the "rest" of the stack */}
            {Array.from({ length: Math.min(notification.count - 1, 2) }).map((_, i) => (
              <motion.div
                key={`expanded-${i}`}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 0.5, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ ...SNAPPY, delay: i * 0.06 }}
              >
                <NotificationCard
                  notification={{ ...notification, read: true }}
                  group={group}
                  index={0}
                  stagger={0}
                  onTap={onTap}
                  onDismiss={onDismiss}
                />
              </motion.div>
            ))}

            {/* Collapse button */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.1 }}
              onClick={() => setExpanded(false)}
              className="w-full flex items-center justify-center gap-1 py-2 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <ChevronDown className="size-3 rotate-180" />
              Show less
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
