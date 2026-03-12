'use client';

import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCheck, CheckCircle2, X } from 'lucide-react';
import { SHEET_SPRING, MOBILE_ROW_STAGGER } from './constants';
import { NotificationStack } from './NotificationStack';
import { GroupedNotification, DisplayNotification } from './types';

interface MobileNotificationSheetProps {
  open: boolean;
  grouped: GroupedNotification[];
  isEmpty: boolean;
  unreadCount: number;
  onClose: () => void;
  onMarkAllRead: () => void;
  onTap: (notif: DisplayNotification) => void;
  onDismiss: (ids: string[]) => void;
}

export const MobileNotificationSheet = forwardRef<HTMLDivElement, MobileNotificationSheetProps>(
  function MobileNotificationSheet(
    { open, grouped, isEmpty, unreadCount, onClose, onMarkAllRead, onTap, onDismiss },
    ref
  ) {
    let rowIndex = 0;

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
              className="fixed inset-0 z-[9998]"
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
              className="fixed inset-x-0 bottom-0 z-[9999] flex flex-col rounded-t-2xl overflow-hidden"
              style={{
                backgroundColor: '#1a1a1a',
                maxHeight: '85dvh',
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)',
              }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-9 h-1 rounded-full bg-white/20" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3">
                <h3 className="text-base font-semibold text-foreground">Notifications</h3>
                <div className="flex items-center gap-3">
                  {unreadCount > 0 && (
                    <button
                      onClick={onMarkAllRead}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground active:text-foreground transition-colors"
                    >
                      <CheckCheck className="size-3.5" />
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="flex size-8 items-center justify-center rounded-full bg-white/[0.08] text-muted-foreground active:bg-white/[0.15]"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              {/* Notification list */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
                {isEmpty ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <CheckCircle2 className="size-10 text-muted-foreground/20" />
                    <p className="mt-3 text-sm text-muted-foreground">You&apos;re all caught up</p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {grouped.map((group, gi) => (
                      <div key={group.label} className={gi > 0 ? 'mt-2' : ''}>
                        <div className="px-5 pt-3 pb-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40">
                          {group.label}
                        </div>
                        {group.items.map(notif => {
                          const idx = rowIndex++;
                          return (
                            <NotificationStack
                              key={notif.id}
                              notification={notif}
                              group={group.label}
                              index={idx}
                              stagger={MOBILE_ROW_STAGGER}
                              onTap={onTap}
                              onDismiss={onDismiss}
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
