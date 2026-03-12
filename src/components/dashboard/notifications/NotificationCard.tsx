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
  const swipeProgress = useTransform(swipeAmount, (value) => {
    const w = itemWidth.current;
    if (!w) return 0;
    return value / w;
  });

  // Card content visual feedback
  const cardOpacity = useTransform(
    swipeProgress,
    [-0.5, 0, 0.5],
    [0.3, 1, 0.3]
  );
  const cardContentX = useTransform(
    swipeProgress,
    [-0.5, 0, 0.5],
    [40, 0, -40]
  );
  const cardOpacitySpring = useSpring(cardOpacity, d.swipe.spring);
  const cardContentXSpring = useSpring(cardContentX, d.swipe.spring);

  // Action icon elastic motion (dismiss — right side, revealed on right swipe)
  const dismissIconOpacity = useTransform(
    swipeProgress,
    [0, 0.15, 0.5, 0.8, 1],
    [0, 1, 1, 1, 1]
  );
  const dismissIconX = useTransform(
    swipeProgress,
    [0, 0.5, 0.8, 1],
    [0, 0, -16, 0]
  );
  const dismissIconScale = useTransform(
    swipeProgress,
    [0, 0.5, 0.8, 1],
    [1, 1, 0.8, 1]
  );
  const dismissIconOpacitySpr = useSpring(dismissIconOpacity, d.swipe.spring);
  const dismissIconXSpr = useSpring(dismissIconX, d.swipe.spring);
  const dismissIconScaleSpr = useSpring(dismissIconScale, d.swipe.spring);

  // Action icon elastic motion (mark-read — left side, revealed on left swipe)
  const readIconOpacity = useTransform(
    swipeProgress,
    [-1, -0.8, -0.5, -0.15, 0],
    [1, 1, 1, 1, 0]
  );
  const readIconX = useTransform(
    swipeProgress,
    [-1, -0.8, -0.5, 0],
    [0, 16, 0, 0]
  );
  const readIconScale = useTransform(
    swipeProgress,
    [-1, -0.8, -0.5, 0],
    [1, 0.8, 1, 1]
  );
  const readIconOpacitySpr = useSpring(readIconOpacity, d.swipe.spring);
  const readIconXSpr = useSpring(readIconX, d.swipe.spring);
  const readIconScaleSpr = useSpring(readIconScale, d.swipe.spring);

  // Background color based on swipe direction
  const bgColor = useTransform(swipeProgress, (p) => {
    if (p > 0) {
      // Swiping right — dismiss (red)
      const t = Math.min(p / d.swipe.fullThreshold, 1);
      return t < 0.5 ? d.swipe.dismissBg : d.swipe.dismissBgFull;
    } else if (p < 0) {
      // Swiping left — mark read (green)
      const t = Math.min(Math.abs(p) / d.swipe.fullThreshold, 1);
      return t < 0.5 ? d.swipe.readBg : d.swipe.readBgFull;
    }
    return 'transparent';
  });

  // Pointer event handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only respond to primary button / touch
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
        // Already snapped — check if pulling back
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

        // Execute action after brief delay
        const direction = fullSwipeSnapPosition.current;
        setTimeout(() => {
          if (direction === 'right') {
            onDismiss(notification.ids);
          } else if (direction === 'left' && onMarkRead) {
            onMarkRead(notification.ids);
          }
        }, 150);

        // Reset position
        animate(swipeAmount, 0, { duration: 0.5, delay: d.swipe.commitResetDelay });
      } else {
        // Partial swipe — snap to partial reveal or back to center
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

      const currentProgress = swipeProgress.get();
      const newOffset = currentProgress * w;
      swipeAmount.jump(newOffset);
      swipeAmountSpring.jump(newOffset);
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [swipeAmount, swipeAmountSpring, swipeProgress]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: d.card.entranceY }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: d.card.exitX, scale: d.card.exitScale }}
      transition={{ ...d.card.spring, delay: index * stagger }}
      className={noPadding ? '' : 'px-1 py-[3px]'}
    >
      <motion.div
        ref={containerRef}
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 12,
          touchAction: 'none',
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
          <motion.div style={{ opacity: cardOpacitySpring }}>
            <button
              onClick={() => {
                // Only fire tap if not mid-swipe and card is near center
                if (Math.abs(swipeAmount.get()) < 5) {
                  onTap(notification);
                } else {
                  // Tapped while partially revealed — snap back
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

              <motion.div
                className="flex-1 min-w-0 pr-5"
                style={{ x: cardContentXSpring }}
              >
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
              </motion.div>

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

        {/* Action backgrounds — positioned behind the card */}

        {/* Right side: dismiss (revealed when swiping right) */}
        <motion.div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingLeft: 20,
            backgroundColor: bgColor,
            zIndex: 1,
            borderRadius: 12,
          }}
        >
          <motion.div
            style={{
              opacity: dismissIconOpacitySpr,
              x: dismissIconXSpr,
              scale: dismissIconScaleSpr,
              transformOrigin: 'left',
            }}
            className="flex flex-col items-center gap-1 text-red-400"
          >
            <X className="size-5" />
            <span className="text-[10px] font-medium">Dismiss</span>
          </motion.div>
        </motion.div>

        {/* Left side: mark read (revealed when swiping left) */}
        <motion.div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 20,
            backgroundColor: bgColor,
            zIndex: 1,
            borderRadius: 12,
          }}
        >
          <motion.div
            style={{
              opacity: readIconOpacitySpr,
              x: readIconXSpr,
              scale: readIconScaleSpr,
              transformOrigin: 'right',
            }}
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
      </motion.div>
    </motion.div>
  );
}
