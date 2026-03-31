'use client';

import { forwardRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell } from 'lucide-react';

interface BellToggleProps {
  open: boolean;
  unreadCount: number;
  onClick: () => void;
}

export const BellToggle = forwardRef<HTMLButtonElement, BellToggleProps>(
  function BellToggle({ open, unreadCount, onClick }, ref) {
    return (
      <button
        ref={ref}
        onClick={onClick}
        className="relative flex size-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground active:scale-95 transition-all"
      >
        <Bell className="size-4" />
        <AnimatePresence>
          {!open && unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-seeko-accent px-1 text-[9px] font-bold text-black"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    );
  }
);
