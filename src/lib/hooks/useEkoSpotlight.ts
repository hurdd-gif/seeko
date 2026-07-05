'use client';

/**
 * useEkoSpotlight — board-side consumer of the EKO bus spotlight event.
 *
 * Attach `ref` to a task card and pass the card's identity. When EKO's
 * post-write receipt asks for this task (live event or pending claim after a
 * navigation), the card scrolls into view and gets the `eko-spotlight` class
 * for the pulse defined in globals.css. Under prefers-reduced-motion the CSS
 * renders a static ring instead and scrolling is instant.
 */

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import {
  restoreEkoSpotlight,
  subscribeEkoBus,
  tryClaimEkoSpotlight,
  type EkoTaskRef,
} from '@/lib/eko-bus';

/** Matches the `eko-spotlight` animation in globals.css: 2 pulses (~1.2s) + 3s ring fade. */
const SPOTLIGHT_TOTAL_MS = 4200;
/** Reduced motion: static ring, held long enough to register, no animation. */
const SPOTLIGHT_REDUCED_MS = 2600;

export function useEkoSpotlight<T extends HTMLElement>(target: EkoTaskRef): {
  ref: React.RefObject<T | null>;
  spotlit: boolean;
} {
  const ref = useRef<T | null>(null);
  const [spotlit, setSpotlit] = useState(false);
  const reduceMotion = useReducedMotion();
  const timerRef = useRef<number | undefined>(undefined);
  const rafRef = useRef<number | undefined>(undefined);
  /** The claim this instance holds while its pulse is still running. */
  const heldClaimRef = useRef<EkoTaskRef | null>(null);

  // Primitive dep key so the effect tracks identity, not object identity.
  const targetKey = `${target.id ?? ''}|${target.taskNumber ?? ''}|${target.name ?? ''}`;

  useEffect(() => {
    const [id, taskNumber, name] = targetKey.split('|');
    const candidate: EkoTaskRef = {
      id: id || undefined,
      taskNumber: taskNumber ? Number(taskNumber) : undefined,
      name: name || undefined,
    };

    const claim = (): boolean => {
      if (!tryClaimEkoSpotlight(candidate)) return false;
      heldClaimRef.current = candidate;
      return true;
    };

    const activate = () => {
      ref.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
        inline: 'nearest',
      });
      // Drop the class for one frame so a re-trigger restarts the CSS animation.
      setSpotlit(false);
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => setSpotlit(true));
      });
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        heldClaimRef.current = null; // pulse finished — nothing to hand back
        setSpotlit(false);
      }, reduceMotion ? SPOTLIGHT_REDUCED_MS : SPOTLIGHT_TOTAL_MS);
    };

    // Mount claim — covers "receipt clicked on another page, then navigated here".
    if (claim()) activate();

    // Live claim — covers "receipt clicked while the board is already open".
    const unsubscribe = subscribeEkoBus((event) => {
      if (event.type === 'spotlight' && claim()) activate();
    });

    return () => {
      unsubscribe();
      window.clearTimeout(timerRef.current);
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
      // StrictMode-safe: dev double-invokes mount effects, cancelling the rAF
      // above before the class ever lands. If this instance still holds an
      // unfinished claim, hand it back so the effect re-run (or the next
      // matching mount) can claim and finish the pulse.
      if (heldClaimRef.current) {
        restoreEkoSpotlight(heldClaimRef.current);
        heldClaimRef.current = null;
      }
    };
  }, [targetKey, reduceMotion]);

  return { ref, spotlit };
}
