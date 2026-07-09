'use client';

import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Inbox, X } from 'lucide-react';
import { useDials } from './DialContext';

const MORPH = { duration: 0.1 };

interface BellToggleProps {
  open: boolean;
  unreadCount: number;
  onClick: () => void;
  /**
   * Relight for a light surface (the StudioHeaderActions cluster). Default dark
   * keeps the legacy mounts (PageHeaderUser pill, MobileNav) intact. Needed because
   * the app's `text-foreground`/`text-muted-foreground` tokens are baked dark — on a
   * white bar the dark-mode hover (`text-foreground` ≈ white) renders invisible.
   */
  light?: boolean;
}

export const BellToggle = forwardRef<HTMLButtonElement, BellToggleProps>(
  function BellToggle({ open, unreadCount, onClick, light = false }, ref) {
    const d = useDials();

    return (
      <motion.button
        ref={ref}
        onClick={onClick}
        aria-label={open ? 'Close inbox' : 'Open inbox'}
        aria-expanded={open}
        whileHover={{ scale: d.bell.hoverScale }}
        whileTap={{ scale: d.bell.tapScale }}
        transition={d.bell.spring}
        className={`relative flex size-8 items-center justify-center rounded-full transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          light
            ? 'text-[#808080] hover:bg-[#00000012] hover:text-[#0d0d0d]'
            : 'text-muted-foreground hover:text-foreground'
        }`}
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
              key="inbox"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={MORPH}
              className="flex items-center justify-center"
            >
              <Inbox className="size-4" />
            </motion.span>
          )}
        </AnimatePresence>

        {/*
          Unread badge — transitions.dev slide-in + pop. The badge stays mounted
          so the pop-OUT plays when it hides; `data-open` drives both directions
          (CSS in globals.css under `.t-badge`). Reduced-motion is honored there.
        */}
        <span
          className="t-badge"
          data-open={!open && unreadCount > 0 ? 'true' : 'false'}
          aria-hidden
        >
          <span
            data-testid="Unread badge"
            className="t-badge-dot flex h-4 min-w-4 items-center justify-center rounded-full bg-seeko-accent px-1 text-[9px] font-bold tabular-nums text-black"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        </span>
      </motion.button>
    );
  }
);
