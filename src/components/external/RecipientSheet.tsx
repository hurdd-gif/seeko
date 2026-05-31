'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';
import { LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';

// Tabbable elements inside the dialog, for the focus trap. Disabled controls and
// tabindex=-1 are excluded; visibility is filtered at runtime (getClientRects).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Smooth rise with the barest settle — no playful bounce on a legal ceremony.
const SHEET_SPRING = { type: 'spring' as const, visualDuration: 0.42, bounce: 0.06 };
// Asymmetric closes (transitions.dev: close faster than open). The mobile sheet
// slides down on Emil's iOS drawer curve; the desktop dialog accelerates out
// with the app's modal exit (matches MODAL.card.exitTransition in lib/motion).
const DRAWER_EXIT = { duration: 0.3, ease: [0.32, 0.72, 0, 1] as const };
const MODAL_EXIT = { duration: 0.15, ease: [0.4, 0, 1, 1] as const };
// prefers-reduced-motion: opacity only, no rise/scale/slide (every transitions.dev recipe ships this guard).
const REDUCED = { duration: 0.12 };
// Drawer → fullscreen (mobile) / taller card (desktop) on "Continue to sign".
// transitions.dev "Card resize": a height tween on a strong ease-out so the surface
// visibly grows into the signing act. Height-only (mobile is already full-width; the
// desktop card stays width-capped). 200ms (not the 300ms recipe default) — the signer
// pressed "Continue", so the grow must feel immediate, not deliberate; the front-loaded
// curve covers most of the travel in the first ~80ms. Reduced motion snaps — see RESIZE_SNAP.
const CARD_RESIZE = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };
const RESIZE_SNAP = { duration: 0 };

/**
 * SSR/jsdom-safe viewport probe. `mounted` stays false until the first client
 * effect, so the animated sheet is held back one frame and mounts only once the
 * breakpoint is resolved. Without that gate the desktop dialog mounts
 * mobile-first (matchMedia can't run during SSR, so isDesktop starts false then
 * flips post-paint); motion captures the mobile `initial` (y:100%) and, when the
 * flip swaps `animate` to the scale branch, the y key is dropped mid-flight and
 * the dialog strands off-screen at translateY(100%). `mounted` + `isDesktop` are
 * set together so the sheet never observes the flip. Defaults to mobile.
 */
function useViewport() {
  const [state, setState] = useState({ mounted: false, isDesktop: false });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      setState({ mounted: true, isDesktop: false });
      return;
    }
    const mq = window.matchMedia('(min-width: 640px)');
    const sync = () => setState({ mounted: true, isDesktop: mq.matches });
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return state;
}

interface RecipientSheetProps {
  children: ReactNode;
  /**
   * Whether the signer may dismiss the sheet (drag down / tap scrim / close button).
   * Default false → a locked ceremony that can't be swiped away mid-signature.
   * Terminal screens (signed / expired / revoked / not-found) opt in.
   */
  dismissible?: boolean;
  onDismiss?: () => void;
  /**
   * Grow the sheet for the signing act: drawer → fullscreen on mobile, taller
   * card on desktop. Default false → the peek-sized reading drawer. Driven by the
   * signer ceremony's phase; onboarding never sets it.
   */
  expanded?: boolean;
}

/**
 * The signer ceremony's chrome: a bottom sheet on mobile that rises from the
 * edge, and a centered dialog on desktop. One surface, two viewports. Locked by
 * default; terminal screens pass `dismissible`. Wrap in <AnimatePresence> at the
 * call site to animate the exit.
 */
export function RecipientSheet({ children, dismissible = false, onDismiss, expanded = false }: RecipientSheetProps) {
  const { mounted, isDesktop } = useViewport();
  const reduce = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Latest dismiss intent, read by the (stable) keydown handler so the listener
  // never re-subscribes on a new inline onDismiss identity — which would otherwise
  // re-run the focus-in effect and steal focus from an input the signer is typing.
  // Updated in an effect (not during render) so it's concurrent-safe; the handler
  // only reads it on a real keypress, which always fires after commit.
  const dismissRef = useRef<{ dismissible: boolean; onDismiss?: () => void }>({ dismissible, onDismiss });
  useEffect(() => {
    dismissRef.current = { dismissible, onDismiss };
  }, [dismissible, onDismiss]);

  useEffect(() => {
    acquireScrollLock();
    return () => releaseScrollLock();
  }, []);

  // Modal focus management — satisfies the aria-modal contract this dialog asserts.
  // On mount, move focus into the dialog container (it's tabIndex={-1}) so keyboard
  // and screen-reader users land inside the modal instead of on document.body, and
  // trap Tab/Shift+Tab so focus can't escape to the inert page behind the scrim
  // (the scrim blocks pointers when locked but not keyboard focus). Escape closes —
  // but ONLY when dismissible, so the locked verify/review/sign ceremony stays
  // un-escapable. Depends on `mounted` only: the container is focused once when the
  // sheet appears, and the listener is stable (reads dismissRef), so neither steals
  // focus from the inner phases (which self-manage: OTP cell / legal-name input).
  useEffect(() => {
    if (!mounted) return;
    const node = dialogRef.current;
    if (!node) return;
    node.focus();

    function onKeyDown(e: KeyboardEvent) {
      const current = dialogRef.current;
      if (!current) return;
      if (e.key === 'Escape') {
        if (dismissRef.current.dismissible) {
          e.preventDefault();
          dismissRef.current.onDismiss?.();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = Array.from(
        current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.getClientRects().length > 0);
      if (focusables.length === 0) {
        e.preventDefault();
        current.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || active === current || !current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mounted]);

  const dismissOnScrim = dismissible ? onDismiss : undefined;

  // Card-resize targets, resolved against the fixed inset-0 parent (a definite
  // height, so % resolves cleanly and motion can tween auto ↔ %). Expanded: mobile
  // fills the viewport and squares off its top corners so it no longer reads as a
  // drawer; the desktop card keeps its width + radius and just grows taller.
  // Collapsed: natural drawer/card height.
  const sheetHeight = expanded ? (isDesktop ? '94%' : '100%') : 'auto';
  const topRadius = !isDesktop && expanded ? 0 : 28;
  const bottomRadius = isDesktop ? 28 : 0;
  const resize = {
    height: sheetHeight,
    borderTopLeftRadius: topRadius,
    borderTopRightRadius: topRadius,
    borderBottomLeftRadius: bottomRadius,
    borderBottomRightRadius: bottomRadius,
  };
  // Per-property transition: the resize props use the card-resize curve (or snap
  // under reduced motion); the entrance keeps the sheet spring for y/scale/opacity.
  const resizeTransition = reduce
    ? { height: RESIZE_SNAP, borderTopLeftRadius: RESIZE_SNAP, borderTopRightRadius: RESIZE_SNAP, borderBottomLeftRadius: RESIZE_SNAP, borderBottomRightRadius: RESIZE_SNAP }
    : { height: CARD_RESIZE, borderTopLeftRadius: CARD_RESIZE, borderTopRightRadius: CARD_RESIZE, borderBottomLeftRadius: CARD_RESIZE, borderBottomRightRadius: CARD_RESIZE };

  return (
    <div className="overview-light fixed inset-0 z-50 flex flex-col items-center bg-[var(--ov-bg)] sm:justify-center">
      {/* Scrim — inert when the ceremony is locked */}
      <motion.div
        data-testid="sheet-scrim"
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={dismissOnScrim}
        className={cn(
          'absolute inset-0 bg-black/20 backdrop-blur-[2px]',
          dismissOnScrim ? 'cursor-pointer' : 'pointer-events-none',
        )}
      />

      {/* Sheet (mobile) / Dialog (desktop). Held until `mounted` so `initial`
          captures the resolved breakpoint — see useViewport. */}
      {mounted && (
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          // Desktop dialog scales from center; mobile sheet rises from the edge.
          initial={reduce ? { opacity: 0 } : isDesktop ? { opacity: 0, scale: 0.96 } : { y: '100%' }}
          // Rest state is complete and viewport-agnostic (opacity+scale+y) so a
          // mid-flight breakpoint flip can never drop a key and strand the transform.
          // `resize` adds the card-resize target (height + corner radii) so the sheet
          // grows into the signing act; on mount it equals the className values, so
          // only y/scale/opacity animate in — the resize animates later when expanded flips.
          animate={reduce ? { opacity: 1, ...resize } : { opacity: 1, scale: 1, y: 0, ...resize }}
          exit={
            reduce
              ? { opacity: 0, transition: REDUCED }
              : isDesktop
                ? { opacity: 0, scale: 0.96, transition: MODAL_EXIT }
                : { y: '100%', transition: DRAWER_EXIT }
          }
          transition={reduce ? { ...REDUCED, ...resizeTransition } : { ...SHEET_SPRING, ...resizeTransition }}
          drag={dismissible && !isDesktop ? 'y' : false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.6 }}
          onDragEnd={(_e, info) => {
            if (dismissible && (info.offset.y > 100 || info.velocity.y > 300)) onDismiss?.();
          }}
          className={cn(
            'relative mt-auto flex w-full flex-col overflow-hidden bg-white sm:mt-0',
            // Container is programmatically focused on mount (focus move-in for the
            // aria-modal contract) — suppress the default outline on that focus.
            'focus:outline-none',
            // Radii are also driven inline by motion (card-resize); these are the
            // first-paint / no-JS fallback and must match the collapsed targets.
            'rounded-t-[28px] sm:max-w-[420px] sm:rounded-[28px]',
            'shadow-[0_-10px_40px_-12px_rgba(0,0,0,0.18)] sm:shadow-seeko',
            // Collapsed: capped below full height so a dimmed strip of page shows
            // above the sheet — that gap is what reads as a "drawer". Expanded: the
            // cap must not clamp the animated height (mobile fills, desktop → 94dvh).
            expanded ? 'max-h-none sm:max-h-[94dvh]' : 'max-h-[88dvh] sm:max-h-[88dvh]',
          )}
        >
          {/* Drag affordance — gesture hint on dismissible mobile sheets */}
          {dismissible && !isDesktop && (
            <div className="flex shrink-0 justify-center pt-3 pb-1">
              <div className="h-1 w-9 rounded-full bg-black/[0.12]" />
            </div>
          )}

          {/* Accessible close — present on every dismissible sheet/dialog */}
          {dismissible && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close"
              className={cn(
                'absolute right-4 top-4 z-10 flex size-8 items-center justify-center rounded-full bg-black/[0.04] text-[#6e6e6e] transition-colors hover:bg-black/[0.08] active:scale-95',
                LIGHT_FOCUS_RING,
              )}
            >
              <X className="size-4" />
            </button>
          )}

          {/* Scrollable content — the sheet owns padding so screens stay clean */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-8 sm:pt-8">
            {children}
          </div>
        </motion.div>
      )}
    </div>
  );
}
