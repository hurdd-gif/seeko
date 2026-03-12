'use client';

import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X } from 'lucide-react';
import { useDials } from './DialContext';

const MORPH = { duration: 0.1 };

interface BellToggleProps {
  open: boolean;
  unreadCount: number;
  onClick: () => void;
}

export const BellToggle = forwardRef<HTMLButtonElement, BellToggleProps>(
  function BellToggle({ open, unreadCount, onClick }, ref) {
    const d = useDials();

    return (
      <motion.button
        ref={ref}
        onClick={onClick}
        whileHover={{ scale: d.bell.hoverScale }}
        whileTap={{ scale: d.bell.tapScale }}
        transition={d.bell.spring}
        className="relative flex size-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="x"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={MORPH}
              className="flex items-center justify-center"
            >
              <X className="size-4" />
            </motion.span>
          ) : (
            <motion.span
              key="bell"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={MORPH}
              className="flex items-center justify-center"
            >
              <Bell className="size-4" />
            </motion.span>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!open && unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={d.bell.spring}
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
