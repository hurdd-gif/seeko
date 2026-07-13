'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Cookie Notice Card
 *
 *    0ms   page renders, card absent
 *  600ms   card slides up into the bottom-right corner
 *          (y 16 → 0 + fade, smooth spring) — after the
 *          page's own entrance so it never competes with it
 *  click   Got it → acknowledgement persisted, card exits
 *          down-and-out (y 8 + fade, 150ms ease-out)
 * ───────────────────────────────────────────────────────── */

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BTN_PRIMARY, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';
import { springs } from '@/lib/motion';
import { cn } from '@/lib/utils';

/* The card, split out of CookieNotice so that `motion` — the heaviest thing it
 * touches — sits behind a dynamic import instead of in the entry chunk. See
 * CookieNotice.tsx for why the split is shaped this way.
 *
 * `open` lives HERE, not in the gate. The gate answers a question that is fixed
 * for the whole visit ("has this browser ever acknowledged?"); this component
 * owns the dismissal, so AnimatePresence still sees the true → false transition
 * and plays the exit. Persisting the acknowledgement is the gate's job — hence
 * onAcknowledge rather than a localStorage write in here. */
export function CookieNoticeCard({ onAcknowledge }: { onAcknowledge: () => void }) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(true);

  function acknowledge() {
    onAcknowledge();
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          aria-label="Cookie notice"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: reduceMotion ? 0 : 8,
            transition: { duration: 0.15, ease: 'easeOut' },
          }}
          transition={reduceMotion ? { duration: 0.2 } : { ...springs.smooth, delay: 0.6 }}
          // Outline over shadow (user-decided 2026-07-04): a crisp 1px border
          // defines the card against the near-white canvas; no drop shadow.
          // Placement: full-width bottom banner on mobile (a 360px corner card
          // sat on top of the login card's legal footnote below ~sm), corner
          // card from sm up where the two no longer collide.
          className="fixed inset-x-4 bottom-4 z-50 rounded-2xl border border-black/[0.15] bg-white dark:border-hairline dark:bg-overlay p-5 print:hidden sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[min(360px,calc(100vw-40px))]"
        >
          <h2 className="text-sm font-semibold text-ink-title">Cookies</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted-strong">
            SEEKO uses only essential cookies — the ones that keep you signed in.
            They&rsquo;re required for the site to work and can&rsquo;t be switched
            off. No analytics, no advertising, no tracking.{' '}
            <a
              href="/legal/privacy#cookies"
              className={cn(
                'rounded-sm font-medium text-ink-strong underline decoration-black/20 underline-offset-2 transition-colors duration-150 hover:decoration-black/50',
                LIGHT_FOCUS_RING,
              )}
            >
              Cookie details
            </a>
          </p>
          <button
            type="button"
            onClick={acknowledge}
            className={cn(BTN_PRIMARY, LIGHT_FOCUS_RING, 'mt-4 w-full')}
          >
            Got it
          </button>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
