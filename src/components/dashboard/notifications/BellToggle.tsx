'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import NumberFlow from '@number-flow/react';
import { Inbox, X } from 'lucide-react';
import { useDials } from './DialContext';

/* Contextual icon swap: the two icons cross-fade as one object (absolute,
   overlapping) with scale + blur, spring with zero bounce — instead of the old
   sequential mode="wait" pop. */
const SWAP_SPRING = { type: 'spring' as const, duration: 0.3, bounce: 0 };
const ICON_HIDDEN = { opacity: 0, scale: 0.25, filter: 'blur(4px)' };
const ICON_SHOWN = { opacity: 1, scale: 1, filter: 'blur(0px)' };

/* Digit roll for count changes. Kept under the badge's 700ms pop so a roll
   never outlives an entrance; NumberFlow honors reduced-motion on its own. */
const SPIN_TIMING = { duration: 450, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' };
const XFORM_TIMING = { duration: 350, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' };
const FADE_TIMING = { duration: 175, easing: 'ease-out' };

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
    const reduceMotion = useReducedMotion();
    const swap = reduceMotion ? { duration: 0 } : SWAP_SPRING;

    /* Bump the disc when the count grows while the badge is already showing (a
       fresh arrival). Not on first show — there prev === 0 and the pop IS the
       arrival. Cleared when the tray opens so the bump animation can't hold the
       disc at scale(1) against the close transition. */
    const prevCount = useRef(unreadCount);
    const [bump, setBump] = useState(false);
    useEffect(() => {
      const prev = prevCount.current;
      prevCount.current = unreadCount;
      if (open) {
        setBump(false);
        return;
      }
      if (prev > 0 && unreadCount > prev) setBump(true);
    }, [unreadCount, open]);

    return (
      <motion.button
        ref={ref}
        onClick={onClick}
        aria-label={
          open
            ? 'Close inbox'
            : unreadCount > 0
              ? `Open inbox, ${unreadCount} unread`
              : 'Open inbox'
        }
        aria-expanded={open}
        whileHover={{ scale: d.bell.hoverScale }}
        whileTap={{ scale: d.bell.tapScale }}
        transition={d.bell.spring}
        className={`relative flex size-8 items-center justify-center rounded-full transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          light
            ? 'text-ink-muted hover:bg-[#00000012] dark:hover:bg-wash-4 hover:text-ink-title'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <AnimatePresence initial={false}>
          {open ? (
            <motion.span
              key="x"
              initial={ICON_HIDDEN}
              animate={ICON_SHOWN}
              exit={ICON_HIDDEN}
              transition={swap}
              className="absolute inset-0 flex items-center justify-center"
            >
              <X className="size-4" />
            </motion.span>
          ) : (
            <motion.span
              key="inbox"
              initial={ICON_HIDDEN}
              animate={ICON_SHOWN}
              exit={ICON_HIDDEN}
              transition={swap}
              className="absolute inset-0 flex items-center justify-center"
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
            data-bump={bump ? 'true' : 'false'}
            onAnimationEnd={(e) => {
              if (e.animationName === 't-badge-bump') setBump(false);
            }}
            className="t-badge-dot flex h-4 min-w-4 items-center justify-center rounded-full bg-seeko-accent px-1 text-[9px] font-bold tabular-nums text-black"
          >
            <NumberFlow
              value={Math.min(unreadCount, 99)}
              suffix={unreadCount > 99 ? '+' : undefined}
              transformTiming={XFORM_TIMING}
              spinTiming={SPIN_TIMING}
              opacityTiming={FADE_TIMING}
            />
          </span>
        </span>
      </motion.button>
    );
  }
);
