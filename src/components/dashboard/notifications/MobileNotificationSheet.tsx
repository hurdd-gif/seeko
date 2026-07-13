'use client';

import { forwardRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCheck, CheckCircle2, X } from 'lucide-react';
import { SHEET_SPRING, MOBILE_ROW_STAGGER } from './constants';
import { InboxRow } from './InboxRow';
import { GroupedNotification, DisplayNotification } from './types';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';

interface MobileNotificationSheetProps {
  open: boolean;
  grouped: GroupedNotification[];
  isEmpty: boolean;
  unreadCount: number;
  onClose: () => void;
  onMarkAllRead: () => void;
  onTap: (notif: DisplayNotification) => void;
}

export const MobileNotificationSheet = forwardRef<HTMLDivElement, MobileNotificationSheetProps>(
  function MobileNotificationSheet(
    { open, grouped, isEmpty, unreadCount, onClose, onMarkAllRead, onTap },
    ref
  ) {
    let rowIndex = 0;

    // Lock scroll when sheet is open
    useEffect(() => {
      if (!open) return;
      acquireScrollLock();
      return () => { releaseScrollLock(); };
    }, [open]);

    return (
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[9998] touch-none"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
              onClick={onClose}
            />
            {/* Sheet */}
            <motion.div
              ref={ref}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={SHEET_SPRING}
              className="fixed inset-x-0 bottom-0 z-[9999] flex flex-col rounded-t-[20px] overflow-hidden shadow-[0_0_0_0.5px_rgba(0,0,0,0.04),0_-8px_28px_rgba(0,0,0,0.12)]"
              style={{
                backgroundColor: '#ffffff',
                maxHeight: '85dvh',
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)',
              }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_e, info) => {
                if (info.offset.y > 100 || info.velocity.y > 300) onClose();
              }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-9 h-1 rounded-full bg-[#0000001f] dark:bg-wash-10" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-[15px] font-medium tracking-[-0.28px] text-ink-title">Inbox</h3>
                <div className="flex items-center gap-3">
                  {unreadCount > 0 && (
                    <button
                      onClick={onMarkAllRead}
                      className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted active:text-ink-title transition-colors"
                    >
                      <CheckCheck className="size-3.5" />
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="flex size-8 items-center justify-center rounded-full bg-wash-5 text-ink-muted active:bg-wash-10"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              <div className="mx-4 h-px bg-wash-5" />

              {/* Notification list */}
              <div
                className="flex-1 overflow-y-auto overscroll-contain touch-auto px-2 [mask-image:linear-gradient(to_bottom,#000_calc(100%-20px),transparent)]"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {isEmpty ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <CheckCircle2 className="size-10 text-[#0000001f] dark:text-ink-ghost" />
                    <p className="mt-3 text-[13px] text-ink-muted">You&apos;re all caught up</p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {grouped.map((group, gi) => (
                      <div key={group.label} className={gi > 0 ? 'mt-1' : ''}>
                        {gi > 0 && <div className="mx-4 mb-1 h-px bg-wash-5" />}
                        <div className="px-4 pt-2 pb-1.5 text-[13px] text-ink-muted">
                          {group.label}
                        </div>
                        {group.items.map((notif) => {
                          const idx = rowIndex++;
                          return (
                            <InboxRow
                              key={notif.id}
                              notification={notif}
                              group={group.label}
                              index={idx}
                              stagger={MOBILE_ROW_STAGGER}
                              onTap={onTap}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }
);
