'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
  clamp,
} from 'motion/react';
import { X, CheckCheck, MailOpen } from 'lucide-react';
import { DisplayNotification } from './types';
import { KIND_CONFIG } from './constants';
import { formatTime } from './utils';
import { useDials } from './DialContext';

interface NotificationCardProps {
  notification: DisplayNotification;
  group: string;
  index: number;
  stagger: number;
  onTap: (notif: DisplayNotification) => void;
  onDismiss: (ids: string[]) => void;
  onMarkRead?: (ids: string[]) => void;
  noPadding?: boolean;
  hideClose?: boolean;
}

export function NotificationCard({
  notification,
  group,
  index,
  stagger,
  onTap,
  onDismiss,
  onMarkRead,
  noPadding,
  hideClose,
}: NotificationCardProps) {
  const [hovered, setHovered] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const d = useDials();
  const cfg = KIND_CONFIG[notification.kind] ?? KIND_CONFIG.comment_reply;
  const Icon = cfg.icon;

  const containerRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);
  const itemWidth = useRef(0);
  const swipeStartX = useRef(0);
  const swipeStartOffset = useRef(0);
  const fullSwipeSnapPosition = useRef<'left' | 'right' | null>(null);

  // Core motion values
  const swipeAmount = useMotionValue(0);
  const swipeAmountSpring = useSpring(swipeAmount, d.swipe.spring);

  // ── Dismiss action (right swipe, positive values) ──────────

  // Dismiss background: only visible when swiping right (p > 0)
  const dismissBgColor = useTransform(swipeAmount, (v) => {
    const w = itemWidth.current;
    if (!w || v <= 0) return 'transparent';
    const p = v / w;
    const t = Math.min(p / d.swipe.fullThreshold, 1);
    return t < 0.5 ? d.swipe.dismissBg : d.swipe.dismissBgFull;
  });

  // Dismiss layer opacity: 0 when card is at rest, 1 when swiping right
  const dismissLayerOpacity = useTransform(swipeAmount, (v) => {
    const w = itemWidth.current;
    if (!w || v <= 2) return 0;
    return Math.min(v / (w * 0.1), 1);
  });

  const dismissIconScale = useTransform(swipeAmount, (v) => {
    const w = itemWidth.current;
    if (!w || v <= 0) return 0.6;
    const p = v / w;
    if (p < 0.15) return 0.6 + (p / 0.15) * 0.4;
    if (p > 0.8) return 0.8 + (Math.min(p, 1) - 0.8) * 1;
    return 1;
  });

  // ── Mark-read action (left swipe, negative values) ─────────

  // Read background: only visible when swiping left (p < 0)
  const readBgColor = useTransform(swipeAmount, (v) => {
    const w = itemWidth.current;
    if (!w || v >= 0) return 'transparent';
    const p = Math.abs(v) / w;
    const t = Math.min(p / d.swipe.fullThreshold, 1);
    return t < 0.5 ? d.swipe.readBg : d.swipe.readBgFull;
  });

  // Read layer opacity: 0 when card is at rest, 1 when swiping left
  const readLayerOpacity = useTransform(swipeAmount, (v) => {
    const w = itemWidth.current;
    if (!w || v >= -2) return 0;
    return Math.min(Math.abs(v) / (w * 0.1), 1);
  });

  const readIconScale = useTransform(swipeAmount, (v) => {
    const w = itemWidth.current;
    if (!w || v >= 0) return 0.6;
    const p = Math.abs(v) / w;
    if (p < 0.15) return 0.6 + (p / 0.15) * 0.4;
    if (p > 0.8) return 0.8 + (Math.min(p, 1) - 0.8) * 1;
    return 1;
  });

  // ── Card content feedback (no spring — direct transform) ───

  const cardOpacity = useTransform(swipeAmount, (v) => {
    const w = itemWidth.current;
    if (!w) return 1;
    const p = Math.abs(v) / w;
    // Fade from 1 → 0.4 as swipe reaches 60%
    return Math.max(1 - p * 1.2, 0.4);
  });

  // Pointer event handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      setIsSwiping(true);
      swipeStartX.current = e.clientX;
      swipeStartOffset.current = swipeAmount.get();
    },
    [swipeAmount]
  );

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isSwiping) return;
      const w = itemWidth.current;
      if (!w) return;

      const delta = e.clientX - swipeStartX.current + swipeStartOffset.current;
      const fullThresholdPx = w * d.swipe.fullThreshold;
      const isBeyondFull = Math.abs(delta) > fullThresholdPx;
      const isLeft = delta < 0;

      if (fullSwipeSnapPosition.current) {
        if (Math.abs(delta) < fullThresholdPx) {
          fullSwipeSnapPosition.current = null;
          swipeAmount.set(delta);
        } else {
          const snap = fullSwipeSnapPosition.current === 'left' ? -w : w;
          swipeAmount.set(snap);
        }
        return;
      }

      if (isBeyondFull) {
        fullSwipeSnapPosition.current = isLeft ? 'left' : 'right';
        swipeAmount.set(isLeft ? -w : w);
      } else {
        swipeAmount.set(clamp(-w, w, delta));
      }
    };

    const handlePointerUp = () => {
      if (!isSwiping) return;
      const w = itemWidth.current;
      if (!w) return;

      const current = swipeAmount.get();
      const isFullySwiped = fullSwipeSnapPosition.current;

      if (isFullySwiped) {
        // Commit action — squish animation then execute
        if (containerRef.current) {
          animate([
            [
              containerRef.current,
              {
                scaleY: d.swipe.commitScaleY,
                scaleX: d.swipe.commitScaleX,
                y: d.swipe.commitY,
              },
              { duration: 0.1, ease: 'easeOut' },
            ],
            [
              containerRef.current,
              { scaleY: 1, scaleX: 1, y: 0 },
              { duration: 0.6, type: 'spring' },
            ],
          ]);
        }

        const direction = fullSwipeSnapPosition.current;
        setTimeout(() => {
          if (direction === 'right') {
            onDismiss(notification.ids);
          } else if (direction === 'left' && onMarkRead) {
            onMarkRead(notification.ids);
          }
        }, 150);

        animate(swipeAmount, 0, { duration: 0.5, delay: d.swipe.commitResetDelay });
      } else {
        let target = 0;
        const partialThresholdPx = w * d.swipe.partialThreshold;

        if (Math.abs(current) > partialThresholdPx) {
          target = current > 0
            ? w * d.swipe.partialSnap
            : -w * d.swipe.partialSnap;
        }

        swipeAmount.set(target);
      }

      setIsSwiping(false);
      fullSwipeSnapPosition.current = null;
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isSwiping, swipeAmount, d.swipe, notification.ids, onDismiss, onMarkRead]);

  // Measure width on mount and resize
  useEffect(() => {
    const measure = () => {
      const w = itemRef.current?.getBoundingClientRect().width;
      if (!w) return;
      itemWidth.current = w;

      const raw = swipeAmount.get();
      swipeAmount.jump(raw);
      swipeAmountSpring.jump(raw);
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [swipeAmount, swipeAmountSpring]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: d.card.entranceY }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: d.card.exitX, scale: d.card.exitScale }}
      transition={{ ...d.card.spring, delay: index * stagger }}
      className={noPadding ? '' : 'px-1 py-[3px]'}
    >
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 12,
          touchAction: 'pan-y',
        }}
        onPointerDown={handlePointerDown}
      >
        {/* Swipeable card surface */}
        <motion.div
          ref={itemRef}
          style={{
            position: 'relative',
            zIndex: 10,
            x: swipeAmountSpring,
          }}
        >
          <motion.div style={{ opacity: cardOpacity }}>
            <button
              onClick={() => {
                if (Math.abs(swipeAmount.get()) < 5) {
                  onTap(notification);
                } else {
                  swipeAmount.set(0);
                }
              }}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              className={[
                'relative flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors',
                notification.read
                  ? 'bg-[#212121] hover:bg-[#272727] border border-white/[0.06]'
                  : 'bg-[#2c2c2c] hover:bg-[#333] active:bg-[#383838] border border-white/[0.10]',
              ].join(' ')}
            >
              <div
                className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${
                  notification.read
                    ? 'bg-white/[0.04] text-muted-foreground/50'
                    : `${cfg.bg} ${cfg.className}`
                }`}
              >
                <Icon className="size-3.5" />
              </div>

              <div className="flex-1 min-w-0 pr-5">
                <p
                  className={`text-[13px] leading-snug ${
                    !notification.read
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {notification.title}
                </p>
                {notification.body && (
                  <p
                    className={`text-xs mt-0.5 line-clamp-2 ${
                      notification.read
                        ? 'text-muted-foreground/40'
                        : 'text-muted-foreground/70'
                    }`}
                  >
                    {notification.body}
                  </p>
                )}
                <p
                  className={`text-[11px] mt-1 ${
                    notification.read
                      ? 'text-muted-foreground/30'
                      : 'text-muted-foreground/50'
                  }`}
                >
                  {formatTime(notification.created_at, group)}
                </p>
              </div>

              {!hideClose && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{
                    opacity: hovered ? 1 : 0,
                    scale: hovered ? 1 : 0.8,
                  }}
                  transition={d.bell.spring}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(notification.ids);
                  }}
                  className={[
                    'absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full',
                    'bg-white/[0.08] text-muted-foreground hover:bg-white/[0.15] hover:text-foreground transition-colors',
                    hovered ? 'cursor-pointer' : 'pointer-events-none',
                  ].join(' ')}
                  role="button"
                  aria-label="Dismiss notification"
                >
                  <X className="size-3" />
                </motion.span>
              )}
            </button>
          </motion.div>
        </motion.div>

        {/* Dismiss action — behind card, only visible when swiping right */}
        <motion.div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingLeft: 20,
            backgroundColor: dismissBgColor,
            opacity: dismissLayerOpacity,
            zIndex: 1,
            borderRadius: 12,
            pointerEvents: 'none',
          }}
        >
          <motion.div
            style={{ scale: dismissIconScale }}
            className="flex flex-col items-center gap-1 text-red-400"
          >
            <X className="size-5" />
            <span className="text-[10px] font-medium">Dismiss</span>
          </motion.div>
        </motion.div>

        {/* Mark-read action — behind card, only visible when swiping left */}
        <motion.div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 20,
            backgroundColor: readBgColor,
            opacity: readLayerOpacity,
            zIndex: 1,
            borderRadius: 12,
            pointerEvents: 'none',
          }}
        >
          <motion.div
            style={{ scale: readIconScale }}
            className="flex flex-col items-center gap-1 text-seeko-accent"
          >
            {notification.read ? (
              <>
                <MailOpen className="size-5" />
                <span className="text-[10px] font-medium">Unread</span>
              </>
            ) : (
              <>
                <CheckCheck className="size-5" />
                <span className="text-[10px] font-medium">Read</span>
              </>
            )}
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
