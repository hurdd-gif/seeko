'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { NotificationCard } from './NotificationCard';
import { DisplayNotification } from './types';
import { SMOOTH } from './constants';

interface NotificationStackProps {
  notification: DisplayNotification;
  group: string;
  index: number;
  stagger: number;
  onTap: (notif: DisplayNotification) => void;
}

export function NotificationStack({
  notification,
  group,
  index,
  stagger,
  onTap,
}: NotificationStackProps) {
  const [expanded, setExpanded] = useState(false);

  if (notification.count <= 1) {
    return (
      <NotificationCard
        notification={notification}
        group={group}
        index={index}
        stagger={stagger}
        onTap={onTap}
      />
    );
  }

  const children = notification.children ?? [];

  return (
    <div>
      <NotificationCard
        notification={notification}
        group={group}
        index={index}
        stagger={stagger}
        onTap={() => setExpanded(v => !v)}
      />

      <AnimatePresence>
        {expanded && children.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden ml-10 mb-1"
          >
            <div className="border-l border-white/[0.06] pl-2 py-0.5">
              {children.map((child, i) => (
                <NotificationCard
                  key={child.id}
                  notification={child}
                  group={group}
                  index={i}
                  stagger={0.02}
                  onTap={onTap}
                  compact
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
