'use client';

/* ─────────────────────────────────────────────────────────
 * RICH TOAST — canonical structured toast anatomy for SEEKO Studio.
 *
 * A dark, Linear/Sonner-style card that stays dark regardless of app theme.
 * Rendered through Sonner via `showRichToast()`; Sonner owns stacking +
 * portal, WE own the timer + enter/exit motion (duration:Infinity) so we can
 * play a real exit before the node is removed.
 *
 * ANATOMY (single left rail — glyph, status circle, and action all align):
 *   ┌────────────────────────────────────────────┐
 *   │ (✓)  Title                              (✕) │  row 1  glyph + title
 *   │      (○)  DIH-29 – Contract_portal          │  row 2  subject (optional)
 *   │      View issue                             │  row 3  action  (optional)
 *   └────────────────────────────────────────────┘
 *
 * MOTION STORYBOARD (read top-to-bottom):
 *     0ms   card enters: y 16→0, scale 0.96→1, opacity 0→1 (spring, origin bottom)
 *     …     auto-dismiss timer runs (pauses on hover)
 *   swipe   drag up past threshold / flick → dismiss
 *   exit    y 0→8, scale 1→0.99, opacity 1→0, blur 0→2px (subtle, less than enter)
 *   reduce  prefers-reduced-motion → opacity only, no transform/blur, snappy
 * ───────────────────────────────────────────────────────── */

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  motion,
  AnimatePresence,
  animate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import { Check, Info, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { springs } from '@/lib/motion';

// ── Tunable values (no magic numbers in JSX) ───────────────────
const DEFAULT_DURATION_MS = 5000;
const SWIPE_THRESHOLD_PX = 56; // upward drag distance to dismiss
const SWIPE_VELOCITY = 320; // px/s upward flick to dismiss
const GLYPH_PX = 22; // leading variant glyph diameter
const RAIL_GAP_PX = 12; // glyph → title gap; also sets the rail inset
const RAIL_INSET_PX = GLYPH_PX + RAIL_GAP_PX; // 34px — one clean vertical rail

// ── Variant → glyph (filled circle + inline icon) ──────────────
const VARIANT_GLYPH: Record<RichToastVariant, { bg: string; Icon: typeof Check }> = {
  success: { bg: '#30c85e', Icon: Check },
  error: { bg: '#f04438', Icon: X },
  info: { bg: '#4b8bf5', Icon: Info },
  warning: { bg: '#f5a623', Icon: TriangleAlert },
};

export type RichToastVariant = 'success' | 'error' | 'info' | 'warning';

export type RichToastSubject = {
  /** Leading status glyph — e.g. <StatusDot status="Todo" size="lg" />. */
  statusIcon?: ReactNode;
  /** Tabular identifier shown before the label, e.g. "DIH-29". */
  identifier?: string;
  /** Human label after the identifier, e.g. "Contract_portal". */
  label: string;
};

export type RichToastAction = {
  label: string;
  /** Real href for semantics + open-in-new-tab; onClick intercepts for SPA nav. */
  href?: string;
  onClick?: () => void;
};

export type RichToastOptions = {
  variant?: RichToastVariant;
  title: string;
  subject?: RichToastSubject;
  action?: RichToastAction;
  /** ms before auto-dismiss (Infinity = sticky). Pauses on hover. */
  duration?: number;
};

function RichToastCard({
  id,
  variant = 'success',
  title,
  subject,
  action,
  duration = DEFAULT_DURATION_MS,
}: RichToastOptions & { id: string | number }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(true);
  const { bg, Icon } = VARIANT_GLYPH[variant];

  // ── Self-managed dismissal (so the exit animation plays before removal) ──
  const close = useCallback(() => setOpen(false), []);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const remainingRef = useRef(duration);
  const startedAtRef = useRef(Date.now());

  const startTimer = useCallback(() => {
    clearTimeout(timerRef.current);
    if (remainingRef.current === Infinity) return;
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(close, remainingRef.current);
  }, [close]);

  const pauseTimer = useCallback(() => {
    clearTimeout(timerRef.current);
    if (remainingRef.current === Infinity) return;
    remainingRef.current = Math.max(remainingRef.current - (Date.now() - startedAtRef.current), 500);
  }, []);

  useEffect(() => {
    startTimer();
    return () => clearTimeout(timerRef.current);
  }, [startTimer]);

  // ── Swipe up to dismiss (matches the top-center enter direction) ──
  const y = useMotionValue(0);
  const dragOpacity = useTransform(y, [-80, 0], [0, 1]);
  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      if (info.offset.y < -SWIPE_THRESHOLD_PX || info.velocity.y < -SWIPE_VELOCITY) {
        animate(y, -140, { duration: 0.18, ease: [0.23, 1, 0.32, 1] }).then(() => toast.dismiss(id));
      } else {
        animate(y, 0, springs.snappy);
      }
    },
    [y, id],
  );

  const handleAction = useCallback(
    (e: React.MouseEvent) => {
      if (action?.onClick && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) {
        e.preventDefault();
        action.onClick();
      }
      close();
    },
    [action, close],
  );

  return (
    <AnimatePresence onExitComplete={() => toast.dismiss(id)}>
      {open && (
        <motion.div
          key="rich-toast"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99, filter: 'blur(2px)' }}
          transition={reduce ? { duration: 0.13, ease: [0.23, 1, 0.32, 1] } : springs.smooth}
          style={{ transformOrigin: 'bottom center' }}
          className="mx-auto w-[400px] max-w-[calc(100vw-2rem)]"
        >
          <motion.div
            style={{ y, opacity: reduce ? 1 : dragOpacity }}
            drag={reduce ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.7, bottom: 0.05 }}
            onDragEnd={handleDragEnd}
            onMouseEnter={pauseTimer}
            onMouseLeave={startTimer}
            className={reduce ? '' : 'touch-none'}
          >
            <div
              role="status"
              className="relative antialiased"
              style={{
                borderRadius: 16,
                padding: 18,
                background: '#1e1e20',
                border: '1px solid rgba(255,255,255,0.09)',
                boxShadow:
                  '0 12px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.35)',
              }}
            >
              {/* Close — top-aligned to the title, lightens + tints on hover */}
              <button
                type="button"
                onClick={close}
                aria-label="Dismiss"
                className="absolute right-[14px] top-4 flex size-6 items-center justify-center rounded-lg text-[#8a8a8a] transition-[color,background-color,transform] duration-150 ease-out hover:bg-white/[0.07] hover:text-[#d4d4d6] active:scale-95 active:bg-white/[0.12] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/30"
              >
                <X className="size-4" strokeWidth={2} />
              </button>

              {/* Row 1 — glyph + title (optically centered as one unit) */}
              <div className="flex items-center" style={{ gap: RAIL_GAP_PX }}>
                <span
                  aria-hidden
                  className="flex shrink-0 items-center justify-center rounded-full text-white"
                  style={{ width: GLYPH_PX, height: GLYPH_PX, background: bg }}
                >
                  <Icon className="size-3.5" strokeWidth={3} />
                </span>
                <p
                  className="font-semibold tracking-[-0.01em] text-[#f4f4f5]"
                  style={{ fontSize: 16, lineHeight: '20px', paddingRight: 24 }}
                >
                  {title}
                </p>
              </div>

              {/* Rows 2–3 — indented to the single rail (34px) */}
              {(subject || action) && (
                <div
                  className="flex flex-col"
                  style={{ paddingLeft: RAIL_INSET_PX, marginTop: 12, rowGap: 12 }}
                >
                  {subject && (
                    <div className="flex items-center gap-2">
                      {subject.statusIcon && <span className="flex shrink-0">{subject.statusIcon}</span>}
                      <span className="text-[#e6e6e8]" style={{ fontSize: 15, fontWeight: 450 }}>
                        {subject.identifier && (
                          <span className="tabular-nums">{subject.identifier}</span>
                        )}
                        {subject.identifier ? ' – ' : ''}
                        {subject.label}
                      </span>
                    </div>
                  )}

                  {action && (
                    <a
                      href={action.href ?? '#'}
                      onClick={handleAction}
                      className="w-fit rounded-sm font-medium text-[#6470f2] underline-offset-2 transition-[color,opacity] duration-150 ease-out hover:text-[#7f89f6] hover:underline active:opacity-80 focus-visible:underline focus-visible:outline-none"
                      style={{ fontSize: 15 }}
                    >
                      {action.label}
                    </a>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Show a structured rich toast. Sonner owns stacking/portal; the card owns its
 * own lifecycle (duration:Infinity + dismissible:false), so we can play the
 * exit before removing the node. `unstyled` + the `seeko-toast-rich` class let
 * the card fully own its look (see the reset in globals.css).
 */
export function showRichToast(options: RichToastOptions): string | number {
  return toast.custom((id) => <RichToastCard id={id} {...options} />, {
    duration: Infinity,
    dismissible: false,
    unstyled: true,
    className: 'seeko-toast-rich',
  });
}
