'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
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

  // Single notification — render directly
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
      {/* Summary row — click to expand/collapse */}
      <NotificationCard
        notification={notification}
        group={group}
        index={index}
        stagger={stagger}
        onTap={() => setExpanded(v => !v)}
      />

      {/* Expanded children */}
      <AnimatePresence>
        {expanded && children.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ ...SMOOTH, duration: 0.25 }}
            className="overflow-hidden ml-8 pl-1 border-l border-white/[0.04]"
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
