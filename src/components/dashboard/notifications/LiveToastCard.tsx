'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { X } from 'lucide-react';
import { KIND_CONFIG } from './constants';
import { formatTime } from './utils';
import type { LiveToast } from './LiveToastContext';
import { AUTO_DISMISS_MS } from './LiveToastContext';

const SWIPE_THRESHOLD = 60;
const VELOCITY_THRESHOLD = 300;

interface LiveToastCardProps {
  toast: LiveToast;
  onDismiss: (id: string) => void;
  onTap: (toast: LiveToast) => void;
  onPauseTimer: (id: string) => void;
  onResumeTimer: (id: string, ms: number) => void;
}

export function LiveToastCard({
  toast,
  onDismiss,
  onTap,
  onPauseTimer,
  onResumeTimer,
}: LiveToastCardProps) {
  const { notification } = toast;
  const [hovered, setHovered] = useState(false);
  const cfg = KIND_CONFIG[notification.kind] ?? KIND_CONFIG.comment_reply;
  const Icon = cfg.icon;

  const remainingRef = useRef(AUTO_DISMISS_MS);
  const pausedAtRef = useRef<number | null>(null);

  const y = useMotionValue(0);
  const dragOpacity = useTransform(y, [0, 80], [1, 0]);
  const dragScale = useTransform(y, [0, 80], [1, 0.95]);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      if (info.offset.y > SWIPE_THRESHOLD || info.velocity.y > VELOCITY_THRESHOLD) {
        animate(y, 120, { duration: 0.2 }).then(() => {
          onDismiss(toast.id);
        });
      } else {
        animate(y, 0, { type: 'spring', stiffness: 500, damping: 30 });
      }
    },
    [y, onDismiss, toast.id]
  );

  const handleMouseEnter = useCallback(() => {
    setHovered(true);
    pausedAtRef.current = Date.now();
    const elapsed = Date.now() - toast.createdAt;
    remainingRef.current = Math.max(AUTO_DISMISS_MS - elapsed, 1000);
    onPauseTimer(toast.id);
  }, [toast.id, toast.createdAt, onPauseTimer]);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    onResumeTimer(toast.id, remainingRef.current);
    pausedAtRef.current = null;
  }, [toast.id, onResumeTimer]);

  const handleTouchStart = useCallback(() => {
    pausedAtRef.current = Date.now();
    const elapsed = Date.now() - toast.createdAt;
    remainingRef.current = Math.max(AUTO_DISMISS_MS - elapsed, 1000);
    onPauseTimer(toast.id);
  }, [toast.id, toast.createdAt, onPauseTimer]);

  const handleTouchEnd = useCallback(() => {
    if (pausedAtRef.current) {
      onResumeTimer(toast.id, remainingRef.current);
      pausedAtRef.current = null;
    }
  }, [toast.id, onResumeTimer]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      style={{ y }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.1, bottom: 0.6 }}
      onDragEnd={handleDragEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="w-full max-w-[400px] mx-auto touch-none"
    >
      <motion.div style={{ opacity: dragOpacity, scale: dragScale }}>
      <button
        onClick={() => onTap(toast)}
        className={[
          'relative flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors',
          notification.read
            ? 'bg-[#212121] border border-white/[0.06]'
            : 'bg-[#1a1a1a] border border-white/[0.08]',
        ].join(' ')}
        style={{ backdropFilter: 'blur(16px) saturate(180%)', WebkitBackdropFilter: 'blur(16px) saturate(180%)' }}
      >
        {!notification.read && (
          <div className="absolute left-1.5 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-seeko-accent" />
        )}

        <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${cfg.bg} ${cfg.className}`}>
          <Icon className="size-3.5" />
        </div>

        <div className="flex-1 min-w-0 pr-6">
          <p className="text-[13px] leading-snug font-medium text-foreground">
            {notification.title}
          </p>
          {notification.body && (
            <p className="text-xs mt-0.5 line-clamp-1 text-muted-foreground/70">
              {notification.body}
            </p>
          )}
          <p className="text-[11px] mt-1 text-muted-foreground/50">
            {formatTime(notification.created_at, 'Today')}
          </p>
        </div>

        <motion.span
          initial={false}
          animate={{
            opacity: hovered ? 1 : 0.5,
            scale: hovered ? 1 : 0.8,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(toast.id);
          }}
          className={[
            'absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full',
            'bg-white/[0.08] text-muted-foreground hover:bg-white/[0.15] hover:text-foreground transition-colors cursor-pointer',
          ].join(' ')}
          role="button"
          aria-label="Dismiss notification"
        >
          <X className="size-3" />
        </motion.span>
      </button>
      </motion.div>
    </motion.div>
  );
}
