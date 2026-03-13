'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useLiveToast, MAX_VISIBLE } from './LiveToastContext';
import { LiveToastCard } from './LiveToastCard';
import type { LiveToast } from './LiveToastContext';

interface LiveToastContainerProps {
  onTapToast: (toast: LiveToast) => void;
  onOpenPanel: () => void;
}

export function LiveToastContainer({ onTapToast, onOpenPanel }: LiveToastContainerProps) {
  const { toasts, overflowCount, dismissToast, pauseTimer, resumeTimer } = useLiveToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const visibleToasts = toasts.slice(-MAX_VISIBLE);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-0 inset-x-0 z-[9997] flex flex-col items-center pointer-events-none"
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      {/* Overflow pill */}
      <AnimatePresence>
        {overflowCount > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            onClick={onOpenPanel}
            className="pointer-events-auto mb-2 px-3 py-1.5 rounded-full bg-card border border-border/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors shadow-lg shadow-black/20 cursor-pointer"
          >
            +{overflowCount} more
          </motion.button>
        )}
      </AnimatePresence>

      {/* Toast stack */}
      <div className="w-full max-w-[400px] flex flex-col gap-2 pointer-events-auto">
        <AnimatePresence mode="popLayout">
          {visibleToasts.map(toast => (
            <LiveToastCard
              key={toast.id}
              toast={toast}
              onDismiss={dismissToast}
              onTap={onTapToast}
              onPauseTimer={pauseTimer}
              onResumeTimer={resumeTimer}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>,
    document.body
  );
}
