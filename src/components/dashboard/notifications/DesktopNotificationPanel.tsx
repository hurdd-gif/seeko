'use client';

import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCheck, CheckCircle2 } from 'lucide-react';
import { SMOOTH, ROW_STAGGER } from './constants';
import { NotificationStack } from './NotificationStack';
import { GroupedNotification, DisplayNotification } from './types';

interface DesktopNotificationPanelProps {
  open: boolean;
  grouped: GroupedNotification[];
  isEmpty: boolean;
  unreadCount: number;
  onMarkAllRead: () => void;
  onTap: (notif: DisplayNotification) => void;
  onDismiss: (ids: string[]) => void;
}

export const DesktopNotificationPanel = forwardRef<HTMLDivElement, DesktopNotificationPanelProps>(
  function DesktopNotificationPanel(
    { open, grouped, isEmpty, unreadCount, onMarkAllRead, onTap, onDismiss },
    ref
  ) {
    let rowIndex = 0;

    return (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={SMOOTH}
            className="absolute right-0 top-full mt-3 w-[400px] rounded-2xl border border-white/[0.06] bg-card shadow-2xl z-[9999] overflow-hidden"
            style={{ transformOrigin: 'top right' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
                >
                  <CheckCheck className="size-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="h-px bg-white/[0.06] mx-4" />

            {/* Content */}
            <div className="max-h-[min(500px,70vh)] overflow-y-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {isEmpty ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="size-8 text-muted-foreground/20" />
                  <p className="mt-3 text-sm text-muted-foreground">You&apos;re all caught up</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {grouped.map(group => (
                    <div key={group.label}>
                      <div className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
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
                            stagger={ROW_STAGGER}
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
        )}
      </AnimatePresence>
    );
  }
);
