'use client';

import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X } from 'lucide-react';
import { SNAPPY } from './constants';

interface BellToggleProps {
  open: boolean;
  unreadCount: number;
  onClick: () => void;
}

export const BellToggle = forwardRef<HTMLButtonElement, BellToggleProps>(
  function BellToggle({ open, unreadCount, onClick }, ref) {
    return (
      <motion.button
        ref={ref}
        onClick={onClick}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={SNAPPY}
        className="relative flex size-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="x"
              initial={{ opacity: 0, rotate: -90, scale: 0.8 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.8 }}
              transition={SNAPPY}
              className="flex items-center justify-center"
            >
              <X className="size-4" />
            </motion.span>
          ) : (
            <motion.span
              key="bell"
              initial={{ opacity: 0, rotate: 90, scale: 0.8 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: -90, scale: 0.8 }}
              transition={SNAPPY}
              className="flex items-center justify-center"
            >
              <Bell className="size-4" />
            </motion.span>
          )}
        </AnimatePresence>

        {/* Unread badge — only when closed */}
        <AnimatePresence>
          {!open && unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={SNAPPY}
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-seeko-accent px-1 text-[9px] font-bold text-black"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    );
  }
);
